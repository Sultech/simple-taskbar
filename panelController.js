// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {PanelAutoHideController} from './panelAutoHideController.js';
import {
    PanelButtonPaddingController,
} from './panelButtonPaddingController.js';
import {placePanelItems} from './panelItemOrder.js';
import {PanelMenuPositioner} from './panelMenuPositioner.js';
import {panelIsTop} from './panelPosition.js';
import {PanelStateController} from './panelStateController.js';
import {PanelThemeController} from './panelThemeController.js';
import {NotificationAreaController} from './notificationAreaController.js';
import {TRAY_OVERFLOW_ROLE} from './trayOverflowController.js';
import {
    allocateAdaptivePanel,
    allocateExpandedSidePanel,
    constrainTaskbarWidth,
} from './taskbarLayout.js';
const JUST_PERFECTION_UUID = 'just-perfection-desktop@just-perfection';
const DASH_TO_PANEL_UUID = 'dash-to-panel@jderose9.github.com';

export class PanelController {
    constructor({
        settings,
        panelHeight,
        startButton,
        taskbarBin,
        taskbarActor,
        showDesktopButton,
        folderMenuButton,
        onAppAlignmentChanged,
        onTaskbarAvailableWidthChanged,
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
        this._queueOverviewRelayout = queueOverviewRelayout;
        this._isAutoHideBlocked = isAutoHideBlocked;
        this._signals = [];
        this._layoutRepairId = 0;
        this._applyingLayout = false;
        this._stateController = null;
        this._themeController = null;
        this._injectionManager = new InjectionManager();
        this._menuPositioner = new PanelMenuPositioner(
            this._injectionManager,
            settings
        );
        this._notificationAreaController = new NotificationAreaController();
        this._autoHideController = new PanelAutoHideController({
            settings,
            panelActor: Main.panel,
            positionActor: Main.layoutManager.panelBox,
            getMonitor: () => Main.layoutManager.primaryMonitor,
            getPanelHeight: () => this._panelHeight,
            isBlocked: () => this._isAutoHideBlocked(),
        });
        this._buttonPaddingController = new PanelButtonPaddingController(
            settings,
            Main.panel,
            [
                Main.panel._leftBox,
                Main.panel._centerBox,
                Main.panel._rightBox,
            ]
        );
    }

    enable() {
        this._stateController = new PanelStateController({
            settings: this._settings,
            startButton: this._startButton,
            taskbarBin: this._taskbarBin,
            folderMenuButton: this._folderMenuButton,
            showDesktopButton: this._showDesktopButton,
        });
        this._stateController.enable();
        this._themeController = new PanelThemeController(
            this._settings,
            this._stateController.oldPanelStyle
        );
        this._configureAdaptivePanelAllocation();
        this._themeController.syncEdgeClass();
        this._themeController.syncBorder();
        this._buttonPaddingController.enable();
        this._themeController.applyTheme();
        this.applyLayout();
        this._stateController.removeDateMenuIndicatorPadding();
        this._menuPositioner.enable();
        this._configurePanelMenuSwitching();
        this._connectSignals();
        this._themeController.connectSignals(
            () => this.applyLayout(),
            () => {
                this.position();
                this._menuPositioner.refresh();
            }
        );
        this._themeController.queueBlurMyShellSync();
        this._autoHideController.enable();
    }

    setPanelHeight(panelHeight) {
        this._panelHeight = panelHeight;
        this.position();
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

        Main.panel.set_height(this._panelHeight);
        Main.layoutManager.panelBox.set_size(monitor.width, this._panelHeight);
        this._stateController.syncDateMenuVerticalAlignment(
            this._panelHeight
        );
        const panelBox = Main.layoutManager.panelBox;
        panelBox.x = monitor.x;
        if (this._autoHideController)
            this._autoHideController.syncPosition();
        else
            panelBox.y = panelIsTop(this._settings)
                ? monitor.y
                : monitor.y + monitor.height - this._panelHeight;
        this._queueOverviewRelayout();
        this.updateTaskbarWidth();
    }

    applyLayout() {
        if (!this._settings || this._applyingLayout)
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
        const items = [
            {
                id: 'start-button',
                actor: this._startButton,
                position: this._startButtonPosition(),
                visible: this._startButtonShouldBeVisible(),
            },
            {
                id: 'activities',
                actor: activities,
                position: this._settings.get_string(
                    'activities-button-position'
                ),
                visible: true,
            },
            {
                id: 'applications',
                actor: this._taskbarBin,
                position: this._settings.get_string('app-alignment'),
                visible: true,
            },
            {
                id: 'folder-menu',
                actor: this._folderMenuButton,
                position: this._settings.get_string('folder-menu-position'),
                visible: this._settings.get_boolean('folder-menu-enabled'),
            },
        ];
        if (!trayInNotificationArea) {
            items.push({
                id: 'tray-overflow',
                actor: trayOverflow,
                position: this._settings.get_string(
                    'tray-overflow-position'
                ),
                visible: true,
            });
        }
        if (windowsXpThemeEnabled) {
            items.push({
                id: 'clock',
                actor: this._notificationAreaController.actor,
                position: this._settings.get_string('clock-position'),
                visible: true,
            });
        } else {
            items.push(
                {
                    id: 'system-menu',
                    actor: quickSettings,
                    position: this._settings.get_string(
                        'system-menu-position'
                    ),
                    visible: true,
                },
                {
                    id: 'clock',
                    actor: dateMenu,
                    position: this._settings.get_string('clock-position'),
                    visible: true,
                }
            );
        }
        if (!windowsXpThemeEnabled) {
            items.push({
                id: 'show-desktop',
                actor: this._showDesktopButton,
                position: showDesktopPosition,
                visible: this._settings.get_boolean(
                    'show-desktop-button-visible'
                ),
            });
        }
        placePanelItems(
            boxes,
            items,
            this._settings.get_strv('panel-item-order')
        );
        this._notificationAreaController.syncRightBoxActors(
            rightBox,
            new Set(items.map(item => item.actor)),
            windowsXpThemeEnabled
        );
        this._stateController.syncActivitiesVisibility();
        this.updateTaskbarWidth();
    }

    updateTaskbarWidth() {
        if (!this._taskbarBin || !this._settings)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        const leftBox = Main.panel._leftBox;
        const centerBox = Main.panel._centerBox;
        const rightBox = Main.panel._rightBox;
        if (!monitor)
            return;

        const availableWidth = constrainTaskbarWidth({
            taskbarBin: this._taskbarBin,
            leftBox,
            centerBox,
            rightBox,
            panelWidth: monitor.width,
            panelHeight: this._panelHeight,
            centered: this.appsAreCentered(),
        });
        if (availableWidth !== undefined)
            this._onTaskbarAvailableWidthChanged(availableWidth);
    }

    appsAreCentered() {
        return this._settings.get_string('app-alignment') === 'center';
    }

    _startButtonPosition() {
        return this._settings.get_boolean(
            'start-button-follow-app-alignment'
        )
            ? this._settings.get_string('app-alignment')
            : this._settings.get_string('start-button-position');
    }

    _startButtonShouldBeVisible() {
        return !this._settings.get_boolean('default-gnome-panel') &&
            (this._settings.get_boolean('windows-start-menu-enabled') ||
                this._settings.get_boolean('gnome-start-button-visible'));
    }

    destroy() {
        const restoringUnlockPanel = Main.sessionMode.isLocked;
        if (this._layoutRepairId) {
            GLib.Source.remove(this._layoutRepairId);
            this._layoutRepairId = 0;
        }
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];

        this._autoHideController.destroy();
        this._autoHideController = null;
        this._buttonPaddingController.destroy();
        this._buttonPaddingController = null;
        this._notificationAreaController.restore(Main.panel._rightBox);
        this._notificationAreaController.destroy();

        this._menuPositioner.destroy();
        this._menuPositioner = null;
        this._injectionManager.clear();
        this._injectionManager = null;

        this._themeController.destroy();
        this._themeController = null;
        this._stateController.destroy(restoringUnlockPanel);
        this._stateController = null;

        this._startButton = null;
        this._taskbarBin = null;
        this._taskbarActor = null;
        this._showDesktopButton = null;
        this._folderMenuButton = null;
        this._onAppAlignmentChanged = null;
        this._onTaskbarAvailableWidthChanged = null;
        this._queueOverviewRelayout = null;
        this._isAutoHideBlocked = null;
        this._settings = null;
        this._notificationAreaController = null;
        this._applyingLayout = false;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
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
                if (!controller._taskbarBin.visible ||
                    !controller._taskbarBin.get_parent()) {
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
                    centerOffset = 2 * (workArea.x - monitor.x) +
                        workArea.width - monitor.width;
                }
                const allocate = controller._taskbarBin.get_parent() ===
                    this._centerBox
                    ? allocateAdaptivePanel
                    : allocateExpandedSidePanel;
                allocate(
                    this,
                    box,
                    this._leftBox,
                    this._centerBox,
                    this._rightBox,
                    centerOffset
                );
            }
        );
    }

    _connectSignals() {
        this._connect(Main.layoutManager, 'monitors-changed', () => {
            this.position();
        });
        if (Main.screenShield) {
            this._connect(Main.screenShield, 'locked-changed', () => {
                if (!Main.screenShield.locked) {
                    this._stateController.syncActivitiesVisibility();
                    this.updateTaskbarWidth();
                }
            });
        }
        const activities = Main.panel.statusArea.activities.container;
        this._connect(activities, 'notify::visible', () => {
            if (!Main.sessionMode.isLocked &&
                activities.visible !== this._settings.get_boolean(
                    'activities-button-visible'
                )) {
                this._stateController.syncActivitiesVisibility();
                this.updateTaskbarWidth();
            }
        });
        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ]) {
            this._connect(box, 'notify::width', () => {
                this.updateTaskbarWidth();
            });
        }
        for (const signal of ['child-added', 'child-removed']) {
            this._connect(this._taskbarActor, signal, () => {
                this.updateTaskbarWidth();
            });
        }
        this._connect(this._settings, 'changed::hide-app-labels', () => {
            this.updateTaskbarWidth();
        });
        this._connect(this._startButton, 'notify::visible', () => {
            this.updateTaskbarWidth();
        });
        this._connect(
            Main.extensionManager,
            'extension-state-changed',
            (_manager, extension) => {
                const uuid = extension.uuid;
                if (uuid === JUST_PERFECTION_UUID ||
                    uuid === DASH_TO_PANEL_UUID) {
                    this._queueLayoutRepair();
                }
            }
        );
        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ]) {
            this._connect(box, 'child-added', () => {
                this._onPanelBoxChildChanged();
            });
            this._connect(box, 'child-removed', () => {
                this._onPanelBoxChildChanged();
            });
        }
        this._connect(this._settings, 'changed::app-alignment', () => {
            this._onAppAlignmentChanged();
            this.applyLayout();
        });
        this._connect(this._settings, 'changed::start-button-position', () => {
            this.applyLayout();
        });
        this._connect(
            this._settings,
            'changed::start-button-follow-app-alignment',
            () => this.applyLayout()
        );
        for (const key of [
            'windows-start-menu-enabled',
            'gnome-start-button-visible',
        ]) {
            this._connect(this._settings, `changed::${key}`, () => {
                this.applyLayout();
            });
        }
        this._connect(this._settings, 'changed::activities-button-visible', () => {
            this._stateController.syncActivitiesVisibility();
            this.updateTaskbarWidth();
        });
        this._connect(this._settings, 'changed::activities-button-position', () => {
            this.applyLayout();
        });
        this._connect(
            this._settings,
            'changed::show-desktop-button-position',
            () => this.applyLayout()
        );
        this._connect(
            this._settings,
            'changed::show-desktop-button-visible',
            () => this.applyLayout()
        );
        this._connect(this._settings, 'changed::start-button-padding', () => {
            this.updateTaskbarWidth();
        });
        this._connect(this._settings, 'changed::clock-position', () => {
            this.applyLayout();
        });
        this._connect(this._settings, 'changed::system-menu-position', () => {
            this.applyLayout();
        });
        this._connect(this._settings, 'changed::folder-menu-enabled', () => {
            this.applyLayout();
        });
        this._connect(this._settings, 'changed::folder-menu-position', () => {
            this.applyLayout();
        });
        this._connect(this._settings, 'changed::tray-overflow-position', () => {
            this.applyLayout();
        });
        this._connect(this._settings, 'changed::panel-item-order', () => {
            this.applyLayout();
        });
    }

    _onPanelBoxChildChanged() {
        if (this._applyingLayout)
            return;

        this._queueLayoutRepair();
    }

    _queueLayoutRepair() {
        if (!this._settings || this._applyingLayout || this._layoutRepairId)
            return;

        this._layoutRepairId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._layoutRepairId = 0;
                if (!this._settings)
                    return GLib.SOURCE_REMOVE;

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
        const extension = Main.extensionManager.lookup(
            JUST_PERFECTION_UUID
        );
        return extension?.state === ExtensionUtils.ExtensionState.ACTIVE;
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
