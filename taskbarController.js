// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {TaskbarAppMenu} from './taskbarAppMenu.js';
import {panelArrowSide, syncMenuArrowSide} from './panelPosition.js';

const ITEM_ANIMATION_TIME = 200;
const STARTUP_SETTLE_DELAY = 750;
const APP_LABEL_WIDTH = 140;
const APP_LABEL_MIN_WIDTH = 40;
const APP_LABEL_SPACING = 8;

// Retain DashItemContainer's scale-and-fade animation.
const TaskbarItemContainer = GObject.registerClass(
class TaskbarItemContainer extends Dash.DashItemContainer {
    _init() {
        super._init();
        this.x_expand = false;
        this.y_expand = false;
    }

    vfunc_allocate(box) {
        if (this.child === null)
            return;

        this.set_allocation(box);

        const availableWidth = box.x2 - box.x1;
        const availableHeight = box.y2 - box.y1;
        const [, , naturalWidth, naturalHeight] =
            this.child.get_preferred_size();
        const [childScaleX, childScaleY] = this.child.get_scale();
        const childWidth = Math.min(
            naturalWidth * childScaleX,
            availableWidth
        );
        const childHeight = Math.min(
            naturalHeight * childScaleY,
            availableHeight
        );
        const childBox = new Clutter.ActorBox();
        childBox.x1 = (availableWidth - childWidth) / 2;
        childBox.y1 = (availableHeight - childHeight) / 2;
        childBox.x2 = childBox.x1 + childWidth;
        childBox.y2 = childBox.y1 + childHeight;
        this.child.allocate(childBox);
    }
});

export class TaskbarController {
    constructor({
        settings,
        appSystem,
        tracker,
        favorites,
        iconSize,
        panelHeight,
        getInterestingWindows,
        onAppClicked,
        onWindowClicked,
        openNewWindow,
    }) {
        this._settings = settings;
        this._appSystem = appSystem;
        this._tracker = tracker;
        this._favorites = favorites;
        this._iconSize = iconSize;
        this._panelHeight = panelHeight;
        this._getInterestingWindows = getInterestingWindows;
        this._onAppClicked = onAppClicked;
        this._onWindowClicked = onWindowClicked;
        this._openNewWindow = openNewWindow;
        this._windowPreviews = null;
        this._alignmentActor = null;
        this._signals = [];
        this._appSignals = new Map();
        this._appButtons = new Map();
        this._sessionOrder = [];
        this._dragging = false;
        this._iconGeometryUpdateId = 0;
        this._iconGeometryUpdatesEnabled = true;
        this._activeWorkspace = null;
        this._activeWorkspaceSignalIds = [];
        this._shownInitially = false;
        this._centered = false;
        this._availableWidth = 0;
        this._combineWhenFull = false;
        this._appLabelWidth = APP_LABEL_WIDTH;
        this._startupSettling = Main.layoutManager._startingUp;
        this._startupSettleId = 0;

        this.actor = new St.BoxLayout({
            style_class: 'simple-taskbar-apps',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            visible: !this._settings.get_boolean('default-gnome-panel'),
        });
        this.actor._delegate = this;
        this._redisplayWorkId = Main.initializeDeferredWork(
            this.actor,
            () => this.redisplay()
        );
    }

    setPreviewController(controller) {
        this._windowPreviews = controller;
    }

    setAlignmentActor(actor) {
        this._alignmentActor = actor;
    }

    getItems() {
        return this._appButtons.values();
    }

    hasOpenMenu() {
        return [...this._appButtons.values()].some(item =>
            item._taskbarButton?._taskbarMenu?.isOpen
        );
    }

    get isDragging() {
        return this._dragging;
    }

    hasTarget(target) {
        for (const item of this._appButtons.values()) {
            if (item === target || item.contains(target))
                return true;
        }
        return false;
    }

    enable() {
        if (this._startupSettling) {
            this._connect(Main.layoutManager, 'startup-complete', () => {
                this._scheduleStartupSettle();
            });
        }
        this._connect(this._appSystem, 'app-state-changed', (_system, app) => {
            if (this._combineMode() === 'always' &&
                this._isPersistentPinned(app) &&
                this._hasItemsForApp(app.get_id())) {
                this.syncButtonStates();
                return;
            }
            this._queueRedisplay();
        });
        this._connect(this._favorites, 'changed', () => {
            this._queueRedisplay();
        });
        this._connect(global.display, 'notify::focus-window', () => {
            this.syncButtonStates();
        });
        this._connect(global.window_manager, 'switch-workspace', () => {
            this._connectActiveWorkspaceSignals();
            this._refreshWorkspaceIsolation(
                false,
                this._settings.get_boolean('isolate-workspaces')
            );
        });
        for (const signal of ['window-entered-monitor', 'window-left-monitor']) {
            this._connect(global.display, signal, () => {
                this._refreshWorkspaceIsolation();
            });
        }
        this._connect(
            this._settings,
            'changed::hide-pinned-taskbar-apps',
            () => {
                this._sessionOrder = [];
                this._queueRedisplay();
            }
        );
        this._connect(
            this._settings,
            'changed::default-gnome-panel',
            () => this._syncApplicationVisibility()
        );
        this._connect(this._settings, 'changed::isolate-workspaces', () => {
            this._refreshWorkspaceIsolation(true, true);
        });
        this._connect(this._settings, 'changed::isolate-monitors', () => {
            this._refreshWorkspaceIsolation(true, true);
        });
        this._connect(this._settings, 'changed::multi-monitor-panels', () => {
            this._refreshWorkspaceIsolation(true);
        });
        this._connect(
            this._settings,
            'changed::combine-app-buttons-mode',
            () => {
                this._windowPreviews?.hideTooltip(false);
                this._windowPreviews?.hide();
                this._combineWhenFull = false;
                this._syncCombineWhenFull();
                this._shownInitially = false;
                this._queueRedisplay();
                this._syncDragEnabled();
            }
        );
        this._connect(this._settings, 'changed::hide-app-labels', () => {
            for (const item of this._appButtons.values()) {
                this._syncItemLabel(item);
                this._updateGlassGeometry(item);
            }
            this.queueIconGeometryUpdate();
        });
        this._connect(this._settings, 'changed::taskbar-locked', () => {
            this._syncDragEnabled();
        });
        this._connect(this.actor, 'notify::allocation', () => {
            this.queueIconGeometryUpdate();
        });
        this._connectActiveWorkspaceSignals();
        this._syncApplicationVisibility();
    }

    destroy() {
        this._iconGeometryUpdatesEnabled = false;
        if (this._iconGeometryUpdateId)
            GLib.Source.remove(this._iconGeometryUpdateId);
        this._iconGeometryUpdateId = 0;
        if (this._startupSettleId)
            GLib.Source.remove(this._startupSettleId);
        this._startupSettleId = 0;

        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];
        this._disconnectActiveWorkspaceSignals();

        for (const [app, id] of this._appSignals)
            app.disconnect(id);
        this._appSignals.clear();

        for (const item of this._appButtons.values()) {
            this._windowPreviews?.removeItem(item);
            this._destroyAppMenu(item._taskbarButton);
            item.destroy();
        }
        this._appButtons.clear();
        this.actor?.destroy();
        this.actor = null;
        this._redisplayWorkId = 0;

        this._windowPreviews = null;
        this._alignmentActor = null;
        this._settings = null;
        this._appSystem = null;
        this._tracker = null;
        this._favorites = null;
        this._getInterestingWindows = null;
        this._onAppClicked = null;
        this._onWindowClicked = null;
        this._openNewWindow = null;
        this._sessionOrder = null;
        this._activeWorkspace = null;
        this._activeWorkspaceSignalIds = null;
        this._shownInitially = false;
        this._centered = false;
        this._availableWidth = 0;
        this._combineWhenFull = false;
        this._appLabelWidth = APP_LABEL_WIDTH;
        this._startupSettling = false;
    }

    setAvailableWidth(width) {
        this._availableWidth = Math.max(0, Math.floor(width));
        if (this._syncCombineWhenFull()) {
            this._shownInitially = false;
            this._windowPreviews?.hideTooltip(false);
            this._windowPreviews?.hide();
            this._queueRedisplay();
            this._syncDragEnabled();
        }
    }

    setIconSize(iconSize) {
        this._iconSize = iconSize;
        for (const item of this._appButtons.values()) {
            item._taskbarIcon.icon_size = iconSize;
            this._updateGlassGeometry(item);
        }
        this.queueIconGeometryUpdate();
    }

    setPanelHeight(panelHeight) {
        this._panelHeight = panelHeight;
        for (const item of this._appButtons.values()) {
            item.set_height(panelHeight);
            this._updateGlassGeometry(item);
        }
        this.queueIconGeometryUpdate();
    }

    applyAppearance(spacing, centered) {
        this._centered = centered;
        this.actor.set_style(`spacing: ${Math.max(spacing, 0)}px;`);
        // Start alignment keeps width changes anchored in either panel box.
        this.actor.x_align = Clutter.ActorAlign.START;
        for (const item of this._appButtons.values())
            this._applyButtonSpacing(item);
    }

    redisplay() {
        if (this._dragging)
            return;

        if (this._settings.get_boolean('default-gnome-panel')) {
            this._clearAppButtons();
            return;
        }

        if (this._syncCombineWhenFull()) {
            this._shownInitially = false;
            this._windowPreviews?.hideTooltip(false);
            this._windowPreviews?.hide();
            this._syncDragEnabled();
        }
        const entries = this._orderedEntries(this._startupSettling);
        const animateMembershipChanges = this._shownInitially &&
            !this._startupSettling;
        const wantedKeys = new Set(entries.map(entry => entry.key));
        const wantedAppIds = new Set(
            entries.map(entry => entry.app.get_id())
        );

        for (const [key, item] of this._appButtons) {
            if (!wantedKeys.has(key)) {
                this._windowPreviews.removeItem(item);
                this._destroyAppMenu(item._taskbarButton);
                this._appButtons.delete(key);
                if (this._favorites.isFavorite(
                    item._taskbarApp.get_id()
                ) ||
                    !animateMembershipChanges) {
                    item.destroy();
                } else {
                    item._taskbarAnimatingOut = true;
                    this._animateItemOutAndDestroy(item);
                }
            }
        }

        for (let index = 0; index < entries.length; index++) {
            const {key, app, window} = entries[index];
            let item = this._appButtons.get(key);
            if (!item) {
                item = this._createAppButton(app, window);
                this._trackApp(app);
                this._appButtons.set(key, item);
                this._placeItemAtActiveIndex(item, index);
                this._animateItemIn(
                    item,
                    animateMembershipChanges &&
                        !this._favorites.isFavorite(app.get_id())
                );
            } else {
                this._placeItemAtActiveIndex(item, index);
            }
        }

        for (const app of [...this._appSignals.keys()]) {
            if (!wantedAppIds.has(app.get_id()))
                this._untrackApp(app);
        }

        this._shownInitially = true;
        this.syncButtonStates();
        this.queueIconGeometryUpdate();
    }

    _syncApplicationVisibility() {
        const visible = !this._settings.get_boolean('default-gnome-panel');
        this.actor.visible = visible;
        if (!visible) {
            this._windowPreviews?.hideTooltip(false);
            this._windowPreviews?.hide();
            this._clearAppButtons();
            return;
        }

        this._queueRedisplay();
    }

    _clearAppButtons() {
        for (const item of this._appButtons.values()) {
            this._windowPreviews?.removeItem(item);
            this._untrackApp(item._taskbarApp);
            this._destroyAppMenu(item._taskbarButton);
            item.remove_all_transitions();
            item.destroy();
        }
        this._appButtons.clear();
        // Remove closing items no longer tracked in _appButtons.
        for (const child of this.actor.get_children()) {
            child.remove_all_transitions();
            child.destroy();
        }
        this._sessionOrder = [];
        this._shownInitially = false;
    }

    syncButtonStates() {
        const focusedApp = this._tracker?.focus_app;
        const focusedWindow = global.display.focus_window;
        for (const item of this._appButtons.values()) {
            const app = item._taskbarApp;
            const window = item._taskbarWindow;
            const button = item._taskbarButton;
            const windowCount = this._windowsForItem(item).length;
            const running = window
                ? windowCount > 0
                : app.state === Shell.AppState.RUNNING && windowCount > 0;
            const focused = window
                ? window === focusedWindow
                : app === focusedApp &&
                    this._interestingWindows(app).includes(focusedWindow);
            item.set_style_class_name(
                `dash-item-container simple-taskbar-app-item` +
                `${running ? ' running' : ''}` +
                `${!window && windowCount > 1 ? ' multiple-windows' : ''}` +
                `${focused ? ' focused' : ''}`
            );
            button.accessible_name = window
                ? `${window.get_title() || app.get_name()}, ${_('running')}`
                : running
                    ? `${app.get_name()}, ${_('running')}`
                    : app.get_name();
            this._syncItemLabel(item);

            if (focused)
                button.add_style_pseudo_class('selected');
            else
                button.remove_style_pseudo_class('selected');

            item._taskbarIndicatorSecondary.visible =
                !window && focused && windowCount > 1;
        }
    }

    queueIconGeometryUpdate() {
        if (!this._iconGeometryUpdatesEnabled || this._iconGeometryUpdateId)
            return;

        this._iconGeometryUpdateId = GLib.idle_add(
            GLib.PRIORITY_LOW,
            () => {
                this._iconGeometryUpdateId = 0;
                this.updateWindowIconGeometries();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    updateWindowIconGeometries() {
        for (const item of this._appButtons.values())
            this._updateItemIconGeometry(item);
    }

    updateAppIconGeometry(app) {
        if (!app)
            return;

        for (const item of this._appButtons.values()) {
            if (item._taskbarApp === app)
                this._updateItemIconGeometry(item);
        }
    }

    _updateItemIconGeometry(item) {
        const icon = item?._taskbarIcon;
        if (!icon?.get_stage() || !icon.has_allocation())
            return;

        const [x, y] = icon.get_transformed_position();
        const [width, height] = icon.get_transformed_size();
        if (width <= 0 || height <= 0)
            return;

        const geometry = new Mtk.Rectangle();
        geometry.x = Math.round(x);
        geometry.y = Math.round(y);
        geometry.width = Math.max(1, Math.round(width));
        geometry.height = Math.max(1, Math.round(height));
        const monitor = Main.layoutManager.findMonitorForActor(this.actor);
        const monitorScoped =
            this._settings.get_boolean('multi-monitor-panels') &&
            Main.layoutManager.monitors.length > 1;
        for (const window of this._windowsForItem(item)) {
            if (monitorScoped && monitor &&
                window.get_monitor() !== monitor.index)
                continue;
            window.set_icon_geometry(geometry);
        }
    }

    handleDragOver(source, _actor, x, _y, _time) {
        if (this._settings.get_boolean('taskbar-locked') ||
            !this._combineAppButtons()) {
            return DND.DragMotionResult.NO_DROP;
        }

        const item = source?._taskbarItem;
        if (!item || item.get_parent() !== this.actor)
            return DND.DragMotionResult.CONTINUE;

        const children = this.actor.get_children();
        const sourceIndex = children.indexOf(item);
        if (sourceIndex < 0)
            return DND.DragMotionResult.NO_DROP;

        // Ignore the dragged item to keep insertion boundaries stable.
        const stationaryChildren = children.filter(child => child !== item);
        let targetIndex = stationaryChildren.findIndex(child =>
            x < child.x + child.width / 2
        );
        if (targetIndex < 0)
            targetIndex = stationaryChildren.length;

        if (targetIndex !== sourceIndex)
            this.actor.set_child_at_index(item, targetIndex);

        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source, _actor, _x, _y, _time) {
        if (this._settings.get_boolean('taskbar-locked') ||
            !this._combineAppButtons()) {
            return false;
        }

        const item = source?._taskbarItem;
        if (!item || item.get_parent() !== this.actor)
            return false;

        const order = this.actor.get_children()
            .map(child => child._taskbarApp?.get_id())
            .filter(Boolean);
        const appId = item._taskbarApp.get_id();
        const sourceIndex = order.indexOf(appId);
        const showPinned =
            !this._settings.get_boolean('hide-pinned-taskbar-apps');
        if (showPinned && sourceIndex >= 0 &&
            global.settings.is_writable('favorite-apps')) {
            const wasFavorite = this._favorites.isFavorite(appId);
            const favoriteCount = this._favorites.getFavorites().length;
            if (sourceIndex < favoriteCount) {
                const favoriteIndex = order.slice(0, sourceIndex)
                    .filter(id => this._favorites.isFavorite(id)).length;
                if (wasFavorite)
                    this._favorites.moveFavoriteToPos(appId, favoriteIndex);
                else
                    this._favorites.addFavoriteAtPos(appId, favoriteIndex);
            }
        }

        // Only pinned order persists after an application closes.
        this._sessionOrder = order.filter(id =>
            !showPinned || !this._favorites.isFavorite(id)
        );
        return true;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _queueRedisplay() {
        if (this._startupSettling && !Main.layoutManager._startingUp) {
            this._scheduleStartupSettle();
            return;
        }

        if (this._redisplayWorkId)
            Main.queueDeferredWork(this._redisplayWorkId);
    }

    _scheduleStartupSettle() {
        if (!this._startupSettling)
            return;

        if (this._startupSettleId)
            GLib.Source.remove(this._startupSettleId);
        this._startupSettleId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            STARTUP_SETTLE_DELAY,
            () => {
                this._startupSettleId = 0;
                this._startupSettling = false;
                // Initial discovery should not animate as a new launch.
                this._shownInitially = false;
                this._queueRedisplay();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _connectActiveWorkspaceSignals() {
        this._disconnectActiveWorkspaceSignals();
        const workspace = global.workspace_manager.get_active_workspace();
        if (!workspace)
            return;

        this._activeWorkspace = workspace;
        for (const signal of ['window-added', 'window-removed']) {
            this._activeWorkspaceSignalIds.push(
                workspace.connect(signal, () => {
                    this._refreshWorkspaceIsolation();
                })
            );
        }
    }

    _disconnectActiveWorkspaceSignals() {
        for (const id of this._activeWorkspaceSignalIds ?? []) {
            if (id)
                this._activeWorkspace?.disconnect(id);
        }
        this._activeWorkspaceSignalIds = [];
        this._activeWorkspace = null;
    }

    _refreshWorkspaceIsolation(force = false, suppressAnimations = false) {
        if (!force &&
            !this._settings.get_boolean('isolate-workspaces') &&
            !this._settings.get_boolean('isolate-monitors')) {
            return;
        }

        this._windowPreviews?.hideTooltip(false);
        this._windowPreviews?.hide();
        if (suppressAnimations)
            this._shownInitially = false;
        this._queueRedisplay();
    }

    _interestingWindows(app) {
        return this._getInterestingWindows(app);
    }

    _windowsForItem(item) {
        const window = item?._taskbarWindow;
        if (!window)
            return this._interestingWindows(item._taskbarApp);

        return this._interestingWindows(item._taskbarApp).includes(window)
            ? [window]
            : [];
    }

    _isPersistentPinned(app) {
        const appId = app?.get_id();
        return Boolean(appId) && this._favorites.isFavorite(appId) &&
            !this._settings.get_boolean('hide-pinned-taskbar-apps');
    }

    _orderedApps(pinnedOnly = false) {
        const seen = new Set();
        const runningApps = pinnedOnly ? [] : this._getRunningApps();
        const pinnedApps = this._settings.get_boolean(
            'hide-pinned-taskbar-apps'
        )
            ? []
            : this._favorites.getFavorites();

        for (const app of pinnedApps) {
            const id = app.get_id();
            if (!id || seen.has(id))
                continue;

            seen.add(id);
        }

        const unpinnedApps = runningApps.filter(app => {
            const id = app.get_id();
            if (!id || seen.has(id))
                return false;

            seen.add(id);
            return true;
        });
        const visibleRunningIds = new Set(
            unpinnedApps.map(app => app.get_id())
        );
        this._sessionOrder = this._sessionOrder.filter(appId =>
            visibleRunningIds.has(appId)
        );

        // Preserve unpinned app order while window stacking settles.
        const orderedIds = new Set(this._sessionOrder);
        for (const app of unpinnedApps) {
            const appId = app.get_id();
            if (orderedIds.has(appId))
                continue;

            this._sessionOrder.push(appId);
            orderedIds.add(appId);
        }

        const positions = new Map(
            this._sessionOrder.map((id, index) => [id, index])
        );
        const orderedRunningApps = [...unpinnedApps].sort((a, b) =>
            positions.get(a.get_id()) - positions.get(b.get_id())
        );
        return [...pinnedApps, ...orderedRunningApps];
    }

    _orderedEntries(pinnedOnly = false) {
        const apps = this._orderedApps(pinnedOnly);
        if (this._combineAppButtons()) {
            return apps.map(app => ({
                key: app.get_id(),
                app,
                window: null,
            }));
        }

        return this._uncombinedEntries(apps);
    }

    _uncombinedEntries(apps) {
        const entries = [];
        for (const app of apps) {
            const windows = this._interestingWindows(app).sort((a, b) =>
                a.get_stable_sequence() - b.get_stable_sequence()
            );
            if (windows.length === 0) {
                entries.push({key: app.get_id(), app, window: null});
                continue;
            }

            for (const window of windows) {
                entries.push({
                    key: `window:${window.get_stable_sequence()}`,
                    app,
                    window,
                });
            }
        }
        return entries;
    }

    _combineMode() {
        return this._settings.get_string('combine-app-buttons-mode');
    }

    _combineAppButtons() {
        return this._combineMode() === 'always' || this._combineWhenFull;
    }

    _syncCombineWhenFull() {
        let shouldCombine = false;
        let labelWidth = APP_LABEL_WIDTH;
        if (this._combineMode() === 'when-full' &&
            this._availableWidth > 0) {
            const layout = this._calculateWhenFullLayout();
            shouldCombine = layout.combine;
            labelWidth = layout.labelWidth;
        }

        const combinationChanged =
            shouldCombine !== this._combineWhenFull;
        const labelWidthChanged = labelWidth !== this._appLabelWidth;
        if (!combinationChanged && !labelWidthChanged)
            return false;

        this._combineWhenFull = shouldCombine;
        this._appLabelWidth = labelWidth;
        if (labelWidthChanged)
            this._applyCurrentButtonWidths();
        return true;
    }

    _calculateWhenFullLayout() {
        const entries = this._uncombinedEntries(
            this._orderedApps(this._startupSettling)
        );
        const showLabels = !this._settings.get_boolean('hide-app-labels');
        const spacing = Math.max(this._settings.get_int('icon-spacing'), 0);
        const spacingWidth = Math.max(0, entries.length - 1) * spacing;
        const fixedButtonsWidth = entries.reduce((width, entry) =>
            width + this._buttonWidth(entry.window, false), 0);
        const labelCount = showLabels
            ? entries.filter(entry => Boolean(entry.window)).length
            : 0;
        const fixedWidth = fixedButtonsWidth + spacingWidth +
            labelCount * APP_LABEL_SPACING;

        if (labelCount === 0) {
            return {
                combine: fixedWidth > this._availableWidth,
                labelWidth: APP_LABEL_WIDTH,
            };
        }

        const minimumWidth = fixedWidth +
            labelCount * APP_LABEL_MIN_WIDTH;
        if (minimumWidth > this._availableWidth) {
            return {
                combine: true,
                labelWidth: APP_LABEL_MIN_WIDTH,
            };
        }

        return {
            combine: false,
            labelWidth: Math.min(
                APP_LABEL_WIDTH,
                Math.max(
                    APP_LABEL_MIN_WIDTH,
                    Math.floor(
                        (this._availableWidth - fixedWidth) / labelCount
                    )
                )
            ),
        };
    }

    _showAppLabels() {
        return !this._combineAppButtons() &&
            !this._settings.get_boolean('hide-app-labels');
    }

    _hasItemsForApp(appId) {
        return [...this._appButtons.values()].some(item =>
            item._taskbarApp.get_id() === appId
        );
    }

    _getRunningApps() {
        const apps = [];
        const seen = new Set();

        for (const windowActor of global.get_window_actors()) {
            const window = windowActor.meta_window;
            if (!window || window.skip_taskbar) {
                continue;
            }

            const app = this._tracker.get_window_app(window);
            const appId = app?.get_id();
            if (!appId || seen.has(appId) ||
                this._interestingWindows(app).length === 0) {
                continue;
            }

            seen.add(appId);
            apps.push(app);
        }
        return apps;
    }

    _createAppButton(app, window = null) {
        const glassWidth = this._buttonWidth(window);
        const item = new TaskbarItemContainer();
        item.add_style_class_name('simple-taskbar-app-item');
        item.reactive = true;
        item.track_hover = true;
        item.y_align = Clutter.ActorAlign.FILL;
        item.set_height(this._panelHeight);
        item.connect('notify::allocation', () => {
            this.queueIconGeometryUpdate();
        });
        // Scale the visual; scaling the slot also changes its allocation.
        const slot = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            height: this._panelHeight,
            clip_to_allocation: false,
        });
        const visual = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            height: this._panelHeight,
            clip_to_allocation: false,
        });
        visual.set_pivot_point(0.5, 0.5);
        const glassHost = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            height: this._panelHeight,
            clip_to_allocation: false,
        });
        const glass = new St.Widget({
            style_class: 'simple-taskbar-app-glass',
            x: 0,
            y: 4,
            width: glassWidth,
            height: Math.max(1, this._panelHeight - 8),
        });
        glassHost.add_child(glass);
        const layout = new St.Widget({
            layout_manager: new Clutter.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
            }),
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        const topSpacer = new St.Widget({height: 7});
        const content = new St.Widget({
            style_class: 'simple-taskbar-app-content',
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_expand: true,
        });
        const icon = app.create_icon_texture(this._iconSize);
        icon.x_align = Clutter.ActorAlign.CENTER;
        icon.y_align = Clutter.ActorAlign.CENTER;
        const buttonContent = new St.BoxLayout({
            style_class: 'simple-taskbar-app-button-content',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        buttonContent.add_child(icon);
        const label = new St.Label({
            style_class: 'simple-taskbar-app-label',
            text: window?.get_title() || app.get_name(),
            width: this._appLabelWidth,
            y_align: Clutter.ActorAlign.CENTER,
            visible: Boolean(window) && this._showAppLabels(),
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        buttonContent.add_child(label);
        content.add_child(buttonContent);

        const button = new St.Button({
            style_class: 'simple-taskbar-app-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            accessible_name: app.get_name(),
            child: layout,
        });
        const indicator = new St.BoxLayout({
            style_class: 'simple-taskbar-running-indicator',
            x_align: Clutter.ActorAlign.CENTER,
        });
        const indicatorPrimary = new St.Widget({
            style_class: 'simple-taskbar-running-indicator-segment',
            x_expand: true,
        });
        const indicatorSecondary = new St.Widget({
            style_class: 'simple-taskbar-running-indicator-segment',
            x_expand: true,
            visible: false,
        });
        indicator.add_child(indicatorPrimary);
        indicator.add_child(indicatorSecondary);
        layout.add_child(topSpacer);
        layout.add_child(content);
        layout.add_child(indicator);
        visual.add_child(glassHost);
        visual.add_child(button);
        slot.add_child(visual);
        item.setChild(slot);

        item._taskbarApp = app;
        item._taskbarWindow = window;
        item._taskbarButton = button;
        item._taskbarIcon = icon;
        item._taskbarLabel = label;
        item._taskbarSlot = slot;
        item._taskbarVisual = visual;
        item._taskbarGlassHost = glassHost;
        item._taskbarGlass = glass;
        item._taskbarIndicatorSecondary = indicatorSecondary;
        if (window) {
            window.connectObject(
                'notify::title',
                () => this._syncItemLabel(item),
                item
            );
        }

        item.connect('notify::hover', () => {
            if (this._dragging)
                return;
            if (item.hover) {
                item.add_style_pseudo_class('hover');
                const windowCount = this._windowsForItem(item).length;
                if (this._windowPreviews.currentItem &&
                    this._windowPreviews.currentItem !== item) {
                    if (windowCount > 0)
                        this._windowPreviews.scheduleSwitch(item);
                    else
                        this._windowPreviews.hide(true);
                } else {
                    this._windowPreviews.schedule(item);
                }
                if (windowCount === 0)
                    this._windowPreviews.scheduleTooltip(item);
                else
                    this._windowPreviews.hideTooltip();
            } else {
                if (this._windowPreviews.hoverItem !== item)
                    item.remove_style_pseudo_class('hover');
                if (this._windowPreviews.tooltipItem === item)
                    this._windowPreviews.hideTooltip();
                this._windowPreviews.scheduleClose();
            }
        });

        this._makeDraggable(item, button, icon, app);
        this._applyButtonSpacing(item);
        this._createAppMenu(button, app, item);
        button.connect('clicked', () => {
            this._windowPreviews.hideTooltip();
            const targetWindow = item._taskbarWindow;
            if (!targetWindow && this._favorites.isFavorite(app.get_id()) &&
                this._interestingWindows(app).length === 0) {
                this._animatePinnedLaunch(item);
            }
            if (targetWindow) {
                this._windowPreviews.hide();
                this._onWindowClicked(targetWindow);
            } else {
                this._onAppClicked(item, app);
            }
        });
        button.connect('button-press-event', (_actor, event) => {
            const mouseButton = event.get_button();
            if (mouseButton === 2) {
                this._windowPreviews.hideTooltip();
                this._windowPreviews.hide();
                if (this._favorites.isFavorite(app.get_id()))
                    this._animatePinnedLaunch(item);
                this._openNewWindow(app);
                return Clutter.EVENT_STOP;
            }
            if (mouseButton === 3) {
                this._windowPreviews.hideTooltip();
                this._windowPreviews.hide();
                this._popupAppMenu(button);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('popup-menu', () => {
            this._popupAppMenu(button);
            return Clutter.EVENT_STOP;
        });

        return item;
    }

    _makeDraggable(item, button, icon, app) {
        const dragSource = {
            app,
            _taskbarItem: item,
            getDragActor: () => app.create_icon_texture(this._iconSize),
            getDragActorSource: () => icon,
        };
        button._delegate = dragSource;

        const draggable = DND.makeDraggable(button, {
            timeoutThreshold: 200,
            dragActorMaxSize: this._iconSize,
        });
        item._taskbarDraggable = draggable;
        draggable._dndGesture.enabled =
            !this._settings.get_boolean('taskbar-locked') &&
            this._combineAppButtons();
        draggable.connect('drag-begin', () => {
            this._dragging = true;
            item.opacity = 96;
            this._windowPreviews.hideTooltip(false);
            this._windowPreviews.hide();
            button._taskbarMenu?.close();
        });
        draggable.connect('drag-end', () => {
            item.opacity = 255;
            this._dragging = false;
            this._queueRedisplay();
        });
    }

    _syncDragEnabled() {
        const enabled = !this._settings.get_boolean('taskbar-locked') &&
            this._combineAppButtons();
        for (const item of this._appButtons.values()) {
            const gesture = item._taskbarDraggable?._dndGesture;
            if (gesture)
                gesture.enabled = enabled;
        }
    }

    _createAppMenu(button, app, item) {
        const menu = new TaskbarAppMenu(button, panelArrowSide(this._settings), {
            favoritesSection: true,
            showSingleWindows: true,
        });
        const menuManager = new PopupMenu.PopupMenuManager(button);

        menu.setApp(app);
        menu.connect('open-state-changed', (_popup, isOpen) => {
            if (isOpen) {
                item.add_style_pseudo_class('hover');
            } else if (!item.hover &&
                this._windowPreviews.hoverItem !== item) {
                item.remove_style_pseudo_class('hover');
            }
        });
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        menuManager.addMenu(menu);

        button._taskbarMenu = menu;
        button._taskbarMenuManager = menuManager;
    }

    _popupAppMenu(button) {
        this._windowPreviews.hideTooltip();
        this._windowPreviews.hide();
        const menu = button._taskbarMenu;
        if (!menu)
            return;

        syncMenuArrowSide(menu, this._settings);
        menu.open(BoxPointer.PopupAnimation.FULL);
    }

    _destroyAppMenu(button) {
        this._windowPreviews?.destroyButton(button);
        button._taskbarMenu?.destroy();
        button._taskbarMenu = null;
        button._taskbarMenuManager = null;
    }

    _trackApp(app) {
        if (this._appSignals.has(app))
            return;

        const id = app.connect('windows-changed', () => {
            this._windowPreviews.windowsChanged(app);
            if (this._combineMode() === 'always' &&
                this._isPersistentPinned(app)) {
                this.syncButtonStates();
                this.queueIconGeometryUpdate();
                return;
            }
            this._queueRedisplay();
        });
        this._appSignals.set(app, id);
    }

    _animateItemIn(item, animate) {
        if (!this._centered) {
            item.show(animate);
            return;
        }

        // Reserve the centered slot, then animate its visual translation.
        item.show(false);
        item.remove_all_transitions();
        item.scale_x = 1;
        item.scale_y = 1;
        item.opacity = 255;
        if (!animate)
            return;

        const visual = item._taskbarVisual;
        const alignmentActor = this._alignmentActor ?? this.actor;
        const offset = this._membershipAnimationOffset(item);
        visual.remove_all_transitions();
        visual.opacity = 0;
        visual.scale_x = 0;
        visual.scale_y = 0;
        alignmentActor.remove_transition('translation-x');
        alignmentActor.translation_x = offset;
        alignmentActor.ease({
            translation_x: 0,
            duration: ITEM_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        visual.ease({
            scale_x: 1,
            scale_y: 1,
            opacity: 255,
            duration: ITEM_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _placeItemAtActiveIndex(item, index) {
        const children = this.actor.get_children();
        const activeChildren = children.filter(child =>
            child !== item && !child._taskbarAnimatingOut
        );
        const currentActiveChildren = children.filter(child =>
            !child._taskbarAnimatingOut
        );
        if (currentActiveChildren.indexOf(item) === index)
            return;

        const next = activeChildren[index] ?? null;
        const currentActorIndex = children.indexOf(item);
        let actorIndex = next
            ? children.indexOf(next)
            : children.length;
        if (currentActorIndex >= 0 && currentActorIndex < actorIndex)
            actorIndex--;

        if (currentActorIndex >= 0)
            this.actor.set_child_at_index(item, actorIndex);
        else
            this.actor.insert_child_at_index(item, actorIndex);
    }

    _animateItemOutAndDestroy(item) {
        if (!item.get_stage()) {
            item.destroy();
            return;
        }

        item.reactive = false;
        if (!this._centered) {
            item.animateOutAndDestroy();
            return;
        }

        const visual = item._taskbarVisual;
        const alignmentActor = this._alignmentActor ?? this.actor;
        const offset = this._membershipAnimationOffset(item);
        item.animatingOut = true;
        visual.remove_all_transitions();
        alignmentActor.remove_transition('translation-x');
        alignmentActor.translation_x = 0;
        alignmentActor.ease({
            translation_x: offset,
            duration: ITEM_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        visual.ease({
            scale_x: 0,
            scale_y: 0,
            opacity: 0,
            duration: ITEM_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                item.destroy();
                alignmentActor.translation_x = 0;
            },
        });
    }

    _membershipAnimationOffset(item) {
        const [, itemWidth] = item.get_preferred_width(this._panelHeight);
        const spacing = this.actor.get_n_children() > 1
            ? Math.max(this._settings.get_int('icon-spacing'), 0)
            : 0;
        return (itemWidth + spacing) / 2;
    }

    _animatePinnedLaunch(item) {
        const icon = item?._taskbarIcon;
        if (icon?.get_stage() && icon.has_allocation())
            IconGrid.zoomOutActor(icon);
    }

    _untrackApp(app) {
        const id = this._appSignals.get(app);
        if (!id)
            return;

        app.disconnect(id);
        this._appSignals.delete(app);
    }

    _updateGlassGeometry(item) {
        const glassWidth = this._buttonWidth(item._taskbarWindow);
        const glassHeight = Math.max(1, this._panelHeight - 8);

        item._taskbarButton.set_width(glassWidth);
        item._taskbarSlot.set_size(glassWidth, this._panelHeight);
        item._taskbarVisual.set_size(glassWidth, this._panelHeight);
        item._taskbarGlassHost.set_size(glassWidth, this._panelHeight);
        item._taskbarGlass.set_position(0, 4);
        item._taskbarGlass.set_size(glassWidth, glassHeight);
        item._taskbarLabel.set_width(this._appLabelWidth);
    }

    _buttonWidth(
        window,
        showLabels = this._showAppLabels(),
        labelWidth = this._appLabelWidth
    ) {
        const iconWidth = Math.max(this._iconSize, 21) + 8;
        return window && showLabels
            ? iconWidth + APP_LABEL_SPACING + labelWidth
            : iconWidth;
    }

    _applyCurrentButtonWidths() {
        let width = 0;
        for (const item of this._appButtons.values()) {
            this._updateGlassGeometry(item);
            width += item._taskbarSlot.width;
        }
        const spacing = Math.max(this._settings.get_int('icon-spacing'), 0);
        width += Math.max(0, this._appButtons.size - 1) * spacing;
        this.actor.set_width(width > 0 ? Math.ceil(width) : -1);
    }

    _syncItemLabel(item) {
        const label = item?._taskbarLabel;
        if (!label)
            return;

        const window = item._taskbarWindow;
        const text = window?.get_title() || item._taskbarApp.get_name();
        label.text = text;
        label.visible = Boolean(window) && this._showAppLabels();
        if (window)
            item._taskbarButton.accessible_name = `${text}, ${_('running')}`;
    }

    _applyButtonSpacing(button) {
        const spacing = this._settings.get_int('icon-spacing');
        button.set_style(spacing < 0 ? `margin-right: ${spacing}px;` : '');
    }
}
