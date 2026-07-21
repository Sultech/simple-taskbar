// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

export class StartMenuPinnedDragController {
    constructor(settings, params) {
        this._settings = settings;
        this._columns = params.columns;
        this._tileWidth = params.tileWidth;
        this._closeContextMenu = params.closeContextMenu;
        this._onOrderChanged = params.onOrderChanged;
    }

    attachGrid(grid) {
        grid._delegate = {
            handleDragOver: (source, _actor, x, y) =>
                this._handleDragOver(grid, source, x, y),
            acceptDrop: (source, _actor, x, y) =>
                this._acceptDrop(grid, source, x, y),
        };
    }

    makeDraggable(button, icon, app, grid) {
        const dragSource = {
            app,
            _pinnedTile: button,
            _pinnedGrid: grid,
            _originalOrder: null,
            _dropAccepted: false,
            getDragActor: () => app.create_icon_texture(40),
            getDragActorSource: () => icon,
        };
        button._delegate = dragSource;
        button._startMenuPinnedAppId = app.get_id();

        const draggable = DND.makeDraggable(button, {
            timeoutThreshold: 200,
            dragActorMaxSize: 48,
        });
        button._startMenuDraggable = draggable;
        draggable.connect('drag-begin', () => {
            dragSource._originalOrder = this._gridTiles(grid)
                .map(tile => tile._startMenuPinnedAppId);
            dragSource._dropAccepted = false;
            button.opacity = 96;
            this._closeContextMenu?.();
        });
        draggable.connect('drag-end', () => {
            button.opacity = 255;
            if (!dragSource._dropAccepted)
                this._restoreOrder(grid, dragSource);
            dragSource._originalOrder = null;
            dragSource._dropAccepted = false;
        });
    }

    destroy() {
        this._settings = null;
        this._closeContextMenu = null;
        this._onOrderChanged = null;
    }

    _handleDragOver(grid, source, x, y) {
        if (!this._validSource(grid, source))
            return DND.DragMotionResult.CONTINUE;

        this._moveTileToPointer(grid, source, x, y);
        return DND.DragMotionResult.MOVE_DROP;
    }

    _acceptDrop(grid, source, x, y) {
        if (!this._settings || !this._validSource(grid, source))
            return false;

        this._moveTileToPointer(grid, source, x, y);
        const visibleOrder = this._gridTiles(grid)
            .map(tile => tile._startMenuPinnedAppId);
        const visibleIds = new Set(visibleOrder);
        let visibleIndex = 0;
        const pinnedApps = this._settings
            .get_strv('start-menu-pinned-apps')
            .map(appId => visibleIds.has(appId)
                ? visibleOrder[visibleIndex++]
                : appId);

        this._settings.set_strv('start-menu-pinned-apps', pinnedApps);
        this._onOrderChanged?.(visibleOrder);
        source._dropAccepted = true;
        return true;
    }

    _validSource(grid, source) {
        const tile = source?._pinnedTile;
        return Boolean(tile && source._pinnedGrid === grid &&
            grid.contains(tile));
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
        this._reflowGrid(grid, tiles);
    }

    _gridTiles(grid) {
        return grid.get_children().flatMap(row =>
            row.get_children().filter(child =>
                Boolean(child._startMenuPinnedAppId)
            )
        );
    }

    _reflowGrid(grid, tiles) {
        const rows = grid.get_children();
        for (const row of rows) {
            for (const child of row.get_children()) {
                row.remove_child(child);
                if (!child._startMenuPinnedAppId)
                    child.destroy();
            }
        }

        for (let index = 0; index < rows.length * this._columns; index++) {
            const row = rows[Math.floor(index / this._columns)];
            row.add_child(tiles[index] ?? new St.Widget({
                width: this._tileWidth,
            }));
        }
    }

    _restoreOrder(grid, source) {
        if (!grid.get_parent() || !source._originalOrder)
            return;

        const positions = new Map(
            source._originalOrder.map((appId, index) => [appId, index])
        );
        const tiles = this._gridTiles(grid).sort((a, b) =>
            positions.get(a._startMenuPinnedAppId) -
            positions.get(b._startMenuPinnedAppId)
        );
        this._reflowGrid(grid, tiles);
    }
}
