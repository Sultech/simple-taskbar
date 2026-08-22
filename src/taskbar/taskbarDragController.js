// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {panelIsVertical} from '../panel/panelPosition.js';

export class TaskbarDragController {
    constructor({
        settings,
        favorites,
        taskbarActor,
        dropTarget,
        dragIsEnabled,
        getIconSize,
        getPanelHeight,
        hidePreviews,
        isPersistentPinned,
        queueRedisplay,
        setSessionOrder,
        ignoreTaskbarLock = false,
        usePinnedAppLaunchers,
    }) {
        this._settings = settings;
        this._favorites = favorites;
        this._taskbarActor = taskbarActor;
        this._dropTarget = dropTarget;
        this._dragIsEnabled = dragIsEnabled;
        this._getIconSize = getIconSize;
        this._getPanelHeight = getPanelHeight;
        this._hidePreviews = hidePreviews;
        this._isPersistentPinned = isPersistentPinned;
        this._queueRedisplay = queueRedisplay;
        this._setSessionOrder = setSessionOrder;
        this._ignoreTaskbarLock = ignoreTaskbarLock;
        this._usePinnedAppLaunchers = usePinnedAppLaunchers;
        this._showDesktopController = null;
        this._alignmentActor = null;
        this._dragging = false;
        this._draggingItem = null;
        this._draggables = new Map();
        this._listeners = new Set();
        this._externalPlaceholder = null;
        this._externalFavoriteIndex = -1;
        this._externalFavoriteCenters = null;
        this._panelDropActor = null;
        this._previousPanelDropDelegate = null;
        this._dragMonitor = {
            dragMotion: event => this._onDragMotion(event),
        };
    }

    get isDragging() {
        return this._dragging;
    }

    get externalPlaceholder() {
        return this._externalPlaceholder;
    }

    setAlignmentActor(actor) {
        this._alignmentActor = actor;
    }

    setShowDesktopController(controller) {
        this._showDesktopController = controller;
    }

    enable() {
        DND.addDragMonitor(this._dragMonitor);
    }

    addListener(listener) {
        this._listeners.add(listener);
    }

    removeListener(listener) {
        this._listeners.delete(listener);
    }

    begin(item) {
        this._dragging = true;
        this._draggingItem = item;
        item.opacity = 96;
        this._hidePreviews();
    }

    finish(item) {
        item.opacity = 255;
        this._dragging = false;
        this._draggingItem = null;
        this._queueRedisplay();
        for (const listener of [...this._listeners])
            listener();
    }

    cancel() {
        this._dragging = false;
        this._draggingItem = null;
    }

    makeDraggable(item, button, icon, app) {
        const dragSource = {
            app,
            _taskbarItem: item,
            getDragActor: () => app.create_icon_texture(this._getIconSize()),
            getDragActorSource: () => icon,
        };
        button._delegate = dragSource;

        if (!this._dragIsEnabled(item))
            return;

        const draggable = DND.makeDraggable(button, {
            timeoutThreshold: 200,
            dragActorMaxSize: this._getIconSize(),
        });
        item._taskbarDraggable = draggable;
        this._draggables.set(item, {
            draggable,
            button,
            beginId: draggable.connect('drag-begin', () => {
                dragSource._taskbarDropAccepted = false;
                this.begin(item);
                button._taskbarMenu?.close();
            }),
            endId: draggable.connect('drag-end', () => this.finish(item)),
        });
    }

    releaseDraggable(item) {
        const entry = this._draggables.get(item);
        if (!entry)
            return;

        entry.draggable.disconnect(entry.beginId);
        entry.draggable.disconnect(entry.endId);
        entry.button._delegate = null;
        item._taskbarDraggable = null;
        this._draggables.delete(item);
        if (this._draggingItem === item)
            this.cancel();
    }

    isPinnedItem(item) {
        return item._taskbarIsLauncher ||
            (item._taskbarIsPinnedPrimary &&
                this._isPersistentPinned(item._taskbarApp));
    }

    getGroup(item) {
        const group = this._groups().find(candidate =>
            candidate.items.includes(item)
        );
        return group ? [...group.items] : [];
    }

    reorderItem(sourceItem, targetItem, insertBefore) {
        const groups = this._groups();
        const sourceGroup = groups.find(group =>
            group.items.includes(sourceItem)
        );
        const targetGroup = groups.find(group =>
            group.items.includes(targetItem)
        );
        if (!sourceGroup || !targetGroup || sourceGroup === targetGroup)
            return false;

        const sourceIsPinned = this.isPinnedItem(sourceGroup.items[0]);
        const targetIsPinned = this.isPinnedItem(targetGroup.items[0]);
        if (sourceIsPinned !== targetIsPinned)
            return false;

        return this._reorderGroups(sourceGroup, targetGroup, insertBefore);
    }

    handleDragOver(source, position) {
        if (source && source._startMenuTaskbarApp)
            return this.handleStartMenuDragOver(source, position);

        if (!this._dragIsEnabled(source?._taskbarItem))
            return DND.DragMotionResult.NO_DROP;

        const item = source?._taskbarItem;
        if (!item || item.get_parent() !== this._taskbarActor)
            return DND.DragMotionResult.CONTINUE;

        if (item._taskbarIsShowDesktop)
            return this._showDesktopController.handleDragOver(item, position);

        if (!this.isPinnedItem(item) && !this._isRunningItem(item))
            return DND.DragMotionResult.NO_DROP;

        this._reorderGroup(item, position);
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source) {
        if (source && source._startMenuTaskbarApp)
            return this.acceptStartMenuDrop(source);

        if (!this._dragIsEnabled(source?._taskbarItem))
            return false;

        const item = source?._taskbarItem;
        if (!item || item.get_parent() !== this._taskbarActor)
            return false;

        if (item._taskbarIsShowDesktop) {
            this._showDesktopController.savePosition();
            source._taskbarDropAccepted = true;
            source._taskbarDropTarget = this._dropTarget;
            return true;
        }

        const accepted = this.acceptItemDrop(item, source);
        if (accepted)
            source._taskbarDropTarget = this._dropTarget;
        return accepted;
    }

    acceptItemDrop(item, source = null) {
        if (!this.isPinnedItem(item) && !this._isRunningItem(item))
            return false;

        const appId = item._taskbarApp.get_id();
        if (this.isPinnedItem(item)) {
            if (global.settings.is_writable('favorite-apps')) {
                const favoriteIndex = this._pinnedOrder().indexOf(appId);
                if (favoriteIndex >= 0)
                    this._favorites.moveFavoriteToPos(appId, favoriteIndex);
            }
        } else {
            this._setSessionOrder(this._runningOrder());
        }

        this._showDesktopController.savePosition();
        if (source)
            source._taskbarDropAccepted = true;
        return true;
    }

    handleStartMenuDragOver(source, position) {
        if (!this._canAcceptStartMenuDrop(source)) {
            if (source._taskbarDropTarget === this._dropTarget)
                source._clearTaskbarDropTarget();
            return DND.DragMotionResult.NO_DROP;
        }

        if (source._taskbarDropTarget !== this._dropTarget) {
            source._clearTaskbarDropTarget();
            source._taskbarDropTarget = this._dropTarget;
            source._clearTaskbarDropTarget = () => {
                this._clearExternalPlaceholder();
                if (source._taskbarDropTarget === this._dropTarget)
                    source._taskbarDropTarget = null;
            };
        }
        this._activatePanelDropTarget();

        const appId = source.app.get_id();
        const favoriteItems = [];
        const seen = new Set();
        for (const child of this._taskbarActor.get_children()) {
            if (child === this._externalPlaceholder)
                continue;
            const childId = child._taskbarApp
                ? child._taskbarApp.get_id()
                : null;
            if (!childId || childId === appId || seen.has(childId) ||
                !this._favorites.isFavorite(childId) ||
                this._usePinnedAppLaunchers() &&
                    !child._taskbarIsLauncher) {
                continue;
            }
            seen.add(childId);
            favoriteItems.push(child);
        }

        if (!this._externalFavoriteCenters) {
            const vertical = panelIsVertical(this._settings);
            this._externalFavoriteCenters = favoriteItems.map(item => {
                const [itemX, itemY] = item.get_transformed_position();
                const [itemWidth, itemHeight] = item.get_transformed_size();
                return vertical
                    ? itemY + itemHeight / 2
                    : itemX + itemWidth / 2;
            });
        }
        const [actorX, actorY] =
            this._taskbarActor.get_transformed_position();
        const stagePosition = panelIsVertical(this._settings)
            ? actorY + position
            : actorX + position;
        let favoriteIndex = this._externalFavoriteCenters.findIndex(
            center => stagePosition < center
        );
        if (favoriteIndex < 0)
            favoriteIndex = favoriteItems.length;

        this._showExternalPlaceholder(favoriteItems, favoriteIndex);
        return DND.DragMotionResult.COPY_DROP;
    }

    acceptStartMenuDrop(source) {
        if (!this._canAcceptStartMenuDrop(source) ||
            source._taskbarDropTarget !== this._dropTarget ||
            !this._externalPlaceholder) {
            return false;
        }

        const appId = source.app.get_id();
        const favoriteIndex = this._externalFavoriteIndex;
        source._taskbarDropAccepted = true;
        source._clearTaskbarDropTarget();
        if (this._favorites.isFavorite(appId))
            this._favorites.moveFavoriteToPos(appId, favoriteIndex);
        else
            this._favorites.addFavoriteAtPos(appId, favoriteIndex);
        return true;
    }

    destroy() {
        DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = null;
        for (const item of [...this._draggables.keys()])
            this.releaseDraggable(item);
        this._draggables = null;
        this._clearExternalPlaceholder();
        this._listeners.clear();
        this._dragging = false;
        this._draggingItem = null;
        this._ignoreTaskbarLock = false;
        this._alignmentActor = null;
        this._showDesktopController = null;
        this._usePinnedAppLaunchers = null;
        this._setSessionOrder = null;
        this._queueRedisplay = null;
        this._isPersistentPinned = null;
        this._hidePreviews = null;
        this._getPanelHeight = null;
        this._getIconSize = null;
        this._dragIsEnabled = null;
        this._dropTarget = null;
        this._taskbarActor = null;
        this._favorites = null;
        this._settings = null;
    }

    _isRunningItem(item) {
        return !item._taskbarIsLauncher &&
            !item._taskbarIsPinnedPrimary;
    }

    _sameGroup(left, right) {
        return left._taskbarApp === right._taskbarApp &&
            left._taskbarIsLauncher === right._taskbarIsLauncher &&
            left._taskbarIsPinnedPrimary === right._taskbarIsPinnedPrimary;
    }

    _groups() {
        const groups = [];
        for (const child of this._taskbarActor.get_children()) {
            if (child === this._showDesktopController.item ||
                child === this._externalPlaceholder ||
                !child._taskbarApp || child.animatingOut) {
                continue;
            }

            const group = groups.find(existing =>
                this._sameGroup(existing.items[0], child)
            );
            if (group)
                group.items.push(child);
            else
                groups.push({items: [child]});
        }
        return groups;
    }

    _reorderGroup(item, position) {
        const groups = this._groups();
        const sourceGroup = groups.find(group =>
            group.items.includes(item)
        );
        if (!sourceGroup)
            return false;

        const sourceIsPinned = this.isPinnedItem(item);
        const targetGroups = groups.filter(group => {
            if (group === sourceGroup)
                return false;

            const target = group.items[0];
            return sourceIsPinned
                ? this.isPinnedItem(target)
                : this._isRunningItem(target);
        });
        if (targetGroups.length === 0)
            return false;

        let targetGroup = targetGroups.find(group => {
            const first = group.items[0];
            const last = group.items.at(-1);
            const vertical = panelIsVertical(this._settings);
            const groupStart = vertical ? first.y : first.x;
            const groupEnd = (vertical ? last.y : last.x) +
                (vertical ? last.height : last.width);
            return position < groupStart + (groupEnd - groupStart) / 2;
        });
        const insertBefore = targetGroup !== undefined;
        if (!targetGroup)
            targetGroup = targetGroups.at(-1);

        return this._reorderGroups(
            sourceGroup,
            targetGroup,
            insertBefore
        );
    }

    _reorderGroups(sourceGroup, targetGroup, insertBefore) {
        const sourceItems = new Set(sourceGroup.items);
        const children = this._taskbarActor.get_children();
        const remainingChildren = children.filter(child =>
            !sourceItems.has(child)
        );
        const target = insertBefore
            ? targetGroup.items[0]
            : targetGroup.items.at(-1);
        const targetIndex = remainingChildren.indexOf(target);
        const insertIndex = targetIndex + (insertBefore ? 0 : 1);
        const desiredChildren = [...remainingChildren];
        desiredChildren.splice(insertIndex, 0, ...sourceGroup.items);
        let changed = false;

        for (let index = 0; index < desiredChildren.length; index++) {
            const child = desiredChildren[index];
            if (this._taskbarActor.get_child_at_index(index) === child)
                continue;

            this._taskbarActor.set_child_at_index(child, index);
            changed = true;
        }
        return changed;
    }

    _runningOrder() {
        const order = [];
        const seen = new Set();
        for (const group of this._groups()) {
            const item = group.items[0];
            if (!this._isRunningItem(item))
                continue;

            const appId = item._taskbarApp.get_id();
            if (seen.has(appId))
                continue;

            seen.add(appId);
            order.push(appId);
        }
        return order;
    }

    _pinnedOrder() {
        const order = [];
        const seen = new Set();
        for (const group of this._groups()) {
            const item = group.items[0];
            if (!this.isPinnedItem(item))
                continue;

            const appId = item._taskbarApp.get_id();
            if (seen.has(appId))
                continue;

            seen.add(appId);
            order.push(appId);
        }
        return order;
    }

    _canAcceptStartMenuDrop(source) {
        return Boolean(
            source.app &&
            !source.app.is_window_backed() &&
            !this._favorites.isFavorite(source.app.get_id()) &&
            (this._ignoreTaskbarLock ||
                !this._settings.get_boolean('taskbar-locked')) &&
            !this._settings.get_boolean('default-gnome-panel') &&
            !this._settings.get_boolean('hide-pinned-taskbar-apps') &&
            global.settings.is_writable('favorite-apps') &&
            this._taskbarActor.visible
        );
    }

    _showExternalPlaceholder(favoriteItems, favoriteIndex) {
        if (!this._externalPlaceholder) {
            const reference = favoriteItems[0];
            const vertical = panelIsVertical(this._settings);
            const size = Math.max(
                reference
                    ? vertical ? reference.height : reference.width
                    : 0,
                this._getIconSize() + 8
            );
            this._externalPlaceholder = new St.Widget({
                style_class: 'simple-taskbar-drag-placeholder',
                width: vertical
                    ? Math.max(1, this._getPanelHeight() - 10)
                    : size,
                height: vertical
                    ? size
                    : Math.max(1, this._getPanelHeight() - 10),
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._taskbarActor.add_child(this._externalPlaceholder);
        }

        if (favoriteIndex === this._externalFavoriteIndex)
            return;

        this._externalFavoriteIndex = favoriteIndex;
        const beforeItem = favoriteItems[favoriteIndex] ?? null;
        const children = this._taskbarActor.get_children().filter(child =>
            child !== this._externalPlaceholder
        );
        let actorIndex;
        if (beforeItem)
            actorIndex = children.indexOf(beforeItem);
        else if (favoriteItems.length > 0)
            actorIndex = children.indexOf(favoriteItems.at(-1)) + 1;
        else
            actorIndex = 0;
        this._taskbarActor.set_child_at_index(
            this._externalPlaceholder,
            actorIndex
        );
    }

    _clearExternalPlaceholder() {
        if (this._externalPlaceholder)
            this._externalPlaceholder.destroy();
        this._externalPlaceholder = null;
        this._externalFavoriteIndex = -1;
        this._externalFavoriteCenters = null;
        this._restorePanelDropTarget();
    }

    _onDragMotion(event) {
        const source = event.source;
        if (!source || !source._startMenuTaskbarApp)
            return DND.DragMotionResult.CONTINUE;

        if (!this._stagePointIsInPanel(event.x, event.y)) {
            if (source._taskbarDropTarget === this._dropTarget)
                source._clearTaskbarDropTarget();
            return DND.DragMotionResult.CONTINUE;
        }

        const [, x, y] = this._taskbarActor.transform_stage_point(
            event.x,
            event.y
        );
        return this.handleStartMenuDragOver(
            source,
            panelIsVertical(this._settings) ? y : x
        );
    }

    _activatePanelDropTarget() {
        if (this._panelDropActor)
            return;

        const panelActor = this._alignmentActor.get_parent();
        this._panelDropActor = panelActor;
        this._previousPanelDropDelegate = panelActor._delegate ?? null;
        panelActor._delegate = this._dropTarget;
    }

    _restorePanelDropTarget() {
        if (!this._panelDropActor)
            return;

        if (this._panelDropActor._delegate === this._dropTarget) {
            this._panelDropActor._delegate =
                this._previousPanelDropDelegate;
        }
        this._panelDropActor = null;
        this._previousPanelDropDelegate = null;
    }

    _stagePointIsInPanel(x, y) {
        const monitor = Main.layoutManager.findMonitorForActor(
            this._taskbarActor
        );
        if (!monitor)
            return false;

        const [actorX, actorY] =
            this._taskbarActor.get_transformed_position();
        const [actorWidth, actorHeight] =
            this._taskbarActor.get_transformed_size();
        const panelThickness = this._getPanelHeight();
        if (panelIsVertical(this._settings)) {
            const width = Math.max(actorWidth, panelThickness);
            return x >= actorX && x < actorX + width &&
                y >= monitor.y && y < monitor.y + monitor.height;
        }
        const height = Math.max(actorHeight, panelThickness);
        return x >= monitor.x && x < monitor.x + monitor.width &&
            y >= actorY && y < actorY + height;
    }
}
