// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import {
    pinnedAppItemKey,
    pinnedFolderItemKey,
} from './startMenuPinnedModel.js';
import {
    animateStartMenuFolderAbsorb,
    animateStartMenuItemReflow,
} from './startMenuItemAnimations.js';

const FOLDER_DROP_RESTORE_TIME = 120;

export class StartMenuPinnedDragController {
    constructor(pinnedModel, params) {
        this._pinnedModel = pinnedModel;
        this._columns = params.columns;
        this._tileWidth = params.tileWidth;
        this._closeContextMenu = params.closeContextMenu;
        this._defaultFolderName = params.defaultFolderName;
        this._onChanged = params.onChanged;
        this._onMoveOut = params.onMoveOut;
        this._draggables = new Map();
        this._folderDropTarget = null;
        this._folderDropActors = new Set();
        this._moveOutButton = null;
    }

    attachGrid(grid, folderId = null) {
        grid._startMenuFolderId = folderId;
        grid._delegate = {
            handleDragOver: (source, _actor, x, y) =>
                this._handleDragOver(grid, source, x, y),
            acceptDrop: (source, _actor, x, y) =>
                this._acceptDrop(grid, source, x, y),
        };
    }

    attachMoveOutTarget(button) {
        this._moveOutButton = button;
        button._delegate = {
            handleDragOver: source => this._canMoveOut(source)
                ? DND.DragMotionResult.MOVE_DROP
                : DND.DragMotionResult.CONTINUE,
            acceptDrop: source => {
                if (!this._canMoveOut(source))
                    return false;

                const folderId = source._pinnedGrid._startMenuFolderId;
                const folder = this._pinnedModel.getFolder(folderId);
                const remainingAppId = folder.appIds.length === 2
                    ? folder.appIds.find(id => id !== source._pinnedAppId)
                    : null;
                if (!this._pinnedModel.moveAppOutOfFolder(
                    source._pinnedAppId,
                    folderId
                )) {
                    return false;
                }

                source._dropAccepted = true;
                this._onMoveOut({
                    type: 'move-out',
                    appId: source._pinnedAppId,
                    folderId,
                    folderCollapsed: Boolean(remainingAppId),
                    remainingAppId,
                    sourceButton: null,
                });
                return true;
            },
        };
    }

    makeDraggable(button, icon, app, grid) {
        const appId = app.get_id();
        const itemKey = grid._startMenuFolderId
            ? appId
            : pinnedAppItemKey(appId);
        this._makePinnedDraggable(button, icon, grid, {
            app,
            appId,
            folderId: null,
            itemKey,
            itemType: 'app',
            getDragActor: () => app.create_icon_texture(40),
        });
    }

    makeFolderDraggable(button, icon, folderId, grid) {
        this._makePinnedDraggable(button, icon, grid, {
            app: null,
            appId: null,
            folderId,
            itemKey: pinnedFolderItemKey(folderId),
            itemType: 'folder',
            getDragActor: () => new Clutter.Clone({
                source: icon,
                width: 40,
                height: 40,
            }),
        });
    }

    makeTaskbarDraggable(button, icon, app, onDropAccepted) {
        const dragSource = {
            app,
            _startMenuTaskbarApp: true,
            _taskbarDropAccepted: false,
            _taskbarDropTarget: null,
            _clearTaskbarDropTarget: () => {},
            getDragActor: () => app.create_icon_texture(40),
            getDragActorSource: () => icon,
        };
        button._delegate = dragSource;

        const entry = this._trackDraggable(button);
        const draggable = DND.makeDraggable(button, {
            timeoutThreshold: 200,
            dragActorMaxSize: 48,
        });
        button._startMenuTaskbarDraggable = draggable;
        entry.draggable = draggable;
        entry.handlerIds = [
            draggable.connect('drag-begin', () => {
                dragSource._taskbarDropAccepted = false;
                button.opacity = 96;
                this._closeContextMenu();
            }),
            draggable.connect('drag-end', () => {
                dragSource._clearTaskbarDropTarget();
                dragSource._taskbarDropTarget = null;
                dragSource._clearTaskbarDropTarget = () => {};
                button.opacity = 255;
                if (dragSource._taskbarDropAccepted)
                    onDropAccepted();
                dragSource._taskbarDropAccepted = false;
            }),
        ];
    }

    _makePinnedDraggable(button, icon, grid, data) {
        const dragSource = {
            app: data.app,
            _pinnedTile: button,
            _pinnedGrid: grid,
            _pinnedAppId: data.appId,
            _pinnedFolderId: data.folderId,
            _pinnedItemKey: data.itemKey,
            _pinnedItemType: data.itemType,
            _originalOrder: null,
            _dropAccepted: false,
            _folderChange: null,
            getDragActor: data.getDragActor,
            getDragActorSource: () => icon,
        };
        button._delegate = dragSource;
        button._startMenuPinnedItemKey = data.itemKey;
        button._startMenuPinnedItemType = data.itemType;
        button._startMenuPinnedAppId = data.appId;
        button._startMenuPinnedFolderId = data.folderId;
        button._startMenuFolderDropActor = icon;
        icon.set_pivot_point(0.5, 0.5);

        const entry = this._trackDraggable(button);
        const draggable = DND.makeDraggable(button, {
            timeoutThreshold: 200,
            dragActorMaxSize: 48,
        });
        button._startMenuDraggable = draggable;
        entry.draggable = draggable;
        entry.handlerIds = [
            draggable.connect('drag-begin', () => {
                this._resetFolderDropActors();
                dragSource._originalOrder = this._gridTiles(grid)
                    .map(tile => tile._startMenuPinnedItemKey);
                dragSource._dropAccepted = false;
                button.opacity = 96;
                this._closeContextMenu();
            }),
            draggable.connect('drag-end', () => {
                this._clearFolderDropTarget(false);
                this._resetFolderDropActors();
                button.opacity = 255;
                if (dragSource._folderChange) {
                    const change = dragSource._folderChange;
                    dragSource._folderChange = null;
                    animateStartMenuFolderAbsorb(
                        change.sourceActor,
                        change.targetActor,
                        () => this._onChanged(change)
                    );
                } else if (!dragSource._dropAccepted) {
                    this._restoreOrder(grid, dragSource);
                }
                dragSource._originalOrder = null;
                dragSource._dropAccepted = false;
            }),
        ];
    }

    // GNOME 48's _Draggable connects its own actor 'destroy' handler that
    // calls disconnectAll(). Destroy handlers run in connection order, so
    // this must be connected before DND.makeDraggable(); otherwise
    // _releaseDraggable() disconnects ids that are already gone and throws
    // during teardown, which left the extension unable to enable again.
    // GNOME 49 and 50 attach a gesture action and connect nothing.
    _trackDraggable(button) {
        const entry = {draggable: null, handlerIds: [], destroyId: 0};
        entry.destroyId = button.connect(
            'destroy',
            () => this._releaseDraggable(button)
        );
        this._draggables.set(button, entry);
        return entry;
    }

    _releaseDraggable(button) {
        if (this._folderDropTarget === button)
            this._clearFolderDropTarget(false);
        const dropActor = button._startMenuFolderDropActor;
        if (dropActor) {
            dropActor.remove_all_transitions();
            dropActor.scale_x = 1;
            dropActor.scale_y = 1;
            this._folderDropActors.delete(dropActor);
        }
        const entry = this._draggables.get(button);
        for (const handlerId of entry.handlerIds)
            entry.draggable.disconnect(handlerId);
        button.disconnect(entry.destroyId);
        button._delegate = null;
        button._startMenuFolderDropActor = null;
        this._draggables.delete(button);
    }

    destroy() {
        this._clearFolderDropTarget(false);
        this._resetFolderDropActors();
        for (const button of [...this._draggables.keys()])
            this._releaseDraggable(button);
        this._moveOutButton._delegate = null;
        this._moveOutButton = null;
        this._folderDropActors = null;
        this._draggables = null;
        this._pinnedModel = null;
        this._closeContextMenu = null;
        this._defaultFolderName = null;
        this._onChanged = null;
        this._onMoveOut = null;
    }

    _handleDragOver(grid, source, x, y) {
        if (!this._validSource(grid, source))
            return DND.DragMotionResult.CONTINUE;

        const folderTarget = this._folderTargetAt(grid, source, x, y);
        if (folderTarget) {
            this._setFolderDropTarget(folderTarget);
            return DND.DragMotionResult.MOVE_DROP;
        }

        this._clearFolderDropTarget();
        this._moveTileToPointer(grid, source, x, y);
        return DND.DragMotionResult.MOVE_DROP;
    }

    _acceptDrop(grid, source, x, y) {
        if (!this._validSource(grid, source))
            return false;

        const folderTarget = this._folderTargetAt(grid, source, x, y);
        if (folderTarget) {
            const targetIsFolder =
                folderTarget._startMenuPinnedItemType === 'folder';
            const folderId = targetIsFolder
                ? folderTarget._startMenuPinnedFolderId
                : this._pinnedModel.createFolder(
                    source._pinnedAppId,
                    folderTarget._startMenuPinnedAppId,
                    this._defaultFolderName
                );
            const changed = targetIsFolder
                ? this._pinnedModel.moveAppToFolder(
                    source._pinnedAppId,
                    folderId
                )
                : Boolean(folderId);
            this._clearFolderDropTarget(false);
            if (!changed)
                return false;

            source._dropAccepted = true;
            source._folderChange = {
                type: targetIsFolder ? 'folder-add' : 'folder-create',
                appId: source._pinnedAppId,
                folderId,
                sourceActor: source._pinnedTile._startMenuFolderDropActor,
                targetActor: folderTarget._startMenuFolderDropActor,
            };
            return true;
        }

        this._moveTileToPointer(grid, source, x, y);
        const visibleOrder = this._gridTiles(grid)
            .map(tile => tile._startMenuPinnedItemKey);
        if (grid._startMenuFolderId) {
            this._pinnedModel.reorderFolderApps(
                grid._startMenuFolderId,
                visibleOrder
            );
        } else {
            this._pinnedModel.reorderVisibleItems(visibleOrder);
        }
        this._onChanged();
        source._dropAccepted = true;
        return true;
    }

    _validSource(grid, source) {
        const tile = source?._pinnedTile;
        return Boolean(tile && source._pinnedGrid === grid &&
            grid.contains(tile));
    }

    _canMoveOut(source) {
        return Boolean(
            source &&
            source._pinnedItemType === 'app' &&
            source._pinnedGrid &&
            source._pinnedGrid._startMenuFolderId
        );
    }

    _folderTargetAt(grid, source, x, y) {
        if (grid._startMenuFolderId || source._pinnedItemType !== 'app')
            return null;

        const sourceTile = source._pinnedTile;
        for (const row of grid.get_children()) {
            for (const tile of row.get_children()) {
                if (tile === sourceTile || !tile._startMenuPinnedItemKey)
                    continue;

                const left = row.x + tile.x;
                const top = row.y + tile.y;
                const insetX = tile.width * 0.22;
                const insetY = tile.height * 0.22;
                if (x >= left + insetX &&
                    x <= left + tile.width - insetX &&
                    y >= top + insetY &&
                    y <= top + tile.height - insetY) {
                    return tile;
                }
            }
        }
        return null;
    }

    _setFolderDropTarget(target) {
        if (this._folderDropTarget === target)
            return;

        this._clearFolderDropTarget();
        this._folderDropTarget = target;
        target.add_style_class_name(
            'simple-taskbar-windows-start-folder-drop-target'
        );
        if (target._startMenuPinnedItemType !== 'app')
            return;

        const actor = target._startMenuFolderDropActor;
        this._folderDropActors.add(actor);
        actor.remove_all_transitions();
        actor.ease({
            scale_x: 0.72,
            scale_y: 0.72,
            duration: 90,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._folderDropTarget !== target)
                    return;
                actor.ease({
                    scale_x: 0.78,
                    scale_y: 0.78,
                    duration: 90,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            },
        });
    }

    _clearFolderDropTarget(animate = true) {
        if (!this._folderDropTarget)
            return;

        const target = this._folderDropTarget;
        target.remove_style_class_name(
            'simple-taskbar-windows-start-folder-drop-target'
        );
        this._folderDropTarget = null;
        if (target._startMenuPinnedItemType !== 'app')
            return;

        const actor = target._startMenuFolderDropActor;
        actor.remove_all_transitions();
        if (!animate) {
            actor.scale_x = 1;
            actor.scale_y = 1;
            return;
        }
        actor.ease({
            scale_x: 1,
            scale_y: 1,
            duration: FOLDER_DROP_RESTORE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _restoreFolderDropActors() {
        for (const actor of this._folderDropActors) {
            actor.remove_all_transitions();
            actor.ease({
                scale_x: 1,
                scale_y: 1,
                duration: FOLDER_DROP_RESTORE_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    _resetFolderDropActors() {
        for (const actor of this._folderDropActors) {
            actor.remove_all_transitions();
            actor.scale_x = 1;
            actor.scale_y = 1;
        }
        this._folderDropActors.clear();
    }

    _moveTileToPointer(grid, source, x, y) {
        const tile = source._pinnedTile;
        const tiles = this._gridTiles(grid);
        const sourceIndex = tiles.indexOf(tile);
        if (sourceIndex < 0)
            return;

        const rows = grid.get_children();
        let rowIndex = rows.findIndex(row => y < row.y + row.height);
        if (rowIndex < 0)
            rowIndex = rows.length - 1;
        rowIndex = Math.max(0, rowIndex);

        const row = rows[rowIndex];
        const slots = row.get_children();
        let columnIndex = slots.findIndex(slot =>
            x < row.x + slot.x + slot.width / 2
        );
        if (columnIndex < 0)
            columnIndex = slots.length;

        const rawIndex = rowIndex * this._columns + columnIndex;
        let targetIndex = rawIndex;
        if (rawIndex > sourceIndex)
            targetIndex--;
        targetIndex = Math.clamp(targetIndex, 0, tiles.length - 1);
        if (targetIndex === sourceIndex)
            return;

        tiles.splice(sourceIndex, 1);
        tiles.splice(targetIndex, 0, tile);
        this._reflowGrid(grid, tiles, tile);
    }

    _gridTiles(grid) {
        return grid.get_children().flatMap(row =>
            row.get_children().filter(child =>
                Boolean(child._startMenuPinnedItemKey)
            )
        );
    }

    _reflowGrid(grid, tiles, draggedTile = null) {
        const rows = grid.get_children();
        const oldPositions = new Map(tiles.map(tile => [
            tile,
            tile.get_transformed_position(),
        ]));
        const slotPositions = rows.flatMap(row => {
            const [rowX, rowY] = row.get_transformed_position();
            return row.get_children().map(child => [
                rowX + child.x,
                rowY + child.y,
            ]);
        });

        for (const row of rows) {
            for (const child of row.get_children()) {
                row.remove_child(child);
                if (!child._startMenuPinnedItemKey)
                    child.destroy();
            }
        }

        for (let index = 0; index < rows.length * this._columns; index++) {
            const row = rows[Math.floor(index / this._columns)];
            const tile = tiles[index];
            row.add_child(tile ?? new St.Widget({
                width: this._tileWidth,
            }));
            if (!tile || tile === draggedTile)
                continue;

            const [oldX, oldY] = oldPositions.get(tile);
            const [targetX, targetY] = slotPositions[index];
            animateStartMenuItemReflow(
                tile,
                oldX - targetX,
                oldY - targetY
            );
        }

        this._restoreFolderDropActors();
    }

    _restoreOrder(grid, source) {
        if (!grid.get_parent() || !source._originalOrder)
            return;

        const positions = new Map(
            source._originalOrder.map((itemKey, index) => [itemKey, index])
        );
        const tiles = this._gridTiles(grid).sort((a, b) =>
            positions.get(a._startMenuPinnedItemKey) -
            positions.get(b._startMenuPinnedItemKey)
        );
        this._reflowGrid(grid, tiles);
    }
}
