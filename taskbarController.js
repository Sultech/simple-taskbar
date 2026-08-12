// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {TaskbarDragController} from './taskbarDragController.js';
import {TaskbarAppItemFactory} from './taskbarAppItemFactory.js';
import {TaskbarAppearanceController} from './taskbarAppearanceController.js';
import {TaskbarEntryModel} from './taskbarEntryModel.js';
import {
    TaskbarItemInteractionController,
} from './taskbarItemInteractionController.js';
import {
    animatePinnedLaunch,
    animateTaskbarItemIn,
    animateTaskbarItemOutAndDestroy,
    placeTaskbarItemAtIndex,
} from './taskbarItemLifecycle.js';
import {
    TaskbarShowDesktopController,
} from './taskbarShowDesktopController.js';

const STARTUP_SETTLE_DELAY = 750;
const APP_LABEL_WIDTH = 140;
const ROUNDED_INDICATORS_CLASS =
    'simple-taskbar-rounded-indicators';

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
        onShowDesktopClicked,
        onShowDesktopModeChanged,
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
        this._onShowDesktopClicked = onShowDesktopClicked;
        this._onShowDesktopModeChanged = onShowDesktopModeChanged;
        this._windowPreviews = null;
        this._alignmentActor = null;
        this._signals = [];
        this._appSignals = new Map();
        this._appButtons = new Map();
        this._auxiliaryItems = new Set();
        this._preserveItemWidths = false;
        this._dragEnabled = null;
        this._suppressMembershipAnimation = false;
        this._iconGeometryUpdateId = 0;
        this._iconGeometryUpdatesEnabled = true;
        this._activeWorkspace = null;
        this._activeWorkspaceSignalIds = [];
        this._shownInitially = false;
        this._availableWidth = 0;
        this._whenFullCombinedApps = new Set();
        this._startMenuOpen = false;
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
        this._entryModel = new TaskbarEntryModel({
            settings: this._settings,
            tracker: this._tracker,
            favorites: this._favorites,
            getInterestingWindows: app => this._interestingWindows(app),
        });
        this._appearanceController = new TaskbarAppearanceController({
            settings: this._settings,
            taskbarActor: this.actor,
            getAppItems: () => this._appButtons.values(),
            getAppLabelWidth: () => this._appLabelWidth,
            getIconSize: () => this._iconSize,
            getPanelHeight: () => this._panelHeight,
            showAppLabels: () => this._showAppLabels(),
        });
        this._dragController = new TaskbarDragController({
            settings: this._settings,
            favorites: this._favorites,
            taskbarActor: this.actor,
            dropTarget: this,
            dragIsEnabled: item => this._dragIsEnabled(item),
            getIconSize: () => this._iconSize,
            getPanelHeight: () => this._panelHeight,
            hidePreviews: () => {
                this._windowPreviews.hideTooltip(false);
                this._windowPreviews.hide();
            },
            isPersistentPinned: app => this._isPersistentPinned(app),
            queueRedisplay: () => this._queueRedisplay(),
            setSessionOrder: order => this._entryModel.setSessionOrder(order),
            usePinnedAppLaunchers: () => this._usePinnedAppLaunchers(),
        });
        this._showDesktopController = new TaskbarShowDesktopController({
            settings: this._settings,
            taskbarActor: this.actor,
            cancelDrag: () => this._dragController.cancel(),
            dragIsEnabled: item => this._dragIsEnabled(item),
            finishDrag: item => this._dragController.finish(item),
            getPanelHeight: () => this._panelHeight,
            getPreserveItemWidths: () => this._preserveItemWidths,
            notifyModeChanged: () => this._onShowDesktopModeChanged(),
            queueRedisplay: () => this._queueRedisplay(),
            replaceButton: null,
            startDrag: item => this._dragController.begin(item),
        });
        this._dragController.setShowDesktopController(
            this._showDesktopController
        );
        this._itemInteractionController =
            new TaskbarItemInteractionController({
                settings: this._settings,
                favorites: this._favorites,
                animatePinnedLaunch: item => animatePinnedLaunch(item),
                closeApp: (app, timestamp) => this.closeApp(app, timestamp),
                getInterestingWindows: app => this._interestingWindows(app),
                getPreviewController: () => this._windowPreviews,
                isDragging: () => this.isDragging,
                onAppClicked: (item, app) => this._onAppClicked(item, app),
                onWindowClicked: window => this._onWindowClicked(window),
                openNewWindow: app => this._openNewWindow(app),
                windowsForItem: item => this._windowsForItem(item),
            });
        this._appItemFactory = new TaskbarAppItemFactory({
            activateItem: item => this.activateItem(item),
            getButtonContentHeight: () => this._buttonContentHeight(),
            getButtonWidth: (window, isCombined) => this._buttonWidth(
                window,
                this._showAppLabels(),
                this._appLabelWidth,
                isCombined
            ),
            getGlassHeight: () => this._glassHeight(),
            getGlassInset: () => this._glassInset(),
            getGlassY: () => this._glassY(),
            getIconSize: () => this._iconSize,
            getLabelWidth: (window, isCombined) =>
                this._labelWidthForButton(window, isCombined),
            getPanelHeight: () => this._panelHeight,
            getPreserveItemWidths: () => this._preserveItemWidths,
            getSlotWidth: (window, isLauncher, isCombined) =>
                this._itemSlotWidth(
                    window,
                    isLauncher,
                    false,
                    isCombined
                ),
            handleHover: (item, hovering) =>
                this.handleItemHover(item, hovering),
            handleMiddleClick: item => this.handleItemMiddleClick(item),
            initializeAppearance: (item, glassWidth) => {
                this._syncIndicatorVisibility(item);
                this._updateIndicatorGeometry(item, false, glassWidth);
            },
            makeDraggable: (item, button, icon, app) =>
                this._dragController.makeDraggable(item, button, icon, app),
            popupMenu: (item, button) => this.popupItemMenu(item, button),
            queueIconGeometryUpdate: () => this.queueIconGeometryUpdate(),
            showAppLabels: () => this._showAppLabels(),
            syncItemLabel: item => this._syncItemLabel(item),
            syncLauncherIconPosition: item =>
                this._syncLauncherIconPosition(item),
        });
    }

    get _showDesktopItem() {
        return this._showDesktopController.item;
    }

    setPreviewController(controller) {
        this._windowPreviews = controller;
    }

    setAlignmentActor(actor) {
        this._alignmentActor = actor;
        this._dragController.setAlignmentActor(actor);
    }

    setShowDesktopButton(button, replaceButton) {
        this._showDesktopController.setButton(button, replaceButton);
    }

    activateShowDesktop() {
        this._onShowDesktopClicked();
    }

    getItems() {
        return [...this._appButtons.values(), ...this._auxiliaryItems];
    }

    getOrderedItems() {
        const items = new Set(this._appButtons.values());
        if (this._showDesktopItem)
            items.add(this._showDesktopItem);
        return this.actor.get_children().filter(item => items.has(item));
    }

    setPreserveItemWidths(preserve) {
        if (preserve === this._preserveItemWidths)
            return;

        this._preserveItemWidths = preserve;
        for (const item of this._appButtons.values())
            item.setPreserveNaturalWidth(preserve);
        this._showDesktopController.setPreserveItemWidths(preserve);
    }

    registerAuxiliaryItem(item) {
        this._auxiliaryItems.add(item);
    }

    removeAuxiliaryItem(item) {
        this._auxiliaryItems.delete(item);
        this._windowPreviews.removeItem(item);
        this._destroyAppMenu(item._taskbarButton);
    }

    addDragEndListener(listener) {
        this._dragController.addListener(listener);
    }

    removeDragEndListener(listener) {
        this._dragController.removeListener(listener);
    }

    isTaskbarItemDraggable(item) {
        return this._dragIsEnabled(item);
    }

    isTaskbarItemPinned(item) {
        return this._dragController.isPinnedItem(item);
    }

    getTaskbarDragGroup(item) {
        return this._dragController.getGroup(item);
    }

    beginExternalTaskbarDrag(item) {
        this._dragController.begin(item);
    }

    finishExternalTaskbarDrag(item, _draggable) {
        this._dragController.finish(item);
    }

    hasOpenMenu() {
        return this.getItems().some(item =>
            item._taskbarButton?._taskbarMenu?.isOpen
        );
    }

    get isDragging() {
        return this._dragController.isDragging;
    }

    hasTarget(target) {
        for (const item of this._appButtons.values()) {
            if (item === target || item.contains(target))
                return true;
        }
        if (this._showDesktopItem &&
            (this._showDesktopItem === target ||
                this._showDesktopItem.contains(target))) {
            return true;
        }
        return false;
    }

    enable() {
        this._dragController.enable();
        if (this._startupSettling) {
            this._connect(Main.layoutManager, 'startup-complete', () => {
                this._scheduleStartupSettle();
            });
        }
        this._connect(this._appSystem, 'app-state-changed', (_system, app) => {
            if (this._combineMode() === 'always' &&
                !this._usePinnedAppLaunchers() &&
                this._isPersistentPinned(app) &&
                this._hasItemsForApp(app.get_id())) {
                this.syncButtonStates();
                return;
            }
            this._queueRedisplay();
        });
        this._connect(this._favorites, 'changed', () => {
            this._queueRedisplay();
            if (!this.isDragging)
                this._syncDragEnabled(true);
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
                this._entryModel.resetSessionOrder();
                this._queueRedisplay();
                this._syncDragEnabled(true);
            }
        );
        this._connect(
            this._settings,
            'changed::use-pinned-apps-as-launchers',
            () => {
                this._windowPreviews.hideTooltip(false);
                this._windowPreviews.hide();
                this._shownInitially = false;
                this._queueRedisplay();
                this._syncDragEnabled();
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
                this._syncCombineWhenFull();
                this._shownInitially = false;
                this._queueRedisplay();
                this._syncDragEnabled();
            }
        );
        this._connect(this._settings, 'changed::hide-app-labels', () => {
            const {combinationChanged} = this._syncCombineWhenFull();
            if (combinationChanged) {
                this._shownInitially = false;
                this._windowPreviews.hideTooltip(false);
                this._windowPreviews.hide();
                this._queueRedisplay();
                this._syncDragEnabled();
            }
            for (const item of this._appButtons.values()) {
                this._syncItemLabel(item);
                this._updateGlassGeometry(item);
            }
            this.queueIconGeometryUpdate();
        });
        this._connect(
            this._settings,
            'changed::nautilus-places-enabled',
            () => this._syncFileManagerPlaces()
        );
        this._connect(
            this._settings,
            'changed::running-indicator-style',
            () => this.applyAppearance()
        );
        this._connect(
            this._settings,
            'changed::windows-xp-theme-enabled',
            () => this.applyAppearance()
        );
        for (const key of [
            'custom-indicator-colors-enabled',
            'focused-indicator-color',
            'unfocused-indicator-color',
        ]) {
            this._connect(this._settings, `changed::${key}`, () => {
                for (const item of this._appButtons.values())
                    this._syncIndicatorColor(item);
            });
        }
        this._connect(this._settings, 'changed::taskbar-locked', () => {
            this._syncDragEnabled();
        });
        this._connect(this.actor, 'notify::allocation', () => {
            this.queueIconGeometryUpdate();
        });
        this._connectActiveWorkspaceSignals();
        this._showDesktopController.enable();
        this._syncApplicationVisibility();
    }

    destroy() {
        this._iconGeometryUpdatesEnabled = false;
        this._showDesktopController.destroy();
        this._showDesktopController = null;
        this._dragController.destroy();
        this._dragController = null;
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

        for (const item of [...this._auxiliaryItems])
            this.removeAuxiliaryItem(item);
        this._auxiliaryItems.clear();

        for (const item of this._appButtons.values()) {
            this._windowPreviews?.removeItem(item);
            this._destroyAppMenu(item._taskbarButton);
            item.destroy();
        }
        this._appButtons.clear();
        this._appItemFactory.destroy();
        this._appItemFactory = null;
        this._itemInteractionController.destroy();
        this._itemInteractionController = null;
        this._appearanceController.destroy();
        this._appearanceController = null;
        this._entryModel.destroy();
        this._entryModel = null;
        this.actor.destroy();
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
        this._onShowDesktopClicked = null;
        this._onShowDesktopModeChanged = null;
        this._auxiliaryItems = null;
        this._preserveItemWidths = false;
        this._activeWorkspace = null;
        this._activeWorkspaceSignalIds = null;
        this._shownInitially = false;
        this._availableWidth = 0;
        this._whenFullCombinedApps = null;
        this._startMenuOpen = false;
        this._appLabelWidth = APP_LABEL_WIDTH;
        this._startupSettling = false;
    }

    setAvailableWidth(width) {
        this._availableWidth = Math.max(0, Math.floor(width));
        if (this._syncCombineWhenFull().combinationChanged) {
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

    setStartMenuOpen(open) {
        if (this._startMenuOpen === open)
            return;

        this._startMenuOpen = open;
        this.syncButtonStates();
    }

    setPanelHeight(panelHeight) {
        this._panelHeight = panelHeight;
        for (const item of this._appButtons.values()) {
            item.set_height(panelHeight);
            item._taskbarButtonContent.set_height(
                this._buttonContentHeight()
            );
            this._updateGlassGeometry(item);
        }
        this._syncTaskbarEdgeSpacing();
        this.queueIconGeometryUpdate();
    }

    applyAppearance() {
        this.actor.set_style('spacing: 0;');
        this.actor.x_align = Clutter.ActorAlign.START;
        this._syncIndicatorStyle();
        for (const item of this._appButtons.values()) {
            this._syncIndicatorVisibility(item);
            this._updateGlassGeometry(item);
        }
        this._syncTaskbarEdgeSpacing();
        this.actor.queue_relayout();
    }

    _syncTaskbarEdgeSpacing() {
        const activeChildren = this.actor.get_children().filter(child =>
            !child.animatingOut
        );
        const showDesktopIndex = activeChildren.indexOf(
            this._showDesktopItem
        );
        const showDesktopNextItem = showDesktopIndex >= 0
            ? activeChildren[showDesktopIndex + 1]
            : null;
        const showDesktopRunningGap = showDesktopIndex >= 0 &&
            showDesktopNextItem !== undefined &&
            !showDesktopNextItem._taskbarIsLauncher;
        const showDesktopPreviousItem = showDesktopRunningGap
            ? activeChildren[showDesktopIndex - 1]
            : null;
        let trailingItem = null;
        for (const child of this.actor.get_children()) {
            if (!child.animatingOut)
                trailingItem = child;
        }

        for (const item of this._appButtons.values()) {
            const pinnedToRunningGap = item._taskbarPinnedToRunningGap &&
                item !== showDesktopPreviousItem;
            const trailingSpacing = item === trailingItem &&
                item._taskbarIsLauncher;
            if (item._taskbarPinnedToRunningGap === pinnedToRunningGap &&
                item._taskbarTrailingSpacing === trailingSpacing) {
                continue;
            }

            item._taskbarPinnedToRunningGap = pinnedToRunningGap;
            item._taskbarTrailingSpacing = trailingSpacing;
            this._updateGlassGeometry(item);
        }

        this._showDesktopController.updateGeometry(
            this._showDesktopItem === trailingItem,
            showDesktopRunningGap
        );
    }

    activateItem(item, interactionItem = item) {
        return this._itemInteractionController.activate(
            item,
            interactionItem
        );
    }

    handleItemMiddleClick(item) {
        this._itemInteractionController.middleClick(item);
    }

    popupItemMenu(item, button = item._taskbarButton) {
        this._itemInteractionController.popupMenu(item, button);
    }

    handleItemHover(item, hovering, styleItem = item, retainForPreview = true) {
        this._itemInteractionController.hover(
            item,
            hovering,
            styleItem,
            retainForPreview
        );
    }


    _syncIndicatorStyle() {
        const rounded = this._settings.get_string(
            'running-indicator-style'
        ) === 'rounded';
        if (rounded)
            this.actor.add_style_class_name(ROUNDED_INDICATORS_CLASS);
        else
            this.actor.remove_style_class_name(ROUNDED_INDICATORS_CLASS);
    }

    redisplay() {
        if (this.isDragging)
            return;

        if (this._settings.get_boolean('default-gnome-panel')) {
            this._clearAppButtons();
            return;
        }

        const {combinationChanged, labelWidthChanged} =
            this._syncCombineWhenFull();
        if (combinationChanged) {
            this._shownInitially = false;
            this._windowPreviews?.hideTooltip(false);
            this._windowPreviews?.hide();
            this._syncDragEnabled();
        }
        const entries = this._orderedEntries(this._startupSettling);
        const animateIndicators = this._shownInitially &&
            !this._startupSettling && !labelWidthChanged;
        const animateMembershipChanges = animateIndicators &&
            !this._suppressMembershipAnimation;
        this._suppressMembershipAnimation = false;
        const wantedKeys = new Set(entries.map(entry => entry.key));
        const wantedAppIds = new Set(
            entries.map(entry => entry.app.get_id())
        );

        for (const [key, item] of this._appButtons) {
            if (!wantedKeys.has(key)) {
                this._windowPreviews.removeItem(item);
                this._destroyAppMenu(item._taskbarButton);
                this._appButtons.delete(key);
                if (this._isPinnedPlaceholder(
                    item._taskbarApp,
                    item._taskbarWindow,
                    item._taskbarIsLauncher
                ) || !animateMembershipChanges) {
                    item.destroy();
                } else {
                    animateTaskbarItemOutAndDestroy(item);
                }
            }
        }

        for (let index = 0; index < entries.length; index++) {
            const {
                key,
                app,
                window,
                isLauncher,
                isCombined,
                isPinnedPrimary,
            } = entries[index];
            const pinnedToRunningGap = isLauncher &&
                index + 1 < entries.length &&
                !entries[index + 1].isLauncher;
            let item = this._appButtons.get(key);
            if (!item) {
                item = this._createAppButton(
                    app,
                    window,
                    isLauncher,
                    isCombined,
                    isPinnedPrimary
                );
                this._trackApp(app);
                this._appButtons.set(key, item);
                this._syncButtonState(
                    item,
                    this._tracker?.focus_app,
                    global.display.focus_window,
                    false
                );
                placeTaskbarItemAtIndex(
                    this.actor,
                    item,
                    index,
                    this._showDesktopItem
                );
                animateTaskbarItemIn(
                    item,
                    animateMembershipChanges &&
                        !this._isPinnedPlaceholder(
                            app,
                            window,
                            isLauncher
                        )
                );
            } else {
                placeTaskbarItemAtIndex(
                    this.actor,
                    item,
                    index,
                    this._showDesktopItem
                );
            }
            item._taskbarIsPinnedPrimary = isPinnedPrimary;

            if (item._taskbarPinnedToRunningGap !== pinnedToRunningGap) {
                item._taskbarPinnedToRunningGap = pinnedToRunningGap;
                this._updateGlassGeometry(item);
            }
        }

        for (const app of [...this._appSignals.keys()]) {
            if (!wantedAppIds.has(app.get_id()))
                this._untrackApp(app);
        }

        this._showDesktopController.place();
        this._syncTaskbarEdgeSpacing();
        this._shownInitially = true;
        this.syncButtonStates(animateIndicators);
        this.actor.queue_relayout();
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
        for (const child of this.actor.get_children()) {
            if (child === this._showDesktopItem)
                continue;
            child.remove_all_transitions();
            child.destroy();
        }
        this._entryModel.resetSessionOrder();
        this._shownInitially = false;
    }

    syncButtonStates(animate = true) {
        const focusedApp = this._tracker?.focus_app;
        const focusedWindow = global.display.focus_window;
        for (const item of this._appButtons.values())
            this._syncButtonState(item, focusedApp, focusedWindow, animate);
    }

    _syncButtonState(item, focusedApp, focusedWindow, animate) {
        const app = item._taskbarApp;
        const window = item._taskbarWindow;
        const button = item._taskbarButton;
        const isLauncher = item._taskbarIsLauncher;
        const windowCount = isLauncher
            ? 0
            : this._windowsForItem(item).length;
        const running = !isLauncher && (window
            ? windowCount > 0
            : app.state === Shell.AppState.RUNNING && windowCount > 0);
        const hasFocus = !isLauncher && (window
            ? window === focusedWindow
            : app === focusedApp &&
                this._interestingWindows(app).includes(focusedWindow));
        const focused = hasFocus && !this._startMenuOpen;
        item.set_style_class_name(
            `dash-item-container simple-taskbar-app-item` +
            `${isLauncher ? ' simple-taskbar-app-launcher' : ''}` +
            `${running ? ' running' : ''}` +
            `${!isLauncher && !window && windowCount > 1
                ? ' multiple-windows'
                : ''}` +
            `${focused ? ' focused' : ''}`
        );
        item._taskbarFocused = focused;
        item._taskbarRunning = running;
        item._taskbarMultipleWindows = !window && windowCount > 1;
        item._taskbarShowSecondary =
            !window && focused && windowCount > 1;
        this._updateIndicatorGeometry(item, animate);
        this._syncIndicatorColor(item);
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

    reorderTaskbarItem(sourceItem, targetItem, insertBefore) {
        return this._dragController.reorderItem(
            sourceItem,
            targetItem,
            insertBefore
        );
    }

    handleDragOver(source, _actor, x, _y, _time) {
        return this._dragController.handleDragOver(source, x);
    }

    acceptDrop(source, _actor, _x, _y, _time) {
        return this._dragController.acceptDrop(source);
    }

    acceptTaskbarItemDrop(item, source = null) {
        return this._dragController.acceptItemDrop(item, source);
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
        for (const item of this.getItems())
            item._taskbarButton._taskbarMenu?.syncWindowScope();
        this._queueRedisplay();
    }

    _interestingWindows(app) {
        return this._getInterestingWindows(app);
    }

    closeApp(app, timestamp) {
        if (!this._settings.get_boolean('isolate-workspaces') &&
            !this._settings.get_boolean('isolate-monitors')) {
            app.request_quit();
            return;
        }

        for (const window of this._interestingWindows(app)) {
            if (window.get_compositor_private() !== null)
                window.delete(timestamp);
        }
    }

    _windowsForItem(item) {
        if (item._taskbarIsLauncher)
            return [];

        const window = item._taskbarWindow;
        if (!window)
            return this._interestingWindows(item._taskbarApp);

        return this._interestingWindows(item._taskbarApp).includes(window)
            ? [window]
            : [];
    }

    _isPinnedPlaceholder(app, window, isLauncher = false) {
        return !window &&
            this._favorites.isFavorite(app.get_id()) &&
            !this._settings.get_boolean('hide-pinned-taskbar-apps') &&
            (!this._usePinnedAppLaunchers() || isLauncher);
    }

    _isPersistentPinned(app) {
        return this._entryModel.isPersistentPinned(app);
    }

    _usePinnedAppLaunchers() {
        return this._entryModel.usePinnedAppLaunchers();
    }

    _pinnedApps() {
        return this._entryModel.pinnedApps();
    }

    _orderedApps(pinnedOnly = false) {
        return this._entryModel.orderedApps(
            pinnedOnly,
            this._combineMode()
        );
    }

    _orderedEntries(pinnedOnly = false) {
        return this._entryModel.orderedEntries(
            pinnedOnly,
            this._combineMode(),
            this._whenFullCombinedApps
        );
    }

    _uncombinedEntries(
        apps,
        launcherCount = 0,
        combinedAppIds = new Set()
    ) {
        return this._entryModel.uncombinedEntries(
            apps,
            launcherCount,
            combinedAppIds
        );
    }

    _combineMode() {
        return this._settings.get_string('combine-app-buttons-mode');
    }

    _combineAppButtons() {
        return this._combineMode() === 'always';
    }

    _syncCombineWhenFull() {
        let combinedAppIds = new Set();
        let labelWidth = APP_LABEL_WIDTH;
        if (this._combineMode() === 'when-full' &&
            this._availableWidth > 0) {
            const layout = this._calculateWhenFullLayout();
            combinedAppIds = layout.combinedAppIds;
        }

        const combinationChanged = !this._sameAppIdSet(
            combinedAppIds,
            this._whenFullCombinedApps
        );
        const labelWidthChanged = labelWidth !== this._appLabelWidth;
        if (!combinationChanged && !labelWidthChanged)
            return {combinationChanged: false, labelWidthChanged: false};

        this._whenFullCombinedApps = combinedAppIds;
        this._appLabelWidth = labelWidth;
        if (labelWidthChanged)
            this._applyCurrentButtonWidths();
        return {combinationChanged, labelWidthChanged};
    }

    _calculateWhenFullLayout() {
        const pinnedApps = this._pinnedApps();
        const apps = this._orderedApps(this._startupSettling);
        const launcherCount = this._usePinnedAppLaunchers()
            ? pinnedApps.length
            : 0;
        const entries = this._uncombinedEntries(
            apps,
            launcherCount
        );
        const showLabels = !this._settings.get_boolean('hide-app-labels');
        if (this._entriesWidth(entries, showLabels) <= this._availableWidth)
            return {combinedAppIds: new Set()};

        const candidates = [];
        const candidateIds = new Set();
        for (let index = 0; index < apps.length; index++) {
            const app = apps[index];
            const appId = app.get_id();
            if (candidateIds.has(appId))
                continue;

            const windowCount = this._interestingWindows(app).length;
            if (windowCount < 2)
                continue;

            candidateIds.add(appId);
            candidates.push({appId, index, windowCount});
        }

        candidates.sort((a, b) =>
            b.windowCount - a.windowCount || a.index - b.index
        );

        const combinedAppIds = new Set();
        for (const candidate of candidates) {
            combinedAppIds.add(candidate.appId);
            const groupedEntries = this._uncombinedEntries(
                apps,
                launcherCount,
                combinedAppIds
            );
            if (this._entriesWidth(groupedEntries, showLabels) <=
                this._availableWidth) {
                break;
            }
        }

        return {combinedAppIds};
    }

    _entriesWidth(entries, showLabels) {
        return entries.reduce((width, entry, index) => {
            const entryShowLabels = showLabels &&
                (Boolean(entry.window) || entry.isCombined);
            const pinnedToRunningGap = entry.isLauncher &&
                index + 1 < entries.length &&
                !entries[index + 1].isLauncher;
            const transitionGap =
                this._appearanceController.transitionGap(
                    pinnedToRunningGap
                );
            const iconSpacing = this._iconSpacing(entry.isLauncher);
            const trailingSpacing = index + 1 === entries.length &&
                iconSpacing < 0
                ? -iconSpacing
                : 0;
            return width + this._buttonWidth(
                entry.window,
                entryShowLabels,
                APP_LABEL_WIDTH,
                entry.isCombined
            ) + iconSpacing + transitionGap + trailingSpacing;
        }, 0);
    }

    _sameAppIdSet(left, right) {
        if (left.size !== right.size)
            return false;

        return [...left].every(appId => right.has(appId));
    }

    _showAppLabels() {
        return this._combineMode() !== 'always' &&
            !this._settings.get_boolean('hide-app-labels');
    }

    _hasItemsForApp(appId) {
        return [...this._appButtons.values()].some(item =>
            item._taskbarApp.get_id() === appId
        );
    }


    _createAppButton(
        app,
        window = null,
        isLauncher = false,
        isCombined = false,
        isPinnedPrimary = false
    ) {
        return this._appItemFactory.create(
            app,
            window,
            isLauncher,
            isCombined,
            isPinnedPrimary
        );
    }

    _dragIsEnabled(item = null) {
        if (this._settings.get_boolean('taskbar-locked'))
            return false;

        if (item && item._taskbarIsShowDesktop)
            return this._settings.get_boolean('windows-xp-theme-enabled');

        if (!item)
            return true;

        if (item._taskbarIsLauncher)
            return true;

        return !item._taskbarIsPinnedPrimary ||
            this._combineMode() !== 'never';
    }

    _syncDragEnabled(force = false) {
        const configuration = [
            this._settings.get_boolean('taskbar-locked'),
            this._combineMode(),
            this._usePinnedAppLaunchers(),
            this._settings.get_boolean('hide-pinned-taskbar-apps'),
        ].join(':');
        if (!force && configuration === this._dragEnabled)
            return;

        this._dragEnabled = configuration;
        const sessionOrder = this._entryModel.sessionOrder;
        const shownInitially = this._shownInitially;
        this._clearAppButtons();
        this._entryModel.setSessionOrder(sessionOrder);
        this._shownInitially = shownInitially;
        this._suppressMembershipAnimation = true;
        this._showDesktopController.syncDraggable();
        this._queueRedisplay();
    }

    _syncFileManagerPlaces() {
        this._itemInteractionController.syncFileManagerPlaces(
            this.getItems()
        );
    }

    _destroyAppMenu(button) {
        this._itemInteractionController.destroyButton(button);
    }


    _trackApp(app) {
        if (this._appSignals.has(app))
            return;

        const id = app.connect('windows-changed', () => {
            this._windowPreviews.windowsChanged(app);
            if (this._combineMode() === 'always' &&
                !this._usePinnedAppLaunchers() &&
                this._isPersistentPinned(app)) {
                this.syncButtonStates();
                this.queueIconGeometryUpdate();
                return;
            }
            this._queueRedisplay();
        });
        this._appSignals.set(app, id);
    }


    _untrackApp(app) {
        const id = this._appSignals.get(app);
        if (!id)
            return;

        app.disconnect(id);
        this._appSignals.delete(app);
    }

    _updateGlassGeometry(item) {
        this._appearanceController.updateGlassGeometry(item);
    }

    _glassHeight() {
        return this._appearanceController.glassHeight();
    }

    _glassY() {
        return this._appearanceController.glassY();
    }

    _glassInset() {
        return this._appearanceController.glassInset();
    }

    _updateIndicatorGeometry(item, animate = false, glassWidth = null) {
        if (glassWidth === null) {
            this._appearanceController.updateIndicatorGeometry(item, animate);
        } else {
            this._appearanceController.updateIndicatorGeometry(
                item,
                animate,
                glassWidth
            );
        }
    }

    _syncIndicatorColor(item) {
        this._appearanceController.syncIndicatorColor(item);
    }

    _syncIndicatorVisibility(item) {
        this._appearanceController.syncIndicatorVisibility(item);
    }

    _buttonWidth(
        window,
        showLabels = this._showAppLabels(),
        labelWidth = this._appLabelWidth,
        isCombined = false
    ) {
        return this._appearanceController.buttonWidth(
            window,
            showLabels,
            labelWidth,
            isCombined
        );
    }

    _labelWidthForButton(window, isCombined = false) {
        return this._appearanceController.labelWidthForButton(
            window,
            isCombined
        );
    }

    _buttonContentHeight() {
        return this._appearanceController.buttonContentHeight();
    }

    _syncLauncherIconPosition(item) {
        this._appearanceController.syncLauncherIconPosition(item);
    }

    _iconSpacing(isLauncher) {
        return this._appearanceController.iconSpacing(isLauncher);
    }

    _itemSlotWidth(
        window,
        isLauncher = false,
        pinnedToRunningGap = false,
        isCombined = false,
        trailing = false
    ) {
        return this._appearanceController.itemSlotWidth(
            window,
            isLauncher,
            pinnedToRunningGap,
            isCombined,
            trailing
        );
    }

    _applyCurrentButtonWidths() {
        this._appearanceController.applyCurrentButtonWidths();
    }

    _syncItemLabel(item) {
        this._appearanceController.syncItemLabel(item);
    }

}
