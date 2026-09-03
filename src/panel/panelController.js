// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {extensionIsActive} from '../extensionState.js';
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
import {panelIsVertical} from './panelPosition.js';
import {
    QuickSettingsIndicatorsController,
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
    allocateExpandedSidePanel,
    constrainTaskbarSize,
} from '../taskbar/taskbarLayout.js';
import {TaskbarWidthUpdater} from '../taskbar/taskbarWidthUpdater.js';
const JUST_PERFECTION_UUID = 'just-perfection-desktop@just-perfection';
const DASH_TO_PANEL_UUID = 'dash-to-panel@jderose9.github.com';
const GNOME_PANEL_SIZE = 32;

export class PanelController {
    constructor({
        settings,
        panelHeight,
        onPanelHidden,
        getHoverAnimationOutwardReserve,
        startButton,
        taskbarBin,
        taskbarActor,
        showDesktopButton,
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
        this._autoHideController = new PanelAutoHideController({
            settings,
            panelActor: Main.panel,
            positionActor: Main.layoutManager.panelBox,
            getMonitor: () => Main.layoutManager.primaryMonitor,
            getPanelHeight: () => this._panelHeight,
            isBlocked: () => this._isAutoHideBlocked(),
            getOutwardReserve: getHoverAnimationOutwardReserve,
            onHidden: onPanelHidden,
        });
        this._windowDodgeController = new PanelWindowDodgeController({
            settings,
            getMonitor: () => Main.layoutManager.primaryMonitor,
            getGeometry: monitor => panelGeometry(
                this._settings,
                monitor,
                this._panelHeight
            ),
            onDodgeStateChanged: (enabled, active, pointerReveal) =>
                this._autoHideController.setDodgeState(
                    enabled,
                    active,
                    pointerReveal
                ),
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
            () => Main.panel.statusArea.quickSettings._indicators
        );
    }

    enable() {
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
        this._activitiesDotWidthOverride = new ActivitiesDotWidthOverride(
            Main.panel.statusArea.activities
        );
        this._activitiesController = new PanelActivitiesController(
            this._settings,
            Main.panel.statusArea.activities
        );
        this._activitiesController.enable();
        this._clockController = new PanelClockController(
            this._settings,
            Main.panel.statusArea.dateMenu,
            () => this._panelHeight
        );
        this._clockController.enable();
        this._themeController = new PanelThemeController(
            this._settings,
            this._stateController.oldPanelStyle
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

    setPanelHeight(panelHeight) {
        this._panelHeight = panelHeight;
        this.position();
        this._clockController.sync();
    }

    setStartMenuOpen(open) {
        this._autoHideController.setMenuOpen(open);
    }

    setShowDesktopButton(button) {
        this._showDesktopButton = button;
        this._stateController.setShowDesktopButton(button);
    }

    position() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const geometry = panelGeometry(
            this._settings,
            monitor,
            this._panelHeight
        );
        if (geometry.vertical)
            Main.panel.set_size(geometry.width, geometry.height);
        else {
            Main.panel.set_width(-1);
            Main.panel.set_height(geometry.height);
        }
        Main.layoutManager.panelBox.set_size(
            geometry.width,
            geometry.height
        );
        Main.layoutManager.panelBox.set_position(geometry.x, geometry.y);
        Main.layoutManager._updateHotCorners();
        this._syncPanelOrientation();
        this._verticalItemsController.sync();
        this._stateController.syncDateMenuVerticalAlignment(
            this._panelHeight
        );
        this._autoHideController.syncPosition();
        this._windowDodgeController.sync();
        this._queueOverviewRelayout();
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
        });
        placePanelItems(
            boxes,
            items,
            this._settings.get_strv('panel-item-order')
        );
        this._notificationAreaController.syncRightBoxActors(
            rightBox,
            new Set(items.map(item => item.actor)),
            new Set([this._folderMenuButton]),
            windowsXpThemeEnabled
        );
        this._stateController.syncActivitiesVisibility();
        this._verticalItemsController.sync();
        this.updateTaskbarWidth();
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
            panelLength: vertical ? monitor.height : monitor.width,
            panelThickness: this._panelHeight,
            centered: this.appsAreCentered(),
            vertical,
        });
        if (availableWidth !== undefined &&
            this._onTaskbarAvailableWidthChanged(availableWidth)) {
            this.updateTaskbarWidth();
        }
    }

    syncVerticalItems() {
        this._verticalItemsController.sync();
    }

    appsAreCentered() {
        return this._settings.get_string('app-alignment') === 'center';
    }

    destroy() {
        const restoringUnlockPanel = Main.sessionMode.isLocked;
        if (this._layoutRepairId) {
            GLib.Source.remove(this._layoutRepairId);
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
            this._buttonPaddingController.effectivePadding()
        );
        if (vertical)
            Main.panel.add_style_class_name('simple-taskbar-panel-vertical');
        else
            Main.panel.remove_style_class_name('simple-taskbar-panel-vertical');
    }

    _restoreNativeLayouts() {
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
        this._settings.connectObject('changed::start-button-position', () => {
            this.applyLayout();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::start-button-follow-app-alignment',
            () => this.applyLayout(),
            this._signalHolder
        );
        for (const key of [
            'windows-start-menu-enabled',
            'gnome-start-button-visible',
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

        this._layoutRepairId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
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
