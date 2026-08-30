// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

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
import {windowsForTaskbarItem} from './taskbarItemWindows.js';
import {
    TaskbarShowDesktopController,
} from './taskbarShowDesktopController.js';
import {
    TaskbarIconGeometryController,
} from './taskbarIconGeometryController.js';
import {
    TaskbarLocationsController,
} from './taskbarLocationsController.js';
import {
    animateSeparatorIn,
    animateSeparatorOut,
    createTaskbarSeparator,
    syncSeparatorGeometry,
    TASKBAR_SEPARATOR_EXTENT,
} from './taskbarSeparator.js';
import {panelIsVertical} from '../panel/panelPosition.js';

const STARTUP_SETTLE_DELAY = 750;
const APP_LABEL_WIDTH = 140;
const ROUNDED_INDICATORS_CLASS =
    'simple-taskbar-rounded-indicators';

function taskbarFocusWindow() {
    let window = global.display.focus_window;
    while (window && window.skip_taskbar)
        window = window.get_transient_for();
    return window;
}

export class TaskbarController {
    constructor({
        settings,
        appSystem,
        tracker,
        favorites,
        notificationBadgeModel,
        iconSize,
        panelHeight,
        getInterestingWindows,
        onAppClicked,
        onWindowClicked,
        openNewWindow,
        onShowDesktopClicked,
        onShowDesktopModeChanged,
        getPreviewController,
        onRedisplay = () => {},
        ignoreTaskbarLock = false,
        locationScope = 'taskbar',
    }) {
        this._settings = settings;
        this._appSystem = appSystem;
        this._tracker = tracker;
        this._favorites = favorites;
        this._notificationBadgeModel = notificationBadgeModel;
        this._iconSize = iconSize;
        this._panelHeight = panelHeight;
        this._getInterestingWindows = getInterestingWindows;
        this._onAppClicked = onAppClicked;
        this._onWindowClicked = onWindowClicked;
        this._openNewWindow = openNewWindow;
        this._onShowDesktopClicked = onShowDesktopClicked;
        this._onShowDesktopModeChanged = onShowDesktopModeChanged;
        this._onRedisplay = onRedisplay;
        this._getPreviews = getPreviewController;
        this._ignoreTaskbarLock = ignoreTaskbarLock;
        this._alignmentActor = null;
        this._signalHolder = new TransientSignalHolder();
        this._appSignals = new Map();
        this._appButtons = new Map();
        this._auxiliaryItems = new Set();
        this._pinnedSeparator = null;
        this._pinnedSeparatorLine = null;
        this._rebuilding = false;
        this._previousPinnedAppIds = new Set();
        this._preserveItemWidths = false;
        this._dragEnabled = null;
        this._suppressMembershipAnimation = false;
        this._activeWorkspace = null;
        this._activeWorkspaceSignalIds = [];
        this._shownInitially = false;
        this._availableWidth = 0;
        this._whenFullCombinedApps = new Set();
        this._startMenuOpen = false;
        this._appLabelWidth = APP_LABEL_WIDTH;
        this._startupSettling = Main.layoutManager._startingUp;
        this._startupSettleId = 0;
        this._locationController = new TaskbarLocationsController({
            settings: this._settings,
            scope: locationScope,
            onChanged: () => this._queueRedisplay(),
        });

        this.actor = new St.BoxLayout({
            style_class: 'simple-taskbar-apps',
            orientation: panelIsVertical(this._settings)
                ? Clutter.Orientation.VERTICAL
                : Clutter.Orientation.HORIZONTAL,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            visible: !this._settings.get_boolean('default-gnome-panel'),
        });
        this.actor._delegate = this;
        this._iconGeometryController = new TaskbarIconGeometryController({
            settings: this._settings,
            taskbarActor: this.actor,
            appButtons: this._appButtons,
            windowsForItem: item => this._windowsForItem(item),
        });
        this._locationActor = new St.BoxLayout({
            style_class: 'simple-taskbar-locations',
            orientation: panelIsVertical(this._settings)
                ? Clutter.Orientation.VERTICAL
                : Clutter.Orientation.HORIZONTAL,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            visible: !this._settings.get_boolean('default-gnome-panel'),
        });
        this._redisplayWorkId = Main.initializeDeferredWork(
            this.actor,
            () => this.redisplay()
        );
        this._entryModel = new TaskbarEntryModel({
            settings: this._settings,
            tracker: this._tracker,
            favorites: this._favorites,
            getInterestingWindows: app => this._interestingWindows(app),
            getLocationEntries: () => this._locationController.getEntries(),
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
                this._getPreviews().hideTooltip(false);
                this._getPreviews().hide();
            },
            isPersistentPinned: app => this._isPersistentPinned(app),
            queueRedisplay: () => this._queueRedisplay(),
            setSessionOrder: order => this._entryModel.setSessionOrder(order),
            ignoreTaskbarLock: this._ignoreTaskbarLock,
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
                getPreviewController: () => this._getPreviews(),
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
            initializeAppearance: item => {
                this._syncIndicatorVisibility(item);
                this._syncNotificationBadgeGeometry(item);
                this._updateGlassGeometry(item);
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
        return [
            ...this.getOrderedApplicationItems(),
            ...this._locationActor.get_children(),
        ];
    }

    getOrderedApplicationItems() {
        const items = new Set(this._appButtons.values());
        if (this._showDesktopItem)
            items.add(this._showDesktopItem);
        return this.actor.get_children().filter(item => items.has(item));
    }

    getLocationActor() {
        return this._locationActor;
    }

    getLocationItems() {
        return this._locationActor.get_children();
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
        this._getPreviews().removeItem(item);
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
            item._taskbarButton._taskbarMenu?.isOpen
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
            Main.layoutManager.connectObject('startup-complete', () => {
                this._scheduleStartupSettle();
            }, this._signalHolder);
        }
        this._appSystem.connectObject('app-state-changed', (_system, app) => {
            if (this._combineMode() === 'always' &&
                !this._usePinnedAppLaunchers() &&
                this._isPersistentPinned(app) &&
                this._hasItemsForApp(app.get_id())) {
                this.syncButtonStates();
                return;
            }
            this._queueRedisplay();
        }, this._signalHolder);
        this._favorites.connectObject('changed', () => {
            this._queueRedisplay();
        }, this._signalHolder);
        this._notificationBadgeModel.connectObject(
            'changed', () => this._syncNotificationBadges(),
            this._signalHolder
        );
        global.display.connectObject('notify::focus-window', () => {
            this.syncButtonStates();
        }, this._signalHolder);
        global.window_manager.connectObject('switch-workspace', () => {
            this._connectActiveWorkspaceSignals();
            this._refreshWorkspaceIsolation(
                false,
                this._settings.get_boolean('isolate-workspaces')
            );
        }, this._signalHolder);
        for (const signal of ['window-entered-monitor', 'window-left-monitor']) {
            global.display.connectObject(signal, () => {
                this._refreshWorkspaceIsolation();
            }, this._signalHolder);
        }
        this._settings.connectObject(
            'changed::hide-pinned-taskbar-apps',
            () => {
                this._entryModel.resetSessionOrder();
                this._queueRedisplay();
                this._syncDragEnabled(true);
            },
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::hide-unpinned-taskbar-apps',
            () => {
                this._entryModel.resetSessionOrder();
                this._queueRedisplay();
                this._syncDragEnabled(true);
            },
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::use-pinned-apps-as-launchers',
            () => {
                this._getPreviews().hideTooltip(false);
                this._getPreviews().hide();
                this._shownInitially = false;
                this._queueRedisplay();
                this._syncDragEnabled();
            },
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::show-pinned-app-separator',
            () => this._queueRedisplay(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::show-location-separator',
            () => this._queueRedisplay(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::default-gnome-panel',
            () => this._syncApplicationVisibility(),
            this._signalHolder
        );
        this._settings.connectObject('changed::isolate-workspaces', () => {
            this._refreshWorkspaceIsolation(true, true);
        }, this._signalHolder);
        this._settings.connectObject('changed::isolate-monitors', () => {
            this._refreshWorkspaceIsolation(true, true);
        }, this._signalHolder);
        this._settings.connectObject('changed::multi-monitor-panels', () => {
            this._refreshWorkspaceIsolation(true);
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::combine-app-buttons-mode',
            () => {
                this._getPreviews().hideTooltip(false);
                this._getPreviews().hide();
                this._syncCombineWhenFull();
                this._shownInitially = false;
                this._queueRedisplay();
                this._syncDragEnabled();
            },
            this._signalHolder
        );
        this._settings.connectObject('changed::hide-app-labels', () => {
            const {combinationChanged} = this._syncCombineWhenFull();
            if (combinationChanged) {
                this._shownInitially = false;
                this._getPreviews().hideTooltip(false);
                this._getPreviews().hide();
                this._queueRedisplay();
                this._syncDragEnabled();
            }
            for (const item of this._appButtons.values()) {
                this._syncItemLabel(item);
                this._updateGlassGeometry(item);
            }
            this.queueIconGeometryUpdate();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::nautilus-places-enabled',
            () => this._syncFileManagerPlaces(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::running-indicator-style',
            () => this.applyAppearance(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::show-notification-badges',
            () => this._syncNotificationBadges(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => this.applyAppearance(),
            this._signalHolder
        );
        for (const key of [
            'custom-indicator-colors-enabled',
            'match-icon-color',
            'focused-indicator-color',
            'unfocused-indicator-color',
        ]) {
            this._settings.connectObject(`changed::${key}`, () => {
                for (const item of this._appButtons.values())
                    this._syncIndicatorColor(item);
            }, this._signalHolder);
        }
        if (!this._ignoreTaskbarLock) {
            this._settings.connectObject('changed::taskbar-locked', () => {
                this._syncDragEnabled();
            }, this._signalHolder);
        }
        this.actor.connectObject('notify::allocation', () => {
            this.queueIconGeometryUpdate();
        }, this._signalHolder);
        this._connectActiveWorkspaceSignals();
        this._showDesktopController.enable();
        this._syncApplicationVisibility();
    }

    destroy() {
        this._iconGeometryController.destroy();
        this._iconGeometryController = null;
        if (this._startupSettleId)
            GLib.Source.remove(this._startupSettleId);
        this._startupSettleId = 0;

        this._signalHolder.destroy();
        this._signalHolder = null;
        this._disconnectActiveWorkspaceSignals();

        for (const [app, id] of this._appSignals)
            app.disconnect(id);
        this._appSignals.clear();
        this._locationController.destroy();
        this._locationController = null;

        this._showDesktopController.destroy();
        this._showDesktopController = null;
        this._dragController.destroy();
        this._dragController = null;
        this._destroyPinnedSeparator();

        for (const item of [...this._auxiliaryItems])
            this.removeAuxiliaryItem(item);
        this._auxiliaryItems.clear();

        for (const item of this._appButtons.values()) {
            this._getPreviews().removeItem(item);
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
        this._locationActor.destroy();
        this._locationActor = null;
        this.actor.destroy();
        this.actor = null;
        this._redisplayWorkId = 0;

        this._getPreviews = null;
        this._alignmentActor = null;
        this._ignoreTaskbarLock = false;
        this._settings = null;
        this._appSystem = null;
        this._tracker = null;
        this._favorites = null;
        this._notificationBadgeModel = null;
        this._getInterestingWindows = null;
        this._onAppClicked = null;
        this._onWindowClicked = null;
        this._openNewWindow = null;
        this._onShowDesktopClicked = null;
        this._onShowDesktopModeChanged = null;
        this._onRedisplay = null;
        this._auxiliaryItems = null;
        this._pinnedSeparator = null;
        this._pinnedSeparatorLine = null;
        this._previousPinnedAppIds = null;
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
            this._getPreviews().hideTooltip(false);
            this._getPreviews().hide();
            this._queueRedisplay();
            this._syncDragEnabled();
        }
    }

    setIconSize(iconSize) {
        if (St.Settings.get().enable_animations && !this.isDragging) {
            for (const item of this.getOrderedItems())
                item.preparePositionAnimation();
        }
        this._iconSize = iconSize;
        for (const item of this._appButtons.values()) {
            item._taskbarIcon.icon_size = iconSize;
            this._syncNotificationBadgeGeometry(item);
            this._updateGlassGeometry(item);
        }
        this._syncNotificationBadges();
        this._syncPinnedSeparatorGeometry();
        this.queueIconGeometryUpdate();
    }

    getIconSize() {
        return this._iconSize;
    }

    finishItemShowAnimations() {
        for (const item of this.getOrderedItems()) {
            if (item.animatingOut ||
                item.scale_x === 1 && item.scale_y === 1) {
                continue;
            }

            item.remove_transition('scale-x');
            item.remove_transition('scale-y');
            item.remove_transition('opacity');
            item.scale_x = 1;
            item.scale_y = 1;
            item.opacity = 255;
        }
    }

    isRebuilding() {
        return this._rebuilding;
    }

    getItemLength(item, iconSize = this._iconSize) {
        if (item._taskbarIsShowDesktop) {
            return panelIsVertical(this._settings)
                ? item.get_preferred_height(this._panelHeight)[1]
                : item.get_preferred_width(this._panelHeight)[1];
        }

        return this._appearanceController.itemSlotWidth(
            item._taskbarWindow,
            item._taskbarIsLauncher,
            item._taskbarPinnedToRunningGap,
            item._taskbarIsCombinedApp,
            item._taskbarTrailingSpacing,
            iconSize
        );
    }

    getLengthForIconSize(iconSize, items = this.getOrderedItems()) {
        const length = items.reduce(
            (total, item) => total + this.getItemLength(item, iconSize),
            0
        );
        return length + this.getPinnedSeparatorLength() +
            this.getLocationSeparatorLength();
    }

    getPinnedSeparatorLength() {
        return this._pinnedSeparator ? TASKBAR_SEPARATOR_EXTENT : 0;
    }

    getLocationSeparatorLength() {
        if (!this._settings.get_boolean('show-location-separator'))
            return 0;

        return this.getOrderedApplicationItems().length > 0 &&
            this.getLocationItems().length > 0
            ? TASKBAR_SEPARATOR_EXTENT
            : 0;
    }

    getPinnedSeparatorTarget(items) {
        if (!this._pinnedSeparator)
            return null;

        return items.find(item => item._taskbarApp &&
            !item._taskbarIsLauncher &&
            !item._taskbarIsPinnedPrimary) ?? null;
    }

    getIconSizeForLength(
        availableLength,
        maximumIconSize,
        minimumIconSize,
        scalingIconSize = null
    ) {
        const minimum = Math.min(minimumIconSize, maximumIconSize);
        const items = this.getOrderedItems();
        const scalableItemCount = items.reduce((count, item) =>
            count + (item._taskbarIsShowDesktop ? 0 : 1), 0
        );
        const maximumLength = this.getLengthForIconSize(
            maximumIconSize,
            items
        );
        const maximumItemLength = this._appearanceController.itemSlotWidth(
            null,
            false,
            false,
            false,
            false,
            maximumIconSize
        );
        for (let iconSize = maximumIconSize;
            iconSize >= minimum;
            iconSize--) {
            const available = scalingIconSize === null
                ? availableLength
                : availableLength + scalingIconSize - iconSize;
            const itemLength = this._appearanceController.itemSlotWidth(
                null,
                false,
                false,
                false,
                false,
                iconSize
            );
            const length = maximumLength + scalableItemCount *
                (itemLength - maximumItemLength);
            if (length <= available)
                return iconSize;
        }

        return minimum;
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
            item._taskbarButtonContent.set_height(
                this._buttonContentHeight()
            );
            this._updateGlassGeometry(item);
        }
        this._syncTaskbarEdgeSpacing();
        this.queueIconGeometryUpdate();
    }

    applyAppearance() {
        const vertical = panelIsVertical(this._settings);
        this.actor.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        this.actor.set_style('spacing: 0;');
        this.actor.x_align = vertical
            ? Clutter.ActorAlign.FILL
            : Clutter.ActorAlign.START;
        this.actor.x_expand = vertical;
        this.actor.y_align = vertical
            ? Clutter.ActorAlign.START
            : Clutter.ActorAlign.FILL;
        this.actor.y_expand = !vertical;
        this._locationActor.orientation = this.actor.orientation;
        this._locationActor.x_align = this.actor.x_align;
        this._locationActor.x_expand = this.actor.x_expand;
        this._locationActor.y_align = this.actor.y_align;
        this._locationActor.y_expand = this.actor.y_expand;
        this._locationActor.set_style('spacing: 0;');
        this._syncIndicatorStyle();
        this._syncPinnedSeparatorGeometry();
        for (const item of this._appButtons.values()) {
            this._syncIndicatorVisibility(item);
            this._syncItemLabel(item);
            this._updateGlassGeometry(item);
        }
        this._syncTaskbarEdgeSpacing();
        this.actor.queue_relayout();
        this._locationActor.queue_relayout();
    }

    _syncTaskbarEdgeSpacing() {
        const activeChildren = this.actor.get_children().filter(child =>
            child !== this._pinnedSeparator && !child.animatingOut
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
        if (this._locationActor.get_n_children() === 0) {
            for (const child of this.actor.get_children()) {
                if (child !== this._pinnedSeparator && !child.animatingOut)
                    trailingItem = child;
            }
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
        if (this.isDragging) {
            this._rebuilding = false;
            return;
        }

        if (this._settings.get_boolean('default-gnome-panel')) {
            this._clearAppButtons();
            this._rebuilding = false;
            return;
        }

        this._rebuilding = true;
        const {combinationChanged, labelWidthChanged} =
            this._syncCombineWhenFull();
        if (combinationChanged) {
            this._shownInitially = false;
            this._getPreviews().hideTooltip(false);
            this._getPreviews().hide();
            this._syncDragEnabled();
        }
        const entries = this._orderedEntries(this._startupSettling);
        const applicationEntries = entries.filter(entry =>
            !entry.app._simpleTaskbarLocation
        );
        const locationEntries = entries.filter(entry =>
            entry.app._simpleTaskbarLocation
        );
        const animateIndicators = this._shownInitially &&
            !this._startupSettling && !labelWidthChanged;
        const animateMembershipChanges = animateIndicators &&
            !this._suppressMembershipAnimation;
        this._suppressMembershipAnimation = false;
        const externalDropAppId =
            this._dragController.consumeExternalDropAppId();
        const pinnedAppIds = new Set(
            this._pinnedApps().map(app => app.get_id())
        );
        const newlyPinnedAppIds = new Set([...pinnedAppIds].filter(appId =>
            !this._previousPinnedAppIds.has(appId)
        ));
        const newlyUnpinnedAppIds = new Set(
            [...this._previousPinnedAppIds].filter(appId =>
                !pinnedAppIds.has(appId)
            )
        );
        const wantedKeys = new Set(entries.map(entry => entry.key));
        const wantedAppIds = new Set(
            entries.map(entry => entry.app.get_id())
        );

        for (const [key, item] of this._appButtons) {
            if (!wantedKeys.has(key)) {
                this._getPreviews().removeItem(item);
                this._dragController.releaseDraggable(item);
                this._destroyAppMenu(item._taskbarButton);
                this._appButtons.delete(key);
                const appId = item._taskbarApp.get_id();
                const wasPinnedPlaceholder = !item._taskbarWindow &&
                    (item._taskbarIsLauncher || item._taskbarIsPinnedPrimary);
                if (animateMembershipChanges &&
                    (!wasPinnedPlaceholder ||
                        newlyUnpinnedAppIds.has(appId))) {
                    animateTaskbarItemOutAndDestroy(item);
                } else {
                    item.destroy();
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
            const isLocation = app._simpleTaskbarLocation;
            const targetActor = isLocation ? this._locationActor : this.actor;
            const targetIndex = isLocation
                ? locationEntries.indexOf(entries[index])
                : applicationEntries.indexOf(entries[index]);
            let item = this._appButtons.get(key);
            const replaceForDragState = Boolean(item) &&
                this._dragIsEnabled(item) !==
                    this._dragIsEnabled(item, isPinnedPrimary);
            if (replaceForDragState) {
                this._getPreviews().removeItem(item);
                this._dragController.releaseDraggable(item);
                this._destroyAppMenu(item._taskbarButton);
                this._appButtons.delete(key);
                item.destroy();
                item = null;
            }
            if (item && item._taskbarApp !== app) {
                this._getPreviews().removeItem(item);
                this._dragController.releaseDraggable(item);
                this._untrackApp(item._taskbarApp);
                this._destroyAppMenu(item._taskbarButton);
                this._appButtons.delete(key);
                item.destroy();
                item = null;
            }
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
                    this._tracker.focus_app,
                    taskbarFocusWindow(),
                    false
                );
                placeTaskbarItemAtIndex(
                    targetActor,
                    item,
                    targetIndex,
                    isLocation ? null : this._showDesktopItem,
                    isLocation ? [] : [this._pinnedSeparator]
                );
                const pinnedPlaceholder = !window &&
                    (isLauncher || isPinnedPrimary);
                animateTaskbarItemIn(
                    item,
                    animateMembershipChanges &&
                        !replaceForDragState &&
                        (!pinnedPlaceholder ||
                            newlyPinnedAppIds.has(app.get_id())) &&
                        app.get_id() !== externalDropAppId
                );
            } else {
                placeTaskbarItemAtIndex(
                    targetActor,
                    item,
                    targetIndex,
                    isLocation ? null : this._showDesktopItem,
                    isLocation ? [] : [this._pinnedSeparator]
                );
            }
            if (app._simpleTaskbarLocation)
                this._appItemFactory.sync(item);
            item._taskbarIsPinnedPrimary = isPinnedPrimary;

            const applicationIndex = applicationEntries.indexOf(
                entries[index]
            );
            const nextApplicationEntry = applicationIndex >= 0
                ? applicationEntries[applicationIndex + 1]
                : null;
            const nextIsRunning = Boolean(nextApplicationEntry &&
                !nextApplicationEntry.isLauncher);
            const nextPinnedToRunningGap = isLauncher && nextIsRunning;
            if (item._taskbarPinnedToRunningGap !== nextPinnedToRunningGap) {
                item._taskbarPinnedToRunningGap = nextPinnedToRunningGap;
                this._updateGlassGeometry(item);
            }
        }

        for (const app of [...this._appSignals.keys()]) {
            if (!wantedAppIds.has(app.get_id()))
                this._untrackApp(app);
        }

        this._previousPinnedAppIds = pinnedAppIds;
        this._showDesktopController.place();
        this._syncPinnedSeparator(
            applicationEntries,
            animateMembershipChanges
        );
        this._syncTaskbarEdgeSpacing();
        this._shownInitially = true;
        this.syncButtonStates(animateIndicators);
        this._syncNotificationBadges();
        this.actor.queue_relayout();
        this.queueIconGeometryUpdate();
        this._rebuilding = false;
        this._onRedisplay();
    }

    _syncApplicationVisibility() {
        const visible = !this._settings.get_boolean('default-gnome-panel');
        this.actor.visible = visible;
        this._locationActor.visible = visible;
        if (!visible) {
            this._getPreviews().hideTooltip(false);
            this._getPreviews().hide();
            this._clearAppButtons();
            return;
        }

        this._queueRedisplay();
    }

    _clearAppButtons() {
        const items = [...this._appButtons.values()];
        this._appButtons.clear();
        this._destroyPinnedSeparator();
        for (const item of items) {
            this._getPreviews().removeItem(item);
            this._dragController.releaseDraggable(item);
            this._untrackApp(item._taskbarApp);
            this._destroyAppMenu(item._taskbarButton);
            item.remove_all_transitions();
            item.destroy();
        }
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
        const focusedApp = this._tracker.focus_app;
        const focusedWindow = taskbarFocusWindow();
        for (const item of this._appButtons.values())
            this._syncButtonState(item, focusedApp, focusedWindow, animate);
    }

    _syncButtonState(item, focusedApp, focusedWindow, animate) {
        const app = item._taskbarApp;
        const window = item._taskbarWindow;
        const button = item._taskbarButton;
        const isLauncher = item._taskbarIsLauncher;
        const isLocation = app._simpleTaskbarLocation;
        const windowCount = isLauncher || isLocation
            ? 0
            : this._windowsForItem(item).length;
        const running = !isLauncher && !isLocation && (window
            ? windowCount > 0
            : app.state === Shell.AppState.RUNNING && windowCount > 0);
        const hasFocus = !isLauncher && !isLocation && (window
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
        this._iconGeometryController.queueIconGeometryUpdate();
    }

    updateWindowIconGeometries() {
        this._iconGeometryController.updateWindowIconGeometries();
    }

    updateAppIconGeometry(app) {
        this._iconGeometryController.updateAppIconGeometry(app);
    }

    reorderTaskbarItem(sourceItem, targetItem, insertBefore) {
        return this._dragController.reorderItem(
            sourceItem,
            targetItem,
            insertBefore
        );
    }

    handleDragOver(source, _actor, x, _y, _time) {
        return this._dragController.handleDragOver(
            source,
            panelIsVertical(this._settings) ? _y : x
        );
    }

    acceptDrop(source, _actor, _x, _y, _time) {
        return this._dragController.acceptDrop(source);
    }

    acceptTaskbarItemDrop(item, source = null) {
        return this._dragController.acceptItemDrop(item, source);
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
        for (const id of this._activeWorkspaceSignalIds)
            this._activeWorkspace.disconnect(id);
        this._activeWorkspaceSignalIds = [];
        this._activeWorkspace = null;
    }

    _refreshWorkspaceIsolation(force = false, suppressAnimations = false) {
        if (!force &&
            !this._settings.get_boolean('isolate-workspaces') &&
            !this._settings.get_boolean('isolate-monitors')) {
            return;
        }

        this._getPreviews().hideTooltip(false);
        this._getPreviews().hide();
        if (suppressAnimations)
            this._shownInitially = false;
        for (const item of this.getItems()) {
            if (item._taskbarApp && item._taskbarApp._simpleTaskbarLocation)
                continue;
            item._taskbarButton._taskbarMenu?.syncWindowScope();
        }
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
        return windowsForTaskbarItem(
            item,
            app => this._interestingWindows(app)
        );
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
        const entries = [
            ...this._uncombinedEntries(apps, launcherCount),
            ...this._locationController.getEntries(),
        ];
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
            const groupedEntries = [
                ...this._uncombinedEntries(
                    apps,
                    launcherCount,
                    combinedAppIds
                ),
                ...this._locationController.getEntries(),
            ];
            if (this._entriesWidth(groupedEntries, showLabels) <=
                this._availableWidth) {
                break;
            }
        }

        return {combinedAppIds};
    }

    _entriesWidth(entries, showLabels) {
        const applicationEntries = entries.filter(entry =>
            !entry.app._simpleTaskbarLocation
        );
        const width = entries.reduce((total, entry, index) => {
            const entryShowLabels = showLabels &&
                (Boolean(entry.window) || entry.isCombined);
            const applicationIndex = applicationEntries.indexOf(entry);
            const nextApplicationEntry = applicationIndex >= 0
                ? applicationEntries[applicationIndex + 1]
                : null;
            const pinnedToRunningGap = !entry.app._simpleTaskbarLocation &&
                entry.isLauncher && Boolean(nextApplicationEntry) &&
                !nextApplicationEntry.isLauncher;
            const transitionGap =
                this._appearanceController.transitionGap(
                    pinnedToRunningGap
                );
            const iconSpacing = this._iconSpacing(entry.isLauncher);
            const trailingSpacing = index + 1 === entries.length &&
                iconSpacing < 0
                ? -iconSpacing
                : 0;
            return total + this._appearanceController.itemMainExtent(
                entry.window,
                entryShowLabels,
                APP_LABEL_WIDTH,
                entry.isCombined
            ) + iconSpacing + transitionGap + trailingSpacing;
        }, 0);
        return width + this._pinnedSeparatorLengthForEntries(
            applicationEntries
        ) + this._locationSeparatorLengthForEntries(entries);
    }

    _pinnedSeparatorLengthForEntries(entries) {
        if (!this._settings.get_boolean('show-pinned-app-separator'))
            return 0;

        let hasPinnedEntries = false;
        for (const entry of entries) {
            const pinned = entry.isLauncher || entry.isPinnedPrimary;
            if (pinned) {
                hasPinnedEntries = true;
                continue;
            }
            if (hasPinnedEntries)
                return TASKBAR_SEPARATOR_EXTENT;
        }
        return 0;
    }

    _locationSeparatorLengthForEntries(entries) {
        if (!this._settings.get_boolean('show-location-separator'))
            return 0;

        const hasApplications = entries.some(entry =>
            !entry.app._simpleTaskbarLocation
        );
        const hasLocations = entries.some(entry =>
            entry.app._simpleTaskbarLocation
        );
        return hasApplications && hasLocations
            ? TASKBAR_SEPARATOR_EXTENT
            : 0;
    }

    _syncPinnedSeparator(entries, animate) {
        if (this._pinnedSeparatorLengthForEntries(entries) === 0) {
            this._destroyPinnedSeparator(true);
            return;
        }

        let created = false;
        if (!this._pinnedSeparator) {
            const {separator, line} = createTaskbarSeparator();
            this._pinnedSeparator = separator;
            this._pinnedSeparatorLine = line;
            this._pinnedSeparator._taskbarIsPinnedSeparator = true;
            this.actor.add_child(this._pinnedSeparator);
            created = true;
        }

        this._syncPinnedSeparatorGeometry();
        if (!created) {
            this._pinnedSeparator.remove_all_transitions();
            this._pinnedSeparator.opacity = 255;
        }
        const separatorIndex = entries.findIndex(entry =>
            !entry.isLauncher && !entry.isPinnedPrimary
        );
        placeTaskbarItemAtIndex(
            this.actor,
            this._pinnedSeparator,
            separatorIndex,
            this._showDesktopItem
        );
        if (created && animate)
            animateSeparatorIn(
                this._pinnedSeparator,
                panelIsVertical(this._settings)
            );
    }

    _syncPinnedSeparatorGeometry() {
        if (!this._pinnedSeparator)
            return;

        const vertical = panelIsVertical(this._settings);
        syncSeparatorGeometry(
            this._pinnedSeparator,
            this._pinnedSeparatorLine,
            vertical,
            this._iconSize
        );
        this._pinnedSeparator[
            vertical ? 'height' : 'width'
        ] = TASKBAR_SEPARATOR_EXTENT;
    }

    _destroyPinnedSeparator(animate = false) {
        if (!this._pinnedSeparator)
            return;

        const separator = this._pinnedSeparator;
        this._pinnedSeparator = null;
        this._pinnedSeparatorLine = null;
        separator.animatingOut = true;
        if (animateSeparatorOut(
            separator,
            panelIsVertical(this._settings),
            () => separator.destroy(),
            animate && separator.get_stage()
        ))
            return;

        separator.destroy();
    }

    _sameAppIdSet(left, right) {
        if (left.size !== right.size)
            return false;

        return [...left].every(appId => right.has(appId));
    }

    _showAppLabels() {
        return !panelIsVertical(this._settings) &&
            this._combineMode() !== 'always' &&
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

    _dragIsEnabled(
        item = null,
        isPinnedPrimary = item ? item._taskbarIsPinnedPrimary : false
    ) {
        if (!this._ignoreTaskbarLock &&
            this._settings.get_boolean('taskbar-locked'))
            return false;

        if (item && item._taskbarIsShowDesktop)
            return this._settings.get_boolean('windows-xp-theme-enabled');

        if (!item)
            return true;

        if (item._taskbarApp._simpleTaskbarLocation)
            return false;

        if (item._taskbarIsLauncher)
            return true;

        return !isPinnedPrimary || this._combineMode() !== 'never';
    }

    _syncDragEnabled(force = false) {
        const configuration = [
            this._ignoreTaskbarLock
                ? false
                : this._settings.get_boolean('taskbar-locked'),
            this._combineMode(),
            this._usePinnedAppLaunchers(),
            this._settings.get_boolean('hide-pinned-taskbar-apps'),
        ].join(':');
        if (!force && configuration === this._dragEnabled)
            return;

        this._dragEnabled = configuration;
        const sessionOrder = this._entryModel.sessionOrder;
        const shownInitially = this._shownInitially;
        this._rebuilding = true;
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

        const signal = app._simpleTaskbarLocation
            ? 'changed'
            : 'windows-changed';
        const id = app.connect(signal, () => {
            this._getPreviews().windowsChanged(app);
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

    _syncNotificationBadges() {
        for (const item of this._appButtons.values())
            item._taskbarNotificationBadge.hide();

        if (!this._settings.get_boolean('show-notification-badges'))
            return;

        const itemsByAppId = new Map();
        for (const item of this.getOrderedApplicationItems()) {
            if (!item._taskbarApp)
                continue;

            const appId = item._taskbarApp.get_id();
            let items = itemsByAppId.get(appId);
            if (!items) {
                items = [];
                itemsByAppId.set(appId, items);
            }
            items.push(item);
        }

        for (const [appId, items] of itemsByAppId) {
            const count = this._notificationBadgeModel.getCount(appId);
            if (count <= 0)
                continue;

            const target = items.find(item => item._taskbarIsLauncher) ??
                items.find(item => item._taskbarIsPinnedPrimary) ??
                items.find(item => item._taskbarIsCombinedApp) ??
                items[0];
            if (this._iconSize <= 31 && count > 9) {
                target._taskbarNotificationBadgeLabel.text = '9';
            } else if (count > 99) {
                target._taskbarNotificationBadgeLabel.text =
                    this._iconSize <= 35 ? '99' : '99+';
            } else {
                target._taskbarNotificationBadgeLabel.text = count.toString();
            }
            this._syncNotificationBadgeGeometry(target);
            target._taskbarNotificationBadge.show();
        }
    }

    _syncNotificationBadgeGeometry(item) {
        const fontSize = Math.max(
            5,
            Math.min(
                this._iconSize < 56 ? 11 : 12,
                Math.floor(this._iconSize * 0.25)
            )
        );
        const horizontalPadding = Math.max(
            1,
            Math.min(4, Math.round(this._iconSize * 0.07))
        );
        const badgeTextLength =
            item._taskbarNotificationBadgeLabel.text.length;
        const singleDigit = badgeTextLength === 1;
        const singleDigitSize = fontSize + 2;
        const maximumOutwardOffset = Math.min(4, badgeTextLength + 1);
        const outwardOffset = Math.max(
            0,
            Math.min(
                maximumOutwardOffset,
                Math.round((48 - this._iconSize) / 4)
            )
        );
        item._taskbarIconContainer.set_size(
            this._iconSize,
            this._iconSize
        );
        item._taskbarNotificationBadge.set_style(
            `font-size: ${fontSize}px;` +
            `min-width: ${singleDigit ? singleDigitSize : 0}px;` +
            `min-height: ${singleDigit ? singleDigitSize : 0}px;` +
            `padding: 0 ${singleDigit ? 0 : horizontalPadding}px;`
        );
        item._taskbarNotificationBadgeBin.translation_x = outwardOffset;
        item._taskbarNotificationBadgeBin.translation_y = -outwardOffset;
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
