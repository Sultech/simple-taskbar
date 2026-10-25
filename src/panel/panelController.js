// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {extensionIsActive} from '../extensionState.js';
import {syncBlurGeometry} from '../integration/blurMyShellRuntime.js';
import {PanelAutoHideController} from './panelAutoHideController.js';
import {
    PanelWindowDodgeController,
} from './panelWindowDodgeController.js';
import {
    ActivitiesDotWidthOverride,
} from './activitiesDotWidthOverride.js';
import {PanelActivitiesController} from './panelActivitiesController.js';
import {
    PanelButtonPaddingController,
} from './panelButtonPaddingController.js';
import {PanelClockController} from './panelClockController.js';
import {placePanelItems} from '../shared/panelItemOrder.js';
import {createPanelItems} from './panelItems.js';
import {PanelMenuPositioner} from './panelMenuPositioner.js';
import {panelGeometry} from './panelGeometry.js';
import {PanelMagnifyController} from './panelMagnifyController.js';
import {DynamicPanelBoxLayout} from './dynamicPanelBoxLayout.js';
import {TaskbarGeometryController} from './taskbarGeometryController.js';
import {
    START_BUTTON_LOCATION_KEY,
    dynamicTaskbarEnabled,
    taskbarGeometryEnabled,
    panelApplicationAlignment,
} from '../shared/taskbarPanelModes.js';
import {panelIsVertical} from './panelPosition.js';
import {
    QuickSettingsIndicatorsController,
    quickSettingsIconSpacing,
} from './quickSettingsIndicatorsController.js';
import {PanelStateController} from './panelStateController.js';
import {PanelThemeController} from './panelThemeController.js';
import {
    PanelVerticalItemsController,
} from './panelVerticalItemsController.js';
import {
    VerticalPanelCompatibilityController,
} from './verticalPanelCompatibilityController.js';
import {NotificationAreaController} from '../integration/notificationAreaController.js';
import {TRAY_OVERFLOW_ROLE} from '../overflow/trayOverflowController.js';
import {
    allocateAdaptivePanel,
    allocateDynamicPanel,
    allocateExpandedSidePanel,
    constrainTaskbarSize,
} from '../taskbar/taskbarLayout.js';
import {TaskbarWidthUpdater} from '../taskbar/taskbarWidthUpdater.js';
import {minimumTaskbarPanelHeight} from '../shared/panelSizing.js';
const JUST_PERFECTION_UUID = 'just-perfection-desktop@just-perfection';
const DASH_TO_PANEL_UUID = 'dash-to-panel@jderose9.github.com';
const GNOME_PANEL_SIZE = 32;

export class PanelController {
    constructor({
        settings,
        panelHeight,
        onPanelHidden,
        getHoverAnimationOutwardReserve,
        getHoverAnimationReserve,
        startButton,
        taskbarBin,
        taskbarActor,
        showDesktopButton,
        setShowDesktopPanelCorner,
        folderMenuButton,
        onAppAlignmentChanged,
        onTaskbarAvailableWidthChanged,
        isTaskbarAdaptive,
        queueOverviewRelayout,
        isAutoHideBlocked,
    }) {
        this._settings = settings;
        this._panelHeight = panelHeight;
        this._startButton = startButton;
        this._taskbarBin = taskbarBin;
        this._taskbarActor = taskbarActor;
        this._showDesktopButton = showDesktopButton;
        this._setShowDesktopPanelCorner = setShowDesktopPanelCorner;
        this._folderMenuButton = folderMenuButton;
        this._onAppAlignmentChanged = onAppAlignmentChanged;
        this._onTaskbarAvailableWidthChanged =
            onTaskbarAvailableWidthChanged;
        this._isTaskbarAdaptive = isTaskbarAdaptive;
        this._queueOverviewRelayout = queueOverviewRelayout;
        this._isAutoHideBlocked = isAutoHideBlocked;
        this._signalHolder = new TransientSignalHolder();
        this._layoutRepairId = 0;
        this._taskbarWidthUpdater = new TaskbarWidthUpdater(
            () => this._updateTaskbarWidthInternal()
        );
        this._applyingLayout = false;
        this._stateController = null;
        this._themeController = null;
        this._injectionManager = new InjectionManager();
        this._menuPositioner = new PanelMenuPositioner(
            this._injectionManager,
            settings
        );
        this._notificationAreaController = new NotificationAreaController();
        this._quickSettingsIndicatorsController = null;
        this._activitiesDotWidthOverride = null;
        this._activitiesController = null;
        this._clockController = null;
        this._verticalPanelCompatibilityController =
            new VerticalPanelCompatibilityController(settings);
        this._verticalItemsController = new PanelVerticalItemsController(
            settings,
            [
                Main.panel._leftBox,
                Main.panel._centerBox,
                Main.panel._rightBox,
            ],
            () => this._panelHeight,
            () => this._buttonPaddingController.effectivePadding()
        );
        this._geometryController = taskbarGeometryEnabled(settings)
            ? new TaskbarGeometryController({
                settings,
                getMonitor: () => Main.layoutManager.primaryMonitor,
                panelBox: Main.layoutManager.panelBox,
                panel: Main.panel,
                boxes: [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox],
                getPanelHeight: () => this._panelHeight,
                onPosition: (updateWidth, animateGap) => this.position(updateWidth, animateGap),
                onContentChanged: () => this.updateTaskbarWidth(),
                getHoverReserve: () => this._magnifyController.reserve,
            })
            : null;
        this._oldPanelBoxLayout = null;
        this._panelBoxLayout = null;
        this._magnifyController = new PanelMagnifyController({
            actor: Main.panel,
            panelBox: Main.layoutManager.panelBox,
            getMonitor: () => Main.layoutManager.primaryMonitor,
            getVertical: () => panelIsVertical(this._settings),
            getReserve: getHoverAnimationReserve,
            isEnabled: () => dynamicTaskbarEnabled(this._settings),
            isDynamic: () => dynamicTaskbarEnabled(this._settings),
            getBaseLength: () => this._geometryController.getBaseLength(),
            updateWidth: () => this.updateTaskbarWidth(),
            onGeometryChanged: geometry => this._panelBoxLayout.setPanelGeometry(geometry),
        });
        this._autoHideController = new PanelAutoHideController({
            settings,
            panelActor: Main.panel,
            positionActor: Main.layoutManager.panelBox,
            getMonitor: () => Main.layoutManager.primaryMonitor,
            getPanelHeight: () => this._panelHeight,
            getPanelLengthPercentage: () => this._geometryController
                ? this._geometryController.getPanelLengthPercentage() : null,
            getPanelLengthOverride: () => this._geometryController
                ? this._geometryController.getPanelLengthOverride() : null,
            getPanelEdgeGap: () => this._geometryController
                ? this._geometryController.getPanelEdgeGap() : 0,
            getLimitRevealToPanel: () => this._geometryController
                ? this._geometryController.getLimitRevealToPanel() : true,
            isBlocked: () => this._isAutoHideBlocked(),
            getOutwardReserve: getHoverAnimationOutwardReserve,
            onPositionFrame: () => syncBlurGeometry(Main.panel),
            onHidden: onPanelHidden,
        });
        this._windowDodgeController = new PanelWindowDodgeController({
            settings,
            getMonitor: () => Main.layoutManager.primaryMonitor,
            getGeometry: monitor => this._panelGeometry(monitor),
            onDodgeStateChanged: (enabled, active, pointerReveal) =>
                this._autoHideController.setDodgeState(
                    enabled,
                    active,
                    pointerReveal
                ),
            onTransparencyStateChanged: () =>
                this._themeController.applyTransparency(),
            autohideKey: 'panel-autohide-enabled',
            dodgeEnabledKey: 'panel-dodge-windows-enabled',
            dodgeModeKey: 'panel-dodge-windows-mode',
            dodgePointerRevealKey: 'panel-dodge-pointer-reveal-enabled',
        });
        this._buttonPaddingController = new PanelButtonPaddingController(
            settings,
            Main.panel,
            [
                Main.panel._leftBox,
                Main.panel._centerBox,
                Main.panel._rightBox,
            ],
            () => Main.panel.statusArea.quickSettings._indicators,
            () => this._panelHeight
        );
    }

    enable() {
        Main.layoutManager.panelBox.clip_to_allocation = true;
        this._verticalPanelCompatibilityController.enable();
        this._stateController = new PanelStateController({
            settings: this._settings,
            panelHeight: this._panelHeight,
            startButton: this._startButton,
            taskbarBin: this._taskbarBin,
            folderMenuButton: this._folderMenuButton,
            showDesktopButton: this._showDesktopButton,
        });
        this._stateController.enable();
        if (dynamicTaskbarEnabled(this._settings)) {
            this._oldPanelBoxLayout = Main.layoutManager.panelBox.layout_manager;
            this._panelBoxLayout = new DynamicPanelBoxLayout(Main.panel, {
                x: 0,
                y: 0,
                width: Main.layoutManager.panelBox.width,
                height: Main.layoutManager.panelBox.height,
            });
            Main.layoutManager.panelBox.layout_manager = this._panelBoxLayout;
        }
        if (this._geometryController) {
            this._geometryController.enable();
            this._autoHideController.setStrutActor(this._geometryController.strutActor);
        }
        this._activitiesDotWidthOverride = new ActivitiesDotWidthOverride(
            Main.panel.statusArea.activities
        );
        this._activitiesController = new PanelActivitiesController(
            this._settings,
            Main.panel.statusArea.activities,
            () => this._panelHeight
        );
        this._activitiesController.enable();
        this._clockController = new PanelClockController(
            this._settings,
            Main.panel.statusArea.dateMenu,
            () => this._panelHeight,
            () => minimumTaskbarPanelHeight(this._settings)
        );
        this._clockController.enable();
        this._themeController = new PanelThemeController(
            this._settings,
            this._stateController.oldPanelStyle,
            monitor => this._panelGeometry(monitor)
        );
        this._configureAdaptivePanelAllocation();
        this._configureHotCornerSizing();
        this._themeController.syncEdgeClass();
        this._themeController.syncBorder();
        this._buttonPaddingController.enable();
        this._themeController.applyTheme();
        this.applyLayout();
        this._stateController.removeDateMenuIndicatorPadding();
        this._menuPositioner.enable();
        this._configurePanelMenuSwitching();
        this._connectSignals();
        this._themeController.connectSignals(() => this.applyLayout());
        this._themeController.queueBlurMyShellSync();
        this._autoHideController.enable();
        this._windowDodgeController.enable();
    }

    destroy() {
        const restoringUnlockPanel = Main.sessionMode.isLocked;
        if (this._layoutRepairId) {
            global.compositor.get_laters().remove(this._layoutRepairId);
            this._layoutRepairId = 0;
        }
        this._taskbarWidthUpdater.destroy();
        this._taskbarWidthUpdater = null;
        this._signalHolder.destroy();
        this._signalHolder = null;

        this._windowDodgeController.destroy();
        this._windowDodgeController = null;
        this._autoHideController.destroy();
        this._autoHideController = null;
        this._magnifyController.destroy();
        this._magnifyController = null;
        if (this._panelBoxLayout) {
            Main.layoutManager.panelBox.layout_manager = this._oldPanelBoxLayout;
            this._panelBoxLayout = null;
            this._oldPanelBoxLayout = null;
        }
        if (this._geometryController) {
            this._geometryController.destroy();
            this._geometryController = null;
        }
        this._buttonPaddingController.destroy();
        this._buttonPaddingController = null;
        this._verticalItemsController.destroy();
        this._verticalItemsController = null;
        this._activitiesController.destroy();
        this._activitiesController = null;
        this._activitiesDotWidthOverride.destroy();
        this._activitiesDotWidthOverride = null;
        this._clockController.destroy();
        this._clockController = null;
        this._notificationAreaController.destroy();
        this._restoreNativeLayouts();

        this._menuPositioner.destroy();
        this._menuPositioner = null;
        this._injectionManager.clear();
        this._injectionManager = null;

        this._themeController.destroy();
        this._themeController = null;
        this._stateController.destroy(restoringUnlockPanel);
        this._stateController = null;
        this._verticalPanelCompatibilityController.destroy();
        this._verticalPanelCompatibilityController = null;
        this._restoreHotCornerSizing();

        this._startButton = null;
        this._taskbarBin = null;
        this._taskbarActor = null;
        this._showDesktopButton = null;
        this._folderMenuButton = null;
        this._onAppAlignmentChanged = null;
        this._onTaskbarAvailableWidthChanged = null;
        this._isTaskbarAdaptive = null;
        this._queueOverviewRelayout = null;
        this._isAutoHideBlocked = null;
        this._settings = null;
        this._notificationAreaController = null;
        this._applyingLayout = false;
    }

    setPanelHeight(panelHeight) {
        this._panelHeight = panelHeight;
        this._buttonPaddingController.syncPanelHeight();
        this._activitiesController.sync();
        this.position();
        this._clockController.sync();
    }

    setStartMenuOpen(open) {
        this._autoHideController.setMenuOpen(open);
    }

    get autoHideHidden() {
        return this._autoHideController.hidden;
    }

    setShowDesktopButton(button) {
        this._showDesktopButton = button;
        this._stateController.setShowDesktopButton(button);
    }

    _panelGeometry(monitor) {
        return this._geometryController
            ? this._geometryController.getGeometry()
            : panelGeometry(this._settings, monitor, this._panelHeight);
    }

    onHoverAnimationReserveChanged() {
        this._magnifyController.onReserveChanged();
    }

    onHoverAnimationExtentsChanged(before, after) {
        this._magnifyController.onExtentsChanged(before, after);
    }

    getPanelEdgeGap() {
        return this._geometryController
            ? this._geometryController.getPanelEdgeGap() : 0;
    }

    position(updateWidth = true, animateGapRequested = false) {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const state = this._geometryController
            ? this._geometryController.getPositionState(animateGapRequested) : null;
        const geometry = state ? state.geometry : this._panelGeometry(monitor);
        if (geometry.vertical || this._geometryController)
            Main.panel.set_size(geometry.width, geometry.height);
        else {
            Main.panel.set_width(-1);
            Main.panel.set_height(geometry.height);
        }
        Main.layoutManager.panelBox.set_size(
            geometry.width,
            geometry.height
        );
        const panelBox = Main.layoutManager.panelBox;
        const placeEdge = !animateGapRequested || !state ||
            state.edgeGapChanged && !state.animateEdgeGap;
        if (placeEdge && !panelBox.get_transition(geometry.vertical ? 'x' : 'y'))
            panelBox.set_position(geometry.x, geometry.y);
        else if (geometry.vertical)
            panelBox.y = geometry.y;
        else
            panelBox.x = geometry.x;
        if (state && state.edgeGapChanged)
            this._themeController.applyTransparency();
        if (this._geometryController)
            this._geometryController.syncStrut();
        Main.layoutManager._updateHotCorners();
        this._syncPanelOrientation();
        this._magnifyController.sync();
        this._verticalItemsController.sync();
        this._stateController.syncDateMenuVerticalAlignment(
            this._panelHeight
        );
        if (state && state.animateEdgeGap)
            this._autoHideController.syncPosition(true);
        else if (!state || state.shouldSyncAutoHide)
            this._autoHideController.syncPosition();
        this._windowDodgeController.sync();
        this._queueOverviewRelayout();
        this._syncShowDesktopPanelCorner();
        if (updateWidth)
            this.updateTaskbarWidth();
    }

    applyLayout() {
        if (this._applyingLayout)
            return;

        this._applyingLayout = true;
        try {
            if (this._isJustPerfectionActive()) {
                this._withPanelChildAddedSignalsBlocked(() => {
                    this._applyLayout();
                });
            } else {
                this._applyLayout();
            }
        } finally {
            this._applyingLayout = false;
        }
        this._buttonPaddingController.sync();
    }

    _applyLayout() {
        const leftBox = Main.panel._leftBox;
        const centerBox = Main.panel._centerBox;
        const rightBox = Main.panel._rightBox;
        const activities = Main.panel.statusArea.activities.container;
        const quickSettings =
            Main.panel.statusArea.quickSettings.container;
        const trayOverflow =
            Main.panel.statusArea[TRAY_OVERFLOW_ROLE]?.container;
        const dateMenu = Main.panel.statusArea.dateMenu.container;
        const windowsXpThemeEnabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        if (windowsXpThemeEnabled) {
            for (const box of [leftBox, centerBox, rightBox]) {
                if (this._showDesktopButton.get_parent() === box)
                    box.remove_child(this._showDesktopButton);
            }
        }
        const trayInNotificationArea = windowsXpThemeEnabled &&
            this._settings.get_string('tray-overflow-position') === 'right';
        const notificationAreaActors = windowsXpThemeEnabled
            ? [
                trayInNotificationArea ? trayOverflow : null,
                quickSettings,
                dateMenu,
            ]
            : [];
        this._notificationAreaController.sync(
            notificationAreaActors,
            dateMenu,
            windowsXpThemeEnabled
        );
        const showDesktopPosition = this._settings.get_string(
            'show-desktop-button-position'
        );
        this._showDesktopButton.remove_style_class_name(
            'simple-taskbar-show-desktop-left'
        );
        if (showDesktopPosition === 'left') {
            this._showDesktopButton.add_style_class_name(
                'simple-taskbar-show-desktop-left'
            );
        }
        const boxes = {
            left: leftBox,
            center: centerBox,
            right: rightBox,
        };
        const items = createPanelItems({
            settings: this._settings,
            windowsXpThemeEnabled,
            actors: {
                startButton: this._startButton,
                activities,
                taskbar: this._taskbarBin,
                folderMenu: this._folderMenuButton,
                trayOverflow,
                quickSettings,
                dateMenu,
                notificationArea: this._notificationAreaController.actor,
                showDesktop: this._showDesktopButton,
            },
            includeTrayOverflow: !trayInNotificationArea,
            includeShowDesktop: true,
            isSecondary: false,
        });
        placePanelItems(
            boxes,
            items,
            this._settings.get_strv('panel-item-order')
        );
        this._buttonPaddingController.syncEdgePadding();
        this._notificationAreaController.syncRightBoxActors(
            rightBox,
            new Set(items.map(item => item.actor)),
            new Set([this._folderMenuButton]),
            windowsXpThemeEnabled
        );
        this._stateController.syncActivitiesVisibility();
        this._verticalItemsController.sync();
        this._syncShowDesktopPanelCorner();
        this.updateTaskbarWidth();
    }

    _syncShowDesktopPanelCorner() {
        this._setShowDesktopPanelCorner(this._showDesktopPanelCorner());
    }

    _showDesktopPanelCorner() {
        if (!this._geometryController ||
            this._settings.get_boolean('windows-xp-theme-enabled'))
            return null;

        const box = this._showDesktopButton.get_parent();
        if (!box)
            return null;

        const visibleChildren = box.get_children().filter(child => child.visible);
        let edge = null;
        if (box === Main.panel._leftBox && visibleChildren[0] === this._showDesktopButton)
            edge = 'start';
        else if (box === Main.panel._rightBox && visibleChildren.at(-1) === this._showDesktopButton)
            edge = 'end';
        if (!edge)
            return null;

        const themeNode = Main.panel.get_theme_node();
        return {
            edge,
            radius: themeNode.get_border_radius(St.Corner.TOPLEFT),
            border: themeNode.get_border_width(St.Side.TOP),
            thickness: this._panelHeight,
        };
    }

    updateTaskbarWidth() {
        this._taskbarWidthUpdater.update();
    }

    queueTaskbarWidth() {
        this._taskbarWidthUpdater.queue();
    }

    _updateTaskbarWidthInternal() {
        const monitor = Main.layoutManager.primaryMonitor;
        const leftBox = Main.panel._leftBox;
        const centerBox = Main.panel._centerBox;
        const rightBox = Main.panel._rightBox;
        if (!monitor)
            return;

        const vertical = panelIsVertical(this._settings);
        const availableWidth = constrainTaskbarSize({
            taskbarBin: this._taskbarBin,
            leftBox,
            centerBox,
            rightBox,
            panelLength: this._geometryController
                ? this._geometryController.getMaximumLength()
                : vertical ? monitor.height : monitor.width,
            panelThickness: this._panelHeight,
            centered: this.appsAreCentered(),
            vertical,
        });
        if (availableWidth !== undefined &&
            this._onTaskbarAvailableWidthChanged(availableWidth)) {
            this.updateTaskbarWidth();
            return;
        }
        if (this._geometryController)
            this._geometryController.updateLength();
    }

    syncVerticalItems() {
        this._verticalItemsController.sync();
    }

    refreshPanelItemSizes() {
        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ]) {
            for (const child of box.get_children())
                child.queue_relayout();
            box.queue_relayout();
        }
    }

    appsAreCentered() {
        return panelApplicationAlignment(this._settings) === 'center';
    }

    _configurePanelMenuSwitching() {
        const menuManager = Main.panel.menuManager;
        const settings = this._settings;
        this._injectionManager.overrideMethod(
            menuManager,
            '_changeMenu',
            originalChangeMenu => function (menu) {
                if (!settings.get_boolean('panel-menu-click-only'))
                    originalChangeMenu.call(this, menu);
            }
        );
    }

    _configureAdaptivePanelAllocation() {
        const controller = this;
        this._injectionManager.overrideMethod(
            Object.getPrototypeOf(Main.panel),
            'vfunc_allocate',
            originalAllocate => function (box) {
                const vertical = panelIsVertical(controller._settings);
                if (dynamicTaskbarEnabled(controller._settings)) {
                    allocateDynamicPanel(this, box, this._leftBox, this._centerBox,
                        this._rightBox, controller._magnifyController.contentStart,
                        controller._magnifyController.contentLength, vertical);
                    return;
                }
                const visible = controller._taskbarBin.visible;
                const skip = visible
                    ? !controller._taskbarBin.get_parent()
                    : !vertical;
                if (skip) {
                    originalAllocate.call(this, box);
                    return;
                }

                const monitor =
                    Main.layoutManager.findMonitorForActor(this);
                let centerOffset = 0;
                if (monitor) {
                    const workArea =
                        Main.layoutManager.getWorkAreaForMonitor(
                            monitor.index
                        );
                    centerOffset = vertical
                        ? 2 * (workArea.y - monitor.y) +
                            workArea.height - monitor.height
                        : 2 * (workArea.x - monitor.x) +
                            workArea.width - monitor.width;
                }
                const allocate = !controller._taskbarBin.visible ||
                    controller._taskbarBin.get_parent() === this._centerBox
                    ? allocateAdaptivePanel
                    : allocateExpandedSidePanel;
                if (allocate === allocateAdaptivePanel) {
                    allocate(
                        this,
                        box,
                        this._leftBox,
                        this._centerBox,
                        this._rightBox,
                        centerOffset,
                        vertical,
                        controller._isTaskbarAdaptive()
                    );
                    return;
                }

                allocate(
                    this,
                    box,
                    this._leftBox,
                    this._centerBox,
                    this._rightBox,
                    centerOffset,
                    vertical
                );
            }
        );
    }

    _configureHotCornerSizing() {
        const controller = this;
        this._injectionManager.overrideMethod(
            Main.layoutManager,
            '_updateHotCorners',
            originalMethod => function () {
                originalMethod.call(this);
                if (!panelIsVertical(controller._settings))
                    return;
                for (const corner of this.hotCorners) {
                    if (!corner)
                        continue;
                    const setBarrierSize =
                        Object.getPrototypeOf(corner).setBarrierSize;
                    corner.setBarrierSize = size => setBarrierSize.call(
                        corner,
                        Math.min(size, GNOME_PANEL_SIZE)
                    );
                    corner.setBarrierSize(controller._panelHeight);
                }
            }
        );
    }

    _restoreHotCornerSizing() {
        Main.layoutManager._updateHotCorners();
    }

    _syncPanelOrientation() {
        const vertical = panelIsVertical(this._settings);
        const orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ])
            box.orientation = orientation;

        this._quickSettingsIndicatorsController ??=
            new QuickSettingsIndicatorsController(
                Main.panel.statusArea.quickSettings._indicators
            );
        this._quickSettingsIndicatorsController.sync(
            vertical,
            this._buttonPaddingController.effectivePadding(),
            quickSettingsIconSpacing(this._settings)
        );
        if (vertical)
            Main.panel.add_style_class_name('simple-taskbar-panel-vertical');
        else
            Main.panel.remove_style_class_name('simple-taskbar-panel-vertical');
    }

    _restoreNativeLayouts() {
        Main.layoutManager.panelBox.clip_to_allocation = false;
        Main.panel.remove_style_class_name('simple-taskbar-panel-vertical');
        if (!this._quickSettingsIndicatorsController)
            return;

        this._quickSettingsIndicatorsController.destroy();
        this._quickSettingsIndicatorsController = null;
    }

    _connectSignals() {
        Main.layoutManager.connectObject('monitors-changed', () => {
            this.position();
        }, this._signalHolder);
        if (this._geometryController) {
            Main.panel.connectObject('notify::style',
                () => this._syncShowDesktopPanelCorner(), this._signalHolder);
        }
        if (Main.screenShield) {
            Main.screenShield.connectObject('locked-changed', () => {
                if (!Main.screenShield.locked) {
                    this._stateController.syncActivitiesVisibility();
                    this.updateTaskbarWidth();
                }
            }, this._signalHolder);
        }
        const activities = Main.panel.statusArea.activities.container;
        activities.connectObject('notify::visible', () => {
            if (!Main.sessionMode.isLocked &&
                activities.visible !== this._settings.get_boolean(
                    'activities-button-visible'
                )) {
                this._stateController.syncActivitiesVisibility();
                this.updateTaskbarWidth();
            }
        }, this._signalHolder);
        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ]) {
            box.connectObject(
                'notify::width', () => this.queueTaskbarWidth(),
                'notify::height', () => this.queueTaskbarWidth(),
                this._signalHolder
            );
        }
        for (const signal of ['child-added', 'child-removed']) {
            this._taskbarActor.connectObject(signal, () => {
                this.updateTaskbarWidth();
            }, this._signalHolder);
        }
        this._settings.connectObject('changed::hide-app-labels', () => {
            this.updateTaskbarWidth();
        }, this._signalHolder);
        this._settings.connectObject('changed::panel-button-padding', () => {
            this._syncPanelOrientation();
            this._verticalItemsController.sync();
            this.updateTaskbarWidth();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::quick-settings-icon-spacing',
            () => this._syncPanelOrientation(),
            'changed::windows-xp-theme-enabled',
            () => this._syncPanelOrientation(),
            this._signalHolder
        );
        this._startButton.connectObject('notify::visible', () => {
            this.updateTaskbarWidth();
        }, this._signalHolder);
        Main.extensionManager.connectObject(
            'extension-state-changed',
            (_manager, extension) => {
                const uuid = extension.uuid;
                if (uuid === JUST_PERFECTION_UUID ||
                    uuid === DASH_TO_PANEL_UUID) {
                    this._queueLayoutRepair();
                }
            },
            this._signalHolder
        );
        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ]) {
            box.connectObject('child-added', () => {
                this._onPanelBoxChildChanged();
            }, this._signalHolder);
            box.connectObject('child-removed', () => {
                this._onPanelBoxChildChanged();
            }, this._signalHolder);
        }
        this._settings.connectObject('changed::app-alignment', () => {
            this._onAppAlignmentChanged();
            this.applyLayout();
        }, this._signalHolder);
        for (const key of [
            'start-button-position',
            'start-button-follow-app-alignment',
            'default-panel-start-button-position',
            'default-panel-start-button-follow-app-alignment',
        ]) {
            this._settings.connectObject(`changed::${key}`, () => {
                this.applyLayout();
            }, this._signalHolder);
        }
        for (const key of [
            'windows-start-menu-enabled',
            'gnome-start-button-visible',
            START_BUTTON_LOCATION_KEY,
            'system-menu-visible',
            'clock-visible',
            'hide-pinned-taskbar-apps',
            'hide-unpinned-taskbar-apps',
        ]) {
            this._settings.connectObject(`changed::${key}`, () => {
                this.applyLayout();
            }, this._signalHolder);
        }
        this._settings.connectObject('changed::activities-button-visible', () => {
            this._stateController.syncActivitiesVisibility();
            this.updateTaskbarWidth();
        }, this._signalHolder);
        this._settings.connectObject('changed::activities-button-position', () => {
            this.applyLayout();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::show-desktop-button-position',
            () => this.applyLayout(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::show-desktop-button-visible',
            () => this.applyLayout(),
            this._signalHolder
        );
        this._settings.connectObject('changed::start-button-padding', () => {
            this.updateTaskbarWidth();
        }, this._signalHolder);
        this._settings.connectObject('changed::clock-position', () => {
            this.applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::system-menu-position', () => {
            this.applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::folder-menu-enabled', () => {
            this.applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::folder-menu-position', () => {
            this.applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::tray-overflow-position', () => {
            this.applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::panel-item-order', () => {
            this.applyLayout();
        }, this._signalHolder);
    }

    _onPanelBoxChildChanged() {
        if (this._applyingLayout)
            return;

        this._queueLayoutRepair();
    }

    _queueLayoutRepair() {
        if (this._applyingLayout || this._layoutRepairId)
            return;

        this._layoutRepairId = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW,
            () => {
                this._layoutRepairId = 0;
                this.applyLayout();
                this._stateController.syncActivitiesVisibility();
                this._themeController.applyTheme();
                this.position();
                this._menuPositioner.refresh();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _isJustPerfectionActive() {
        return extensionIsActive(JUST_PERFECTION_UUID);
    }

    _withPanelChildAddedSignalsBlocked(callback) {
        const signalId = GObject.signal_lookup(
            'child-added',
            Clutter.Actor.$gtype
        );
        const boxes = [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ];
        for (const box of boxes) {
            GObject.signal_handlers_block_matched(
                box,
                GObject.SignalMatchType.ID,
                signalId,
                0,
                null,
                null,
                null
            );
        }

        try {
            callback();
        } finally {
            for (const box of boxes) {
                GObject.signal_handlers_unblock_matched(
                    box,
                    GObject.SignalMatchType.ID,
                    signalId,
                    0,
                    null,
                    null,
                    null
                );
            }
        }
    }

}
