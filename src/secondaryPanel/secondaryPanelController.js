// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {cachedPanelApplicationSettings} from '../shared/defaultPanelWindowSettings.js';
import {panelApplicationsEnabled} from '../shared/defaultPanelWindows.js';

import {BLUR_MY_SHELL_PANEL_STYLES} from '../shared/blurMyShellUtils.js';
import {
    DOCK_BOX_NAME,
    panelBlurIsActive,
    preservePanelBlurRadiusStyle,
    syncBlurGeometry,
    syncPanelBlurCornerRadius,
} from '../integration/blurMyShellRuntime.js';
import {floatingBlurPanelStyle, panelBackgroundStyle} from '../panel/panelBackgroundStyle.js';
import {
    PANEL_BLUR_CLASSES,
    syncPanelBlurClasses,
} from '../panel/panelBlurClasses.js';
import {FolderMenuController} from '../folderMenuController.js';
import {NotificationAreaController} from '../integration/notificationAreaController.js';
import {PanelAutoHideController} from '../panel/panelAutoHideController.js';
import {
    PanelWindowDodgeController,
} from '../panel/panelWindowDodgeController.js';
import {
    PanelActivitiesController,
} from '../panel/panelActivitiesController.js';
import {
    PanelButtonPaddingController,
} from '../panel/panelButtonPaddingController.js';
import {PanelClockController} from '../panel/panelClockController.js';
import {DateMenuAlignmentController} from '../panel/dateMenuAlignmentController.js';
import {PanelInteractionController} from '../panel/panelInteractionController.js';
import {
    PanelVerticalItemsController,
} from '../panel/panelVerticalItemsController.js';
import {placePanelItems} from '../shared/panelItemOrder.js';
import {createPanelItems} from '../panel/panelItems.js';
import {panelGeometry} from '../panel/panelGeometry.js';
import {PanelMagnifyController} from '../panel/panelMagnifyController.js';
import {floatingPanelCornerRadius} from '../panel/floatingPanelGeometry.js';
import {TaskbarGeometryController} from '../panel/taskbarGeometryController.js';
import {
    START_BUTTON_LOCATION_KEY,
    dockFloatingEnabled,
    dynamicTaskbarEnabled,
    panelApplicationAlignment,
    taskbarGeometryEnabled,
} from '../shared/taskbarPanelModes.js';
import {
    dynamicTransparencyStyle,
} from '../panel/dynamicTransparency.js';
import {
    panelIsVertical,
    panelPosition,
} from '../panel/panelPosition.js';
import {
    QuickSettingsIndicatorsController,
    quickSettingsIconSpacing,
} from '../panel/quickSettingsIndicatorsController.js';
import {
    QuickSettingsPowerController,
} from '../integration/quickSettingsPowerController.js';
import {
    QuickSettingsXpIconController,
} from '../integration/quickSettingsXpIconController.js';
import {SecondaryPanelActor} from './secondaryPanelActor.js';
import {
    SecondaryPanelDockController,
} from './secondaryPanelDockController.js';
import {
    SecondaryPanelWindowDragController,
} from './secondaryPanelWindowDragController.js';
import {
    SECONDARY_PANEL_INDICATOR_ROLES,
    SecondaryPanelIndicatorController,
} from './secondaryPanelIndicatorController.js';
import {StartButtonController} from '../startMenu/startButtonController.js';
import {TaskbarController} from '../taskbar/taskbarController.js';
import {
    getTaskbarHoverAnimationNeighbours,
} from '../taskbar/taskbarHoverAnimationUtils.js';
import {
    adaptiveTaskbarIconSize,
    panelTaskbarIconSize,
    applyTaskbarIconSize,
    prepareTaskbarIconSizeChange,
} from '../taskbar/taskbarIconSize.js';
import {constrainTaskbarSize} from '../taskbar/taskbarLayout.js';
import {taskbarPanelHeight} from '../shared/panelSizing.js';
import {createTaskbarViewport} from '../taskbar/taskbarViewportFactory.js';
import {VolumeMixerController} from '../integration/volumeMixerController.js';
import {WindowController} from '../taskbar/windowController.js';
import {WindowPreviewController} from '../taskbar/windowPreviewController.js';

const EXTERNAL_PANEL_STYLES = new Set(BLUR_MY_SHELL_PANEL_STYLES);
const OWN_BLUR_CLASSES = new Set(PANEL_BLUR_CLASSES);
const PANEL_EDGE_CLASSES = new Set([
    'simple-taskbar-panel-top',
    'simple-taskbar-panel-bottom',
    'simple-taskbar-panel-left',
    'simple-taskbar-panel-right',
]);

export class SecondaryPanelController {
    constructor({
        extensionDir,
        settings,
        appSystem,
        tracker,
        favorites,
        notificationBadgeModel,
        spreadAppWindows,
        monitor,
        openPreferences,
        visiblePanelItemIds = null,
        mainPanelSettings = null,
    }) {
        this._applicationSettings = null;
        if (!settings.isDock) {
            this._applicationSettings = cachedPanelApplicationSettings(settings);
            settings = this._applicationSettings;
        }
        this._settings = settings;
        this._extensionDir = extensionDir;
        this._monitor = monitor;
        this._isSecondaryMonitor = monitor.index !== Main.layoutManager.primaryIndex;
        this._openPreferencesCallback = openPreferences;
        this._visiblePanelItemIds = visiblePanelItemIds;
        this._windowDodgeController = null;
        this._dockController = null;
        this._geometryController = null;
        this._windowDragController = null;
        this._blurActive = false;
        this._themeSyncLaterId = 0;
        this._signalHolder = new TransientSignalHolder();
        const isDock = settings.isDock;
        const configuredIconSize = isDock
            ? settings.getConfiguredIconSize()
            : settings.get_int('icon-size');
        this._maximumIconSize = configuredIconSize;
        this._iconSize = panelTaskbarIconSize(settings, configuredIconSize);
        this._panelHeight = taskbarPanelHeight(settings, this._iconSize);

        this._windowController = new WindowController(tracker, {
            settings,
            spreadAppWindows,
            getMonitor: () => this._monitor,
            getTaskbarController: () => this._taskbarController,
            getPreviewController: () => this._windowPreviews,
        });
        this._taskbarController = new TaskbarController({
            settings,
            appSystem,
            tracker,
            favorites,
            notificationBadgeModel,
            iconSize: this._iconSize,
            panelHeight: this._panelHeight,
            getInterestingWindows: app =>
                this._windowController.getInterestingWindows(app),
            ignoreTaskbarLock: isDock,
            onAppClicked: (item, app, action) =>
                this._windowController.handleAppClicked(item, app, action),
            onWindowClicked: window =>
                this._windowController.handleWindowClicked(window),
            openNewWindow: app => this._windowController.openNewWindow(app),
            getPreviewController: () => this._windowPreviews,
            onRedisplay: () => {
                this._updateTaskbarWidth();
                this._applicationOverflowController.sync();
            },
            locationScope: isDock ? 'dock' : 'taskbar',
            isSecondary: this._isSecondaryMonitor,
            getPositionActor: () => this._panelBox,
            getHoverAnimationMonitor: () => this._monitor,
            getPanelInteractionController: () => this._interactionController,
            getHoverAnimationNeighbours: () =>
                getTaskbarHoverAnimationNeighbours(
                    this._taskbarBin,
                    this._startButtonController.panelActor,
                    this._taskbarViewport,
                    [
                        this._leftBox,
                        this._centerBox,
                        this._rightBox,
                    ]
                ),
            onHoverAnimationReserveChanged: () =>
                this._magnifyController.onReserveChanged(),
            onHoverAnimationExtentsChanged: (before, after) =>
                this._magnifyController.onExtentsChanged(before, after),
            isHoverAnimationBlocked: () =>
                this._interactionIsBlocked(false) ||
                this._autoHideController.hidden,
        });
        this._windowPreviews = new WindowPreviewController(
            () => this._taskbarController.getItems(),
            app => this._windowController.getInterestingWindows(app),
            settings,
            () => this._applicationOverflowController.closeWithAnimation(),
            () => this._taskbarController.getHoverAnimationOutwardReserve(),
            () => this._taskbarController.isPointerInMagnifyBounds()
        );
        this._startButtonController = new StartButtonController({
            extensionDir,
            settings,
            iconSize: this._iconSize,
            previewController: this._windowPreviews,
            getPanelEdgeGap: () => {
                const geometryController = this._geometrySource();
                return geometryController ? geometryController.getPanelEdgeGap() : 0;
            },
            getMonitor: () => this._monitor,
            openPreferences,
            closeApp: (app, timestamp) =>
                this._taskbarController.closeApp(app, timestamp),
            getInterestingWindows: app =>
                this._windowController.getInterestingWindows(app),
            toggleDesktop: () => this._windowController.toggleDesktop(),
            manageKeybindings: false,
            onMenuOpenStateChanged: open => {
                this._taskbarController.setStartMenuOpen(open);
                this._autoHideController.setMenuOpen(open);
                if (open) {
                    this._taskbarController.dropHoverAnimations();
                    this._applicationOverflowController.close();
                }
            },
        });
        this._folderMenuController = new FolderMenuController(settings);

        const {viewport, overflowController} = createTaskbarViewport({
            settings,
            taskbarController: this._taskbarController,
            previewController: this._windowPreviews,
        });
        this._taskbarViewport = viewport;
        this._applicationOverflowController = overflowController;
        this._taskbarBin = overflowController.actor;

        this._panelBox = new St.Widget({
            name: isDock ? DOCK_BOX_NAME : 'panelBox',
            clip_to_allocation: true,
        });
        this._panelBox._simpleTaskbarPanelBox = isDock ? 'dock' : 'panel';
        this._panelBox._simpleTaskbarMonitorIndex = monitor.index;
        this.actor = new SecondaryPanelActor();
        this._panelBox.add_child(this.actor);
        this._magnifyController = new PanelMagnifyController({
            actor: this.actor,
            panelBox: this._panelBox,
            getMonitor: () => this._monitor,
            getVertical: () => panelIsVertical(this._settings),
            getReserve: () => this._taskbarController.getHoverAnimationReserve(),
            isEnabled: () => Boolean(this._dockController) || dynamicTaskbarEnabled(this._settings),
            isDynamic: () => this._dockController
                ? !this._settings.get_boolean('dock-panel-mode')
                : dynamicTaskbarEnabled(this._settings),
            getBaseLength: () => (this._dockController ?? this._geometryController).getBaseLength(),
            updateWidth: () => this._updateTaskbarWidth(),
            onGeometryChanged: (geometry, centerOffset) => {
                this.actor.set_position(geometry.x, geometry.y);
                this.actor.set_size(geometry.width, geometry.height);
                this.actor.centerOffset = centerOffset;
                if (dynamicTaskbarEnabled(this._settings)) {
                    this.actor.dynamicContent = {
                        start: this._magnifyController.contentStart,
                        length: this._magnifyController.contentLength,
                    };
                }
            },
        });
        if (!isDock) {
            this._windowDragController =
                new SecondaryPanelWindowDragController({
                    settings,
                    monitor,
                    panelActor: this.actor,
                });
        }
        this._leftBox = this.actor.leftBox;
        this._centerBox = this.actor.centerBox;
        this._rightBox = this.actor.rightBox;
        this._buttonPaddingController = isDock
            ? null
            : new PanelButtonPaddingController(
                settings,
                this.actor,
                [this._leftBox, this._centerBox, this._rightBox],
                () => this._quickSettingsIndicatorsController._indicators,
                () => this._panelHeight
            );
        this._taskbarController.setAlignmentActor(this._centerBox);
        this._interactionController = null;
        this._autoHideController = null;
        this._menuManager = null;
        this._indicatorController = null;
        this._volumeMixerController = null;
        this._quickSettingsPowerController = null;
        this._quickSettingsXpIconController = null;
        this._notificationAreaController = new NotificationAreaController();
        this._quickSettingsIndicatorsController = null;
        this._activitiesController = null;
        this._clockController = null;
        this._dateMenuAlignment = null;
        this._verticalItemsController = new PanelVerticalItemsController(
            settings,
            [this._leftBox, this._centerBox, this._rightBox],
            () => this._panelHeight,
            () => this._effectiveButtonPadding()
        );
        if (isDock) {
            this._dockController = new SecondaryPanelDockController({
                settings,
                monitor,
                mainPanelSettings,
                actor: this.actor,
                panelBox: this._panelBox,
                leftBox: this._leftBox,
                centerBox: this._centerBox,
                rightBox: this._rightBox,
                taskbarBin: this._taskbarBin,
                taskbarController: this._taskbarController,
                startButtonController: this._startButtonController,
                verticalItemsController: this._verticalItemsController,
                applicationOverflowController:
                    this._applicationOverflowController,
                getPanelHeight: () => this._panelHeight,
                getIconSize: () => this._iconSize,
                setIconSize: iconSize => this._iconSize = iconSize,
                setPanelHeight: panelHeight => this._panelHeight = panelHeight,
                onPosition: (updateTaskbarWidth, animateEdgeGap) =>
                    this._position(updateTaskbarWidth, animateEdgeGap),
                isCentered: () => this._appsAreCentered(),
                getHoverReserve: () => this._magnifyController.reserve,
            });
        }
    }

    enable() {
        this._menuManager = new PopupMenu.PopupMenuManager(this.actor);
        this._folderMenuController.enable(this._menuManager);
        this._indicatorController =
            new SecondaryPanelIndicatorController(
                this._settings,
                this._menuManager,
                this._dockController ? [] : SECONDARY_PANEL_INDICATOR_ROLES
            );
        this._indicatorController.acquire();
        const quickSettings = this._dockController
            ? Main.panel.statusArea.quickSettings
            : this._indicatorController.get('quickSettings');
        if (!this._dockController) {
            const activities = this._indicatorController.get('activities');
            const dateMenu = this._indicatorController.get('dateMenu');
            this._quickSettingsIndicatorsController =
                new QuickSettingsIndicatorsController(
                    quickSettings._indicators
                );
            this._syncQuickSettingsIndicators();
            this._activitiesController = new PanelActivitiesController(
                this._settings,
                activities,
                () => this._panelHeight
            );
            this._activitiesController.enable();
            this._clockController = new PanelClockController(
                this._settings,
                dateMenu,
                () => this._panelHeight
            );
            this._clockController.enable();
            this._dateMenuAlignment = new DateMenuAlignmentController(
                this._settings,
                dateMenu,
                this._panelHeight
            );
            this._volumeMixerController = new VolumeMixerController(
                this._settings,
                quickSettings
            );
            this._volumeMixerController.enable();
            this._quickSettingsPowerController =
                new QuickSettingsPowerController(
                    this._settings,
                    quickSettings
                );
            this._quickSettingsPowerController.enable();
            this._quickSettingsXpIconController =
                new QuickSettingsXpIconController(
                    this._settings,
                    this._extensionDir,
                    quickSettings
                );
            this._quickSettingsXpIconController.enable();
        }
        if (taskbarGeometryEnabled(this._settings)) {
            this._geometryController = new TaskbarGeometryController({
                settings: this._settings,
                getMonitor: () => this._monitor,
                panelBox: this._panelBox,
                panel: this.actor,
                boxes: [this._leftBox, this._centerBox, this._rightBox],
                getPanelHeight: () => this._panelHeight,
                onPosition: (updateWidth, animateGap) => this._position(updateWidth, animateGap),
                onContentChanged: () => this._queueTaskbarWidth(),
                getHoverReserve: () => this._magnifyController.reserve,
            });
        }
        Main.layoutManager.addChrome(this._panelBox, {
            affectsStruts: !this._dockController ||
                this._settings.get_boolean('dock-panel-mode') &&
                !dockFloatingEnabled(this._settings),
            trackFullscreen: true,
        });
        Main.uiGroup.set_child_below_sibling(
            this._panelBox,
            Main.layoutManager.panelBox
        );
        if (this._geometryController)
            this._geometryController.enable();
        if (this._dockController) {
            this._lowerBelowPanels();
            this._dockController.enable();
            this._panelBox.connectObject(
                'child-added', () => this._queueThemeSync(),
                'child-removed', () => this._queueThemeSync(),
                this._signalHolder
            );
        }
        this._position();
        this._applyLayout();
        this.syncTheme();
        if (this._buttonPaddingController)
            this._buttonPaddingController.enable();
        this._startButtonController.enable();
        this._applicationOverflowController.enable();
        this._taskbarController.enable();
        this._interactionController = new PanelInteractionController({
            settings: this._settings,
            taskbarController: this._taskbarController,
            taskbarBin: this._taskbarViewport,
            taskbarContainer: this._taskbarBin,
            previewController: this._windowPreviews,
            openPreferences: this._openPreferencesCallback,
            onAppScrolled: (item, direction) =>
                this._windowController.handleAppScrolled(item, direction),
            onPanelScrolled: direction =>
                this._windowController.handlePanelScrolled(direction),
            getVolumeIndicator: () => quickSettings._volumeOutput,
            panelActor: this.actor,
            panelBoxes: [this._leftBox, this._centerBox, this._rightBox],
            allowTaskbarLock: !this._dockController,
        });
        this._interactionController.enable();
        const geometryController = this._geometrySource();
        this._autoHideController = new PanelAutoHideController({
            settings: this._settings,
            panelActor: this.actor,
            positionActor: this._panelBox,
            onHidden: () => {
                this._taskbarController.dropHoverAnimations();
                this._windowPreviews.hideTooltip(false);
            },
            getOutwardReserve: () =>
                this._taskbarController.getHoverAnimationOutwardReserve(),
            onPositionFrame: () => syncBlurGeometry(this.actor),
            strutActor: geometryController ? geometryController.strutActor : null,
            getMonitor: () => this._monitor,
            getPanelHeight: () => this._panelHeight,
            getPanelLengthPercentage: geometryController
                ? () => geometryController.getPanelLengthPercentage() : undefined,
            getPanelLengthOverride: geometryController
                ? () => geometryController.getPanelLengthOverride() : undefined,
            getPanelEdgeGap: geometryController
                ? () => geometryController.getPanelEdgeGap() : undefined,
            getLimitRevealToPanel: geometryController
                ? () => geometryController.getLimitRevealToPanel() : undefined,
            isBlocked: () => this._autoHideIsBlocked(),
        });
        this._autoHideController.enable();
        this._windowDodgeController = new PanelWindowDodgeController({
            settings: this._settings,
            getMonitor: () => this._monitor,
            getGeometry: () => this._panelGeometry(),
            onDodgeStateChanged: (enabled, active, pointerReveal) =>
                this._autoHideController.setDodgeState(
                    enabled,
                    active,
                    pointerReveal
                ),
            onTransparencyStateChanged: () => this.syncTheme(),
            autohideKey: 'panel-autohide-enabled',
            dodgeEnabledKey: 'panel-dodge-windows-enabled',
            dodgeModeKey: 'panel-dodge-windows-mode',
            dodgePointerRevealKey: 'panel-dodge-pointer-reveal-enabled',
        });
        this._windowDodgeController.enable();
        if (this._windowDragController)
            this._windowDragController.enable();
        this._connectSignals();
    }

    destroy() {
        if (this._themeSyncLaterId) {
            global.compositor.get_laters().remove(this._themeSyncLaterId);
            this._themeSyncLaterId = 0;
        }
        this._taskbarController.disableHoverAnimations();
        if (this._windowDragController) {
            this._windowDragController.destroy();
            this._windowDragController = null;
        }
        this._signalHolder.destroy();
        this._signalHolder = null;

        this._windowDodgeController.destroy();
        this._windowDodgeController = null;
        this._autoHideController.destroy();
        this._autoHideController = null;
        if (this._geometryController) {
            this._geometryController.destroy();
            this._geometryController = null;
        }
        if (this._dockController) {
            this._dockController.destroy();
            this._dockController = null;
        }
        this._magnifyController.destroy();
        this._magnifyController = null;
        this._panelBox.remove_all_transitions();
        this.actor.remove_all_transitions();
        this._interactionController.destroy();
        this._interactionController = null;
        if (this._buttonPaddingController) {
            this._buttonPaddingController.destroy();
            this._buttonPaddingController = null;
        }
        this._verticalItemsController.destroy();
        this._verticalItemsController = null;
        if (this._activitiesController) {
            this._activitiesController.destroy();
            this._activitiesController = null;
        }
        if (this._dateMenuAlignment) {
            this._dateMenuAlignment.destroy();
            this._dateMenuAlignment = null;
        }
        if (this._clockController) {
            this._clockController.destroy();
            this._clockController = null;
        }
        this._startButtonController.destroy();
        this._startButtonController = null;
        this._applicationOverflowController.destroy();
        this._applicationOverflowController = null;
        this._taskbarController.destroy();
        this._windowController.destroy();
        this._windowPreviews.destroy();
        this._windowPreviews = null;
        this._taskbarController = null;
        this._windowController = null;
        this._taskbarViewport.destroy();
        this._taskbarViewport = null;
        if (this._volumeMixerController) {
            this._volumeMixerController.destroy();
            this._volumeMixerController = null;
        }
        if (this._quickSettingsXpIconController) {
            this._quickSettingsXpIconController.destroy();
            this._quickSettingsXpIconController = null;
        }
        if (this._quickSettingsPowerController) {
            this._quickSettingsPowerController.destroy();
            this._quickSettingsPowerController = null;
        }
        this._notificationAreaController.destroy();
        if (this._quickSettingsIndicatorsController) {
            this._quickSettingsIndicatorsController.destroy();
            this._quickSettingsIndicatorsController = null;
        }
        this._indicatorController.destroy();
        this._indicatorController = null;
        this._folderMenuController.destroy();
        this._folderMenuController = null;
        this._menuManager = null;

        Main.layoutManager.removeChrome(this._panelBox);
        this._panelBox.destroy();
        this._panelBox = null;
        this.actor = null;
        this._leftBox = null;
        this._centerBox = null;
        this._rightBox = null;
        this._notificationAreaController = null;
        this._taskbarBin = null;
        this._monitor = null;
        this._extensionDir = null;
        this._openPreferencesCallback = null;
        this._visiblePanelItemIds = null;
        if (this._applicationSettings) {
            this._applicationSettings.destroy();
            this._applicationSettings = null;
        }
        this._settings = null;
    }

    _lowerBelowPanels() {
        for (const child of Main.uiGroup.get_children()) {
            if (child._simpleTaskbarPanelBox === 'panel')
                Main.uiGroup.set_child_below_sibling(this._panelBox, child);
        }
    }

    containsPoint(x, y) {
        return x >= this._monitor.x &&
            x < this._monitor.x + this._monitor.width &&
            y >= this._monitor.y &&
            y < this._monitor.y + this._monitor.height;
    }

    toggleStartMenu() {
        this._startButtonController.toggleStartMenu();
    }

    closeStartMenus() {
        this._startButtonController.closeMenus();
    }

    closePanelMenu() {
        this._menuManager.activeMenu?.close();
        this._applicationOverflowController.close();
    }

    _connectSignals() {
        Main.panel.connectObject('notify::style-class', () => {
            this.syncTheme();
        }, this._signalHolder);
        Main.panel.connectObject('notify::style', () => {
            this.syncTheme();
        }, this._signalHolder);
        if (!this._dockController) {
            this.actor.connectObject('notify::style-class', () => {
                if (panelBlurIsActive(this.actor) !== this._blurActive)
                    this.syncTheme();
            }, this._signalHolder);
        }
        for (const box of [
            this._leftBox,
            this._centerBox,
            this._rightBox,
        ]) {
            box.connectObject(
                'notify::width', () => this._queueTaskbarWidth(),
                'notify::height', () => this._queueTaskbarWidth(),
                this._signalHolder
            );
        }
        if (!this._dockController) {
            this._settings.connectObject('changed::icon-size', () => {
                this._resetTaskbarIconSize();
                this._verticalItemsController.sync();
                this._updateTaskbarWidth();
            }, this._signalHolder);
            this._settings.connectObject(
                'changed::dock-min-icon-size',
                () => this._updateTaskbarWidth(),
                'changed::panel-height-follow-icon-size',
                () => this._syncPanelHeight(),
                this._signalHolder
            );
            for (const key of [
                'transparency-on-unmaximized',
                'transparency-dynamic-behavior',
                'transparency-dynamic-distance',
                'transparency-dynamic-level',
                'transparency-dynamic-animation-time',
            ]) {
                this._settings.connectObject(
                    `changed::${key}`,
                    () => this.syncTheme(),
                    this._signalHolder
                );
            }
        }
        this._settings.connectObject('changed::panel-height', () => {
            this._applyPanelHeight();
            if (this._settings.get_boolean('default-gnome-panel'))
                this._resetTaskbarIconSize();
            this._position();
        }, this._signalHolder);
        const syncIconMetrics = () => {
            if (this._settings.get_boolean('default-gnome-panel'))
                this._resetTaskbarIconSize();
            this._applyAppearance();
            this._syncPanelHeight();
            this._updateTaskbarWidth();
        };
        this._settings.connectObject(
            'changed::icon-spacing', syncIconMetrics,
            'changed::icon-edge-padding', syncIconMetrics,
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::default-gnome-panel', () => this._syncTaskbarVisibility(),
            'changed::default-panel-show-running-windows', () => this._syncTaskbarVisibility(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => {
                this._applyLayout();
                this.syncTheme();
            },
            'changed::windows-10-theme-enabled',
            () => this.syncTheme(),
            this._signalHolder
        );
        this._settings.connectObject('changed::app-alignment', () => {
            this._applyAppearance();
            this._applyLayout();
        }, this._signalHolder);
        for (const key of [
            'start-button-position',
            'start-button-follow-app-alignment',
            'default-panel-start-button-position',
            'default-panel-start-button-follow-app-alignment',
        ]) {
            this._settings.connectObject(`changed::${key}`, () => {
                this._applyLayout();
            }, this._signalHolder);
        }
        for (const key of [
            'windows-start-menu-enabled',
            'gnome-start-button-visible',
            START_BUTTON_LOCATION_KEY,
            'system-menu-visible',
            'clock-visible',
            'hide-pinned-taskbar-apps',
            'hide-pinned-secondary-monitors',
            'hide-unpinned-taskbar-apps',
        ]) {
            this._settings.connectObject(`changed::${key}`, () => {
                this._applyLayout();
            }, this._signalHolder);
        }
        this._settings.connectObject('changed::activities-button-visible', () => {
            this._indicatorController.syncActivitiesVisibility();
            this._updateTaskbarWidth();
        }, this._signalHolder);
        this._settings.connectObject('changed::activities-button-position', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::clock-position', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::system-menu-position', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::folder-menu-enabled', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::folder-menu-position', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::panel-item-order', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::start-button-padding', () => {
            this._startButtonController.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._verticalItemsController.sync();
            this._updateTaskbarWidth();
        }, this._signalHolder);
        for (const signal of ['child-added', 'child-removed']) {
            this._taskbarController.actor.connectObject(signal, () => {
                this._updateTaskbarWidth();
            }, this._signalHolder);
        }
        this._settings.connectObject('changed::hide-app-labels', () => {
            this._updateTaskbarWidth();
        }, this._signalHolder);
        if (!this._dockController) {
            this._settings.connectObject(
                'changed::panel-button-padding',
                () => {
                    this._syncQuickSettingsIndicators();
                    this._updateTaskbarWidth();
                },
                this._signalHolder
            );
        }
        this._settings.connectObject(
            'changed::quick-settings-icon-spacing',
            () => this._syncQuickSettingsIndicators(),
            'changed::windows-xp-theme-enabled',
            () => this._syncQuickSettingsIndicators(),
            this._signalHolder
        );
    }

    _applyAppearance() {
        this._startButtonController.applyAppearance(
            this._iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._taskbarController.applyAppearance();
        this._verticalItemsController.sync();
    }

    _syncTaskbarVisibility() {
        const visible = panelApplicationsEnabled(this._settings);
        this._taskbarBin.visible = visible;
        if (visible && !this._dockController &&
            !this._settings.get_boolean('windows-xp-theme-enabled')) {
            this._resetTaskbarIconSize();
        }
        if (!visible) {
            this._windowPreviews.hideTooltip(false);
            this._windowPreviews.hide();
        }
        this._applyLayout();
    }

    _applyLayout() {
        this.actor.adaptiveCenter =
            dynamicTaskbarEnabled(this._settings) ||
            this._taskbarBin.visible && this._appsAreCentered();
        this.actor.expandedSide =
            this._taskbarBin.visible && !this._appsAreCentered();
        const startButton = this._startButtonController.panelActor;
        const activities =
            this._indicatorController.containerFor('activities');
        const quickSettings =
            this._indicatorController.containerFor('quickSettings');
        const dateMenu = this._indicatorController.containerFor('dateMenu');
        const folderMenuButton = this._folderMenuController.actor;

        const windowsXpThemeEnabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const trayEnabled = windowsXpThemeEnabled && Boolean(dateMenu);
        this._notificationAreaController.sync(
            trayEnabled ? [quickSettings, dateMenu] : [],
            dateMenu,
            trayEnabled
        );
        this._indicatorController.syncPopupOffsets();

        const boxes = {
            left: this._leftBox,
            center: this._centerBox,
            right: this._rightBox,
        };
        const allItems = createPanelItems({
            settings: this._settings,
            windowsXpThemeEnabled,
            actors: {
                startButton,
                activities,
                taskbar: this._taskbarBin,
                folderMenu: folderMenuButton,
                quickSettings,
                dateMenu,
                notificationArea: this._notificationAreaController.actor,
            },
            includeTrayOverflow: false,
            includeShowDesktop: false,
            isSecondary: this._isSecondaryMonitor,
        });
        const items = this._visiblePanelItemIds
            ? allItems.filter(item => this._visiblePanelItemIds.has(item.id))
            : allItems;
        placePanelItems(
            boxes,
            items,
            this._settings.get_strv('panel-item-order')
        );
        if (this._buttonPaddingController)
            this._buttonPaddingController.syncEdgePadding();
        this._notificationAreaController.syncRightBoxActors(
            this._rightBox,
            new Set(items.map(item => item.actor)),
            new Set([folderMenuButton]),
            windowsXpThemeEnabled
        );
        this._indicatorController.syncActivitiesVisibility();
        this._applyAppearance();
        this._updateTaskbarWidth();
    }

    _geometrySource() {
        return this._dockController ?? this._geometryController;
    }

    _appsAreCentered() {
        return panelApplicationAlignment(this._settings) === 'center';
    }

    _position(
        updateTaskbarWidth = true,
        animateEdgeGapRequested = false
    ) {
        const geometryController = this._geometrySource();
        const positionState = geometryController
            ? geometryController.getPositionState(
                animateEdgeGapRequested
            )
            : null;
        const geometry = positionState
            ? positionState.geometry
            : this._panelGeometry();
        const property = geometry.vertical ? 'x' : 'y';
        const lengthProperty = geometry.vertical ? 'height' : 'width';
        const translationProperty = geometry.vertical
            ? 'translation_y'
            : 'translation_x';
        this._panelBox.remove_transition(lengthProperty);
        this._panelBox.remove_transition(translationProperty);
        this._panelBox[translationProperty] = 0;
        this.actor.remove_transition(lengthProperty);
        this._panelBox.set_size(geometry.width, geometry.height);
        this.actor.set_size(geometry.width, geometry.height);
        if (!animateEdgeGapRequested ||
            !positionState ||
            positionState.edgeGapChanged && !positionState.animateEdgeGap) {
            if (this._autoHideController &&
                this._panelBox.get_transition(property)) {
                if (geometry.vertical)
                    this._panelBox.y = geometry.y;
                else
                    this._panelBox.x = geometry.x;
            } else {
                this._panelBox.set_position(geometry.x, geometry.y);
            }
        } else if (this._geometryController) {
            this._panelBox[geometry.vertical ? 'y' : 'x'] =
                geometry.vertical ? geometry.y : geometry.x;
        }
        if (positionState && positionState.edgeGapChanged)
            this.syncTheme();
        if (this._dockController) {
            this._dockController.syncStrut();
        }
        if (this._geometryController)
            this._geometryController.syncStrut();
        this.actor.vertical = geometry.vertical;
        this._magnifyController.sync();
        const orientation = geometry.vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        for (const box of [this._leftBox, this._centerBox, this._rightBox])
            box.orientation = orientation;
        this._syncQuickSettingsIndicators();
        this._verticalItemsController.sync();
        const animateEdgeGap = positionState &&
            positionState.animateEdgeGap;
        if (this._autoHideController) {
            if (animateEdgeGap)
                this._autoHideController.syncPosition(true);
            else if (!positionState || positionState.shouldSyncAutoHide)
                this._autoHideController.syncPosition();
        }
        if (this._windowDodgeController)
            this._windowDodgeController.sync();
        if (updateTaskbarWidth)
            this._updateTaskbarWidth();
    }

    _panelGeometry() {
        if (this._dockController)
            return this._dockController.getGeometry();

        if (this._geometryController)
            return this._geometryController.getGeometry();

        const geometry = panelGeometry(
            this._settings,
            this._monitor,
            this._panelHeight
        );
        return geometry;
    }

    _syncQuickSettingsIndicators() {
        if (!this._quickSettingsIndicatorsController)
            return;

        this._quickSettingsIndicatorsController.sync(
            panelIsVertical(this._settings),
            this._effectiveButtonPadding(),
            quickSettingsIconSpacing(this._settings)
        );
    }

    _effectiveButtonPadding() {
        if (!this._buttonPaddingController)
            return null;

        return this._buttonPaddingController.effectivePadding();
    }

    _autoHideIsBlocked() {
        return this._interactionIsBlocked(true);
    }

    _interactionIsBlocked(includeWindowPreviews) {
        return Boolean(
            this._interactionController.menuIsOpen ||
            this._startButtonController.menuIsOpen ||
            this._folderMenuController.menuIsOpen ||
            this._applicationOverflowController.menuIsOpen ||
            (includeWindowPreviews && this._windowPreviews.isOpen) ||
            this._taskbarController.isDragging ||
            this._taskbarController.hasOpenMenu() ||
            this._menuManager.activeMenu?.isOpen
        );
    }

    _updateTaskbarWidth() {
        if (this._dockController) {
            this._dockController.updateTaskbarWidth();
            return;
        }

        const vertical = panelIsVertical(this._settings);
        const availableWidth = constrainTaskbarSize({
            taskbarBin: this._taskbarBin,
            leftBox: this._leftBox,
            centerBox: this._centerBox,
            rightBox: this._rightBox,
            panelLength: this._geometryController
                ? this._geometryController.getMaximumLength()
                : vertical ? this._monitor.height : this._monitor.width,
            panelThickness: this._panelHeight,
            centered: this._appsAreCentered(),
            vertical,
        });
        if (availableWidth !== undefined) {
            this._taskbarController.setAvailableWidth(availableWidth);
            const iconSizeChanged = this._syncTaskbarIconSize(availableWidth);
            if (iconSizeChanged && this._geometryController) {
                this._geometryController.queueContentUpdate();
                return;
            }
        }
        if (this._geometryController)
            this._geometryController.updateLength();
    }

    _syncTaskbarIconSize(availableLength) {
        if (this._taskbarController.isRebuilding() ||
            this._settings.get_boolean('default-gnome-panel') ||
            this._settings.get_boolean('windows-xp-theme-enabled')) {
            return false;
        }

        const iconSize = adaptiveTaskbarIconSize({
            settings: this._settings,
            taskbarController: this._taskbarController,
            startButtonController: this._startButtonController,
            availableLength,
            maximumIconSize: this._maximumIconSize,
            iconSize: this._iconSize,
        });
        if (iconSize === this._iconSize)
            return false;

        if (dynamicTaskbarEnabled(this._settings))
            prepareTaskbarIconSizeChange(this._taskbarController, this._startButtonController);
        this._iconSize = iconSize;
        this._applyTaskbarIconSize();
        this._verticalItemsController.sync();
        this._applicationOverflowController.syncIconSizeChange();
        this._syncPanelHeight(!dynamicTaskbarEnabled(this._settings));
        return true;
    }

    _resetTaskbarIconSize() {
        this._maximumIconSize = this._settings.get_int('icon-size');
        this._iconSize = panelTaskbarIconSize(this._settings, this._maximumIconSize);
        this._applyTaskbarIconSize();
        this._applicationOverflowController.sync();
        this._syncPanelHeight();
    }

    _applyPanelHeight() {
        this._panelHeight = taskbarPanelHeight(this._settings, this._iconSize);
        this._taskbarController.setPanelHeight(this._panelHeight);
        if (this._buttonPaddingController)
            this._buttonPaddingController.syncPanelHeight();
        if (this._activitiesController)
            this._activitiesController.sync();
        if (this._clockController)
            this._clockController.sync();
        if (this._dateMenuAlignment)
            this._dateMenuAlignment.sync(this._panelHeight);
    }

    _syncPanelHeight(updateTaskbarWidth = true) {
        if (taskbarPanelHeight(this._settings, this._iconSize) === this._panelHeight)
            return;

        this._applyPanelHeight();
        this._position(updateTaskbarWidth);
    }

    _applyTaskbarIconSize() {
        this.actor.preserveStart = panelApplicationsEnabled(this._settings) &&
            this._iconSize < this._maximumIconSize;
        applyTaskbarIconSize({
            settings: this._settings,
            taskbarController: this._taskbarController,
            startButtonController: this._startButtonController,
            iconSize: this._iconSize,
        });
    }

    _queueTaskbarWidth() {
        if (this._dockController) {
            this._dockController.queueTaskbarWidth();
            return;
        }

        this._updateTaskbarWidth();
    }

    _queueThemeSync() {
        if (this._themeSyncLaterId)
            return;

        this._themeSyncLaterId = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW,
            () => {
                this._themeSyncLaterId = 0;
                this.syncTheme();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    syncTheme() {
        if (this._dockController) {
            this._dockController.syncTheme();
            return;
        }

        const blurActive = panelBlurIsActive(this.actor);
        this._blurActive = blurActive;
        const vertical = panelIsVertical(this._settings);
        const light = Main.panel.has_style_class_name(
            'simple-taskbar-theme-light'
        );
        const borderEnabled = !Main.panel.has_style_class_name(
            'simple-taskbar-border-disabled'
        );
        const edgeClass = `simple-taskbar-panel-${
            panelPosition(this._settings)
        }`;
        const classes = Main.panel.get_style_class_name()
            .split(/\s+/)
            .filter(style => style &&
                !PANEL_EDGE_CLASSES.has(style) &&
                style !== 'simple-taskbar-panel-vertical' &&
                !EXTERNAL_PANEL_STYLES.has(style) &&
                !OWN_BLUR_CLASSES.has(style));
        const externalStyles = this.actor.get_style_class_name()
            .split(/\s+/)
            .filter(style => EXTERNAL_PANEL_STYLES.has(style));
        classes.push(...externalStyles);
        classes.push('simple-taskbar-panel', 'simple-taskbar-secondary-panel');
        if (vertical)
            classes.push('simple-taskbar-panel-vertical');
        classes.push(edgeClass);
        this.actor.set_style_class_name([...new Set(classes)].join(' '));
        if (this._settings.get_boolean('windows-xp-theme-enabled')) {
            this.actor.set_style(Main.panel.get_style());
            return;
        }

        const floating = Boolean(this._geometryController);
        const radius = floating ? floatingPanelCornerRadius(this._settings, this._monitor) : 0;
        const cornerStyle = floating ? `border-radius: ${radius}px;` : '';
        syncPanelBlurClasses(this.actor, blurActive, light);
        if (floating)
            syncPanelBlurCornerRadius(this.actor, radius);
        if (blurActive) {
            this.actor.set_style(floating
                ? floatingBlurPanelStyle(this._settings, light, borderEnabled, radius)
                : preservePanelBlurRadiusStyle(this.actor, ''));
            return;
        }
        const {dynamicOpacity, transitionDuration} = dynamicTransparencyStyle(
            this._settings,
            this._settings.get_boolean('transparency-on-unmaximized'),
            this._monitor,
            () => this._panelGeometry()
        );
        this.actor.set_style(panelBackgroundStyle(
            this._settings,
            light,
            borderEnabled,
            cornerStyle,
            floating,
            dynamicOpacity,
            transitionDuration
        ));
    }

}
