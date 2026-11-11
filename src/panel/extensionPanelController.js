// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {cachedPanelApplicationSettings} from '../shared/defaultPanelWindowSettings.js';
import {panelApplicationsEnabled} from '../shared/panelApplicationVisibility.js';

import {
    DOCK_BOX_NAME,
    panelBlurIsActive,
} from '../integration/blurMyShellRuntime.js';
import {panelSurfaceStyle} from './panelBackgroundStyle.js';
import {
    BLUR_MY_SHELL_PANEL_CLASSES,
    actorStyleClasses,
    syncSecondaryPanelClasses,
} from './secondaryPanelClasses.js';
import {FolderMenuController} from './folderMenuController.js';
import {NotificationAreaController} from '../integration/notificationAreaController.js';
import {PanelAutoHideController} from './panelAutoHideController.js';
import {
    PanelWindowDodgeController,
} from './panelWindowDodgeController.js';
import {
    PanelActivitiesController,
} from './panelActivitiesController.js';
import {
    PanelButtonPaddingController,
} from './panelButtonPaddingController.js';
import {PanelClockController} from './panelClockController.js';
import {DateMenuAlignmentController} from './dateMenuAlignmentController.js';
import {
    connectPanelAppearanceSignals,
    connectPanelSettingsSignals,
    connectPanelSizingSignals,
} from './panelSettingsSignals.js';
import {
    PanelVerticalItemsController,
} from './panelVerticalItemsController.js';
import {placePanelItems} from '../shared/panelItemOrder.js';
import {createPanelItems} from './panelItems.js';
import {floatingPanelCornerRadius, panelGeometry} from './panelGeometry.js';
import {PanelMagnifyController} from './panelMagnifyController.js';
import {PanelGeometryController, syncPanelGeometryController} from './panelGeometryController.js';
import {
    dockFloatingEnabled,
    dynamicTaskbarEnabled,
    panelApplicationAlignment,
    taskbarGeometryEnabled,
} from '../shared/panelModeSettings.js';
import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {
    QuickSettingsIndicatorsController,
    quickSettingsIconSpacing,
} from './quickSettingsIndicatorsController.js';
import {QuickSettingsIntegrations} from '../integration/quickSettingsIntegrations.js';
import {ExtensionPanelActor} from './extensionPanelActor.js';
import {
    DockController,
} from '../dock/dockController.js';
import {
    SecondaryPanelWindowDragController,
} from '../secondaryPanel/secondaryPanelWindowDragController.js';
import {
    SECONDARY_PANEL_INDICATOR_ROLES,
    SecondaryPanelIndicatorController,
} from '../secondaryPanel/secondaryPanelIndicatorController.js';
import {panelIconSizeIsAdaptive, panelTaskbarIconSize} from './panelIconSizer.js';
import {PanelTaskbarCore} from './panelTaskbarCore.js';
import {fitPanelTaskbar} from './panelLayout.js';
import {taskbarPanelHeight} from '../shared/panelSizing.js';
import {PanelLayoutUpdater} from './panelLayoutUpdater.js';

export class ExtensionPanelController {
    constructor({
        extensionDir,
        settings,
        appSystem,
        tracker,
        favorites,
        overlayModel,
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
        this._visiblePanelItemIds = visiblePanelItemIds;
        this._windowDodgeController = null;
        this._dockController = null;
        this._geometryController = null;
        this._windowDragController = null;
        this._blurActive = false;
        this._themeSyncLaterId = 0;
        this._panelLayoutUpdater = new PanelLayoutUpdater(() => this._updateTaskbarWidth());
        const isDock = settings.isDock;
        const configuredIconSize = isDock
            ? settings.getConfiguredIconSize()
            : settings.get_int('icon-size');
        const iconSize = panelTaskbarIconSize(settings, configuredIconSize);
        this._panelHeight = taskbarPanelHeight(settings, iconSize);

        this._panelBox = new St.Widget({
            name: isDock ? DOCK_BOX_NAME : 'panelBox',
            clip_to_allocation: true,
        });
        this._panelBox._simpleTaskbarPanelBox = isDock ? 'dock' : 'panel';
        this._panelBox._simpleTaskbarMonitorIndex = monitor.index;
        this.actor = new ExtensionPanelActor();
        this._panelBox.add_child(this.actor);
        this._leftBox = this.actor.leftBox;
        this._centerBox = this.actor.centerBox;
        this._rightBox = this.actor.rightBox;
        this._core = new PanelTaskbarCore({
            extensionDir,
            settings,
            appSystem,
            tracker,
            favorites,
            overlayModel,
            spreadAppWindows,
            openPreferences,
            getMonitor: () => this._monitor,
            getPositionActor: () => this._panelBox,
            boxes: [this._leftBox, this._centerBox, this._rightBox],
            getPanelEdgeGap: () => this._geometrySource()?.getPanelEdgeGap() ?? 0,
            panelHeight: this._panelHeight,
            iconSize,
            maximumIconSize: configuredIconSize,
            getConfiguredIconSize: isDock
                ? () => settings.getConfiguredIconSize()
                : () => settings.get_int('icon-size'),
            isAdaptive: () => panelIconSizeIsAdaptive(settings, this._core.taskbarController),
            prepareEveryChange: isDock,
            beforeIconSizeApply: nextIconSize => this._beforeIconSizeApply(nextIconSize),
            afterIconSizeApply: () => this._afterIconSizeApply(),
            syncVerticalItems: () => this._verticalItemsController.sync(),
            syncPanelHeight: solving => this._syncPanelHeight(!solving || !dynamicTaskbarEnabled(this._settings)),
            isPanelMenuOpen: () => this._folderMenuController.menuIsOpen || this._menuManager.activeMenu?.isOpen,
            isAutoHideHidden: () => this._autoHideController.hidden,
            onHoverAnimationReserveChanged: () => this._magnifyController.onReserveChanged(),
            onHoverAnimationExtentsChanged: (before, after) => this._magnifyController.onExtentsChanged(before, after),
            onRedisplay: () => this._panelLayoutUpdater.update(),
            onStartMenuOpenChanged: open => this._autoHideController.setMenuOpen(open),
            taskbarOptions: {
                ignoreTaskbarLock: isDock,
                locationScope: isDock ? 'dock' : 'taskbar',
                isSecondary: this._isSecondaryMonitor,
            },
            startButtonOptions: {manageKeybindings: false},
        });
        this._folderMenuController = new FolderMenuController(settings);
        this._magnifyController = new PanelMagnifyController({
            actor: this.actor,
            panelBox: this._panelBox,
            getMonitor: () => this._monitor,
            getVertical: () => panelIsVertical(this._settings),
            getReserve: () => this._core.taskbarController.getHoverAnimationReserve(),
            isEnabled: () => Boolean(this._dockController) || dynamicTaskbarEnabled(this._settings),
            isDynamic: () => this._dockController
                ? !this._settings.get_boolean('dock-panel-mode')
                : dynamicTaskbarEnabled(this._settings),
            getBaseLength: () => {
                const geometrySource = this._geometrySource();
                return geometrySource ? geometrySource.getBaseLength() : null;
            },
            updateWidth: () => this._panelLayoutUpdater.update(),
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
        this._buttonPaddingController = isDock
            ? null
            : new PanelButtonPaddingController(
                settings,
                this.actor,
                [this._leftBox, this._centerBox, this._rightBox],
                () => this._quickSettingsIndicatorsController._indicators,
                () => this._panelHeight,
                () => this._geometryController ? this._geometryController.getPanelEdgeGap() : 0,
                this._core.startButtonController,
                () => this._core.iconSizer.iconSize
            );
        this._autoHideController = null;
        this._menuManager = null;
        this._indicatorController = null;
        this._quickSettingsIntegrations = null;
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
            this._dockController = new DockController({
                settings,
                monitor,
                mainPanelSettings,
                actor: this.actor,
                panelBox: this._panelBox,
                leftBox: this._leftBox,
                centerBox: this._centerBox,
                rightBox: this._rightBox,
                taskbarBin: this._core.taskbarBin,
                taskbarController: this._core.taskbarController,
                startButtonController: this._core.startButtonController,
                getPanelHeight: () => this._panelHeight,
                iconSizer: this._core.iconSizer,
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
            this._quickSettingsIntegrations = new QuickSettingsIntegrations(
                this._settings,
                this._extensionDir,
                quickSettings
            );
            this._quickSettingsIntegrations.enable();
        }
        if (taskbarGeometryEnabled(this._settings))
            this._geometryController = this._createGeometryController();
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
                this
            );
        }
        this._position();
        this._applyLayout();
        this.syncTheme();
        if (this._buttonPaddingController)
            this._buttonPaddingController.enable();
        this._core.startButtonController.enable();
        this._core.overflowController.enable();
        this._core.taskbarController.enable();
        this._core.createInteractionController({
            getVolumeIndicator: () => quickSettings._volumeOutput,
            panelActor: this.actor,
            panelBoxes: [this._leftBox, this._centerBox, this._rightBox],
            allowTaskbarLock: !this._dockController,
        }).enable();
        const geometryController = this._geometrySource();
        this._autoHideController = new PanelAutoHideController({
            settings: this._settings,
            panelActor: this.actor,
            positionActor: this._panelBox,
            onHidden: () => this._core.onPanelHidden(),
            getOutwardReserve: () =>
                this._core.taskbarController.getHoverAnimationOutwardReserve(),
            strutActor: geometryController ? geometryController.strutActor : null,
            getMonitor: () => this._monitor,
            getPanelHeight: () => this._panelHeight,
            getGeometrySource: () => this._geometrySource(),
            isBlocked: () => this._core.isInteractionBlocked(true),
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
        });
        this._windowDodgeController.enable();
        if (this._windowDragController)
            this._windowDragController.enable();
        this._connectSignals();
    }

    destroy() {
        this._core.taskbarController.disableHoverAnimations();
        if (this._themeSyncLaterId) {
            global.compositor.get_laters().remove(this._themeSyncLaterId);
            this._themeSyncLaterId = 0;
        }
        this._panelLayoutUpdater.destroy();
        this._panelLayoutUpdater = null;
        this._settings.disconnectObject(this);
        Main.panel.disconnectObject(this);
        this._panelBox.disconnectObject(this);
        this.actor.disconnectObject(this);
        this._leftBox.disconnectObject(this);
        this._centerBox.disconnectObject(this);
        this._rightBox.disconnectObject(this);
        this._core.taskbarController.actor.disconnectObject(this);
        if (this._windowDragController) {
            this._windowDragController.destroy();
            this._windowDragController = null;
        }

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
        this._core.destroyInteractionController();
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
        this._core.destroy();
        this._core = null;
        if (this._quickSettingsIntegrations) {
            this._quickSettingsIntegrations.destroy();
            this._quickSettingsIntegrations = null;
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
        this._monitor = null;
        this._extensionDir = null;
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
        this._core.startButtonController.toggleStartMenu();
    }

    closeStartMenus() {
        this._core.startButtonController.closeMenus();
    }

    closePanelMenu() {
        this._menuManager.activeMenu?.close();
        this._core.overflowController.close();
    }

    _connectSignals() {
        if (!this._dockController) {
            this._settings.connectObject(
                'changed::taskbar-floating', () => this._syncFloatingMode(),
                'changed::taskbar-dynamic-floating', () => this._syncFloatingMode(),
                this
            );
        }
        Main.panel.connectObject('notify::style-class', () => {
            this.syncTheme();
        }, this);
        Main.panel.connectObject('notify::style', () => {
            this.syncTheme();
        }, this);
        if (!this._dockController) {
            this.actor.connectObject('notify::style-class', () => {
                if (panelBlurIsActive(this.actor) !== this._blurActive)
                    this.syncTheme();
            }, this);
        }
        if (!this._dockController) {
            connectPanelAppearanceSignals({
                settings: this._settings,
                owner: this,
                cornerRadiusKey: 'taskbar-corner-radius',
                onBackgroundChanged: () => this._queueThemeSync(),
            });
        }
        connectPanelSizingSignals({
            settings: this._settings,
            owner: this,
            core: this._core,
            isDock: Boolean(this._dockController),
            applyAppearance: () => this._applyAppearance(),
            applyPanelHeight: () => this._applyPanelHeight(),
            syncPanelHeight: () => this._syncPanelHeight(),
            updateWidth: () => this._panelLayoutUpdater.update(),
            afterPanelHeight: () => this._position(),
        });
        this._settings.connectObject(
            'changed::default-gnome-panel', () => this._syncTaskbarVisibility(),
            'changed::default-panel-show-running-windows', () => this._syncTaskbarVisibility(),
            this
        );
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => {
                this._applyLayout();
                this.syncTheme();
            },
            'changed::windows-10-theme-enabled',
            () => this.syncTheme(),
            this
        );
        connectPanelSettingsSignals({
            settings: this._settings,
            owner: this,
            core: this._core,
            boxes: [this._leftBox, this._centerBox, this._rightBox],
            extraLayoutKeys: ['hide-pinned-secondary-monitors'],
            applyLayout: () => this._applyLayout(),
            updateWidth: () => this._panelLayoutUpdater.update(),
            queueWidth: () => this._queueTaskbarWidth(),
            syncQuickSettings: () => this._syncQuickSettingsIndicators(),
            onButtonPaddingChanged: this._dockController ? null : () => this._syncQuickSettingsIndicators(),
            onAppAlignmentChanged: () => this._applyAppearance(),
            syncActivitiesVisibility: () => this._indicatorController.syncActivitiesVisibility(),
            syncVerticalItems: () => this._verticalItemsController.sync(),
        });
    }

    _applyAppearance() {
        this._core.applyAppearance();
        this._verticalItemsController.sync();
    }

    _syncTaskbarVisibility() {
        const visible = panelApplicationsEnabled(this._settings);
        this._core.taskbarBin.visible = visible;
        if (visible && !this._dockController &&
            !this._settings.get_boolean('windows-xp-theme-enabled')) {
            this._core.iconSizer.reset();
        }
        if (!visible) {
            this._core.windowPreviews.hideTooltip(false);
            this._core.windowPreviews.hide();
        }
        this._applyLayout();
    }

    _applyLayout() {
        this.actor.adaptiveCenter =
            dynamicTaskbarEnabled(this._settings) ||
            this._core.taskbarBin.visible && this._appsAreCentered();
        this.actor.expandedSide =
            this._core.taskbarBin.visible && !this._appsAreCentered();
        const startButton = this._core.startButtonController.panelActor;
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
                taskbar: this._core.taskbarBin,
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
        else
            this._dockController.syncSidePadding();
        this._notificationAreaController.syncRightBoxActors(
            this._rightBox,
            new Set(items.map(item => item.actor)),
            new Set([folderMenuButton]),
            windowsXpThemeEnabled
        );
        this._indicatorController.syncActivitiesVisibility();
        this._applyAppearance();
        this._panelLayoutUpdater.update();
    }

    _geometrySource() {
        return this._dockController ?? this._geometryController;
    }

    _createGeometryController() {
        return new PanelGeometryController({
            settings: this._settings,
            getMonitor: () => this._monitor,
            panelBox: this._panelBox,
            panel: this.actor,
            boxes: [this._leftBox, this._centerBox, this._rightBox],
            getPanelHeight: () => this._panelHeight,
            onPosition: (updateWidth, animateGap) => this._position(updateWidth, animateGap),
            onContentChanged: () => this._panelLayoutUpdater.update(),
            getHoverReserve: () => this._magnifyController.reserve,
        });
    }

    _syncFloatingMode() {
        this._geometryController = syncPanelGeometryController(
            this._geometryController, this._settings, this._autoHideController, this.actor,
            () => this._createGeometryController()
        );
        this.syncTheme();
        this._buttonPaddingController.syncEdgePadding();
        this._position();
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
        if (positionState && positionState.edgeGapChanged) {
            if (this._buttonPaddingController)
                this._buttonPaddingController.syncEdgePadding();
            this.syncTheme();
        }
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
            this._panelLayoutUpdater.update();
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

    _updateTaskbarWidth() {
        if (this._dockController) {
            this._dockController.updateTaskbarWidth();
            return;
        }

        fitPanelTaskbar(this._settings, this._core, {
            boxes: [this._leftBox, this._centerBox, this._rightBox],
            monitor: this._monitor,
            geometryController: this._geometryController,
            layoutUpdater: this._panelLayoutUpdater,
            panelThickness: this._panelHeight,
            centered: this._appsAreCentered(),
        });
    }

    _applyPanelHeight() {
        this._panelHeight = taskbarPanelHeight(this._settings, this._core.iconSizer.iconSize);
        this._core.taskbarController.setPanelHeight(this._panelHeight);
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
        if (taskbarPanelHeight(this._settings, this._core.iconSizer.iconSize) === this._panelHeight)
            return;

        this._applyPanelHeight();
        this._position(updateTaskbarWidth);
    }

    _beforeIconSizeApply(iconSize) {
        if (this._settings.isDock) {
            this._settings.setRuntimeIconSize(iconSize);
            this._panelHeight = this._settings.get_int('panel-height');
            return;
        }

        this.actor.preserveStart = panelApplicationsEnabled(this._settings) &&
            this._core.iconSizer.isShrunk;
    }

    _afterIconSizeApply() {
        if (this._settings.isDock)
            this._core.taskbarController.setPanelHeight(this._panelHeight);
    }

    _queueTaskbarWidth() {
        if (this._dockController) {
            this._dockController.queueTaskbarWidth();
            return;
        }

        this._panelLayoutUpdater.queue();
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
        const light = Main.panel.has_style_class_name(
            'simple-taskbar-theme-light'
        );
        const borderEnabled = !Main.panel.has_style_class_name(
            'simple-taskbar-border-disabled'
        );
        syncSecondaryPanelClasses(this.actor, this._settings, {
            keptClasses: actorStyleClasses(this.actor, BLUR_MY_SHELL_PANEL_CLASSES),
        });
        if (this._settings.get_boolean('windows-xp-theme-enabled')) {
            this.actor.set_style(Main.panel.get_style());
            return;
        }

        const floating = Boolean(this._geometryController);
        this.actor.set_style(panelSurfaceStyle(this.actor, this._settings, {
            monitor: this._monitor,
            getGeometry: () => this._panelGeometry(),
            dynamic: this._settings.get_boolean('transparency-on-unmaximized'),
            light,
            borderEnabled,
            blurActive,
            floating,
            radius: floating ? floatingPanelCornerRadius(this._settings, this._monitor) : 0,
        }));
    }

}
