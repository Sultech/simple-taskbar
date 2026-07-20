// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {PanelAutoHideController} from './panelAutoHideController.js';
import {PanelMenuPositioner} from './panelMenuPositioner.js';
import {panelIsTop} from './panelPosition.js';
import {shellMenusUseLightTheme} from './themeUtils.js';

const EXTERNAL_PANEL_STYLES = [
    'transparent-panel',
    'light-panel',
    'dark-panel',
    'contrasted-panel',
];
const JUST_PERFECTION_UUID = 'just-perfection-desktop@just-perfection';
const DASH_TO_PANEL_UUID = 'dash-to-panel@jderose9.github.com';
const JUST_PERFECTION_BUTTON_PADDING_PREFIX =
    'just-perfection-api-panel-button-padding-size';
const DEFAULT_BUTTON_PADDING_CLASS =
    'simple-taskbar-default-panel-button-padding';
const LIGHT_BLUR_OVERLAY_CLASS =
    'simple-taskbar-light-blur-overlay';
const LIGHT_BLUR_TRANSPARENCY = 40;

export class PanelController {
    constructor({
        settings,
        panelHeight,
        startButton,
        taskbarBin,
        showDesktopButton,
        folderMenuButton,
        onAppAlignmentChanged,
        queueOverviewRelayout,
        isAutoHideBlocked,
    }) {
        this._settings = settings;
        this._panelHeight = panelHeight;
        this._startButton = startButton;
        this._taskbarBin = taskbarBin;
        this._showDesktopButton = showDesktopButton;
        this._folderMenuButton = folderMenuButton;
        this._onAppAlignmentChanged = onAppAlignmentChanged;
        this._queueOverviewRelayout = queueOverviewRelayout;
        this._isAutoHideBlocked = isAutoHideBlocked;
        this._signals = [];
        this._panelItemState = [];
        this._panelWasModified = false;
        this._oldPanelGeometry = null;
        this._oldPanelHeight = null;
        this._oldPanelStyle = null;
        this._activitiesWasVisible = null;
        this._dateMenuIndicatorPad = null;
        this._dateMenuIndicatorPadConstraints = [];
        this._layoutRepairId = 0;
        this._applyingLayout = false;
        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stSettings = St.Settings.get();
        this._injectionManager = new InjectionManager();
        this._menuPositioner = new PanelMenuPositioner(
            this._injectionManager,
            settings
        );
        this._autoHideController = new PanelAutoHideController({
            settings,
            panelActor: Main.panel,
            positionActor: Main.layoutManager.panelBox,
            getMonitor: () => Main.layoutManager.primaryMonitor,
            getPanelHeight: () => this._panelHeight,
            isBlocked: () => this._isAutoHideBlocked?.() ?? false,
        });
    }

    enable() {
        this._rememberPanelState();
        this._attachActors();
        this._syncPanelEdgeClass();
        this._syncPanelButtonPadding();
        this._applyTheme();
        this.applyLayout();
        this._removeDateMenuIndicatorPadding();
        this._menuPositioner.enable();
        this._configurePanelMenuSwitching();
        this._connectSignals();
        this._autoHideController.enable();
    }

    setPanelHeight(panelHeight) {
        this._panelHeight = panelHeight;
        this.position();
    }

    position() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        Main.panel.set_height(this._panelHeight);
        Main.layoutManager.panelBox.set_size(monitor.width, this._panelHeight);
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
    }

    _applyLayout() {
        const leftBox = Main.panel._leftBox;
        const centerBox = Main.panel._centerBox;
        const rightBox = Main.panel._rightBox;
        const actors = [
            this._startButton,
            this._taskbarBin,
            this._folderMenuButton,
            ...this._panelItemState.map(item => item.actor),
        ];

        for (const actor of actors)
            actor.get_parent()?.remove_child(actor);

        const taskbarBox = this.appsAreCentered() ? centerBox : leftBox;
        const startButtonBox =
            this._settings.get_string('start-button-position') === 'center'
                ? centerBox
                : leftBox;
        if (!this._settings.get_boolean('default-gnome-panel')) {
            if (startButtonBox === leftBox)
                leftBox.insert_child_at_index(this._startButton, 0);
            else
                centerBox.add_child(this._startButton);
        }
        taskbarBox.add_child(this._taskbarBin);

        for (const item of this._panelItemState) {
            const position = this._settings.get_string(item.key);
            const target = position === 'left'
                ? leftBox
                : position === 'center'
                    ? centerBox
                    : rightBox;
            let index = target.get_n_children();
            if (target === rightBox &&
                this._showDesktopButton.get_parent() === rightBox) {
                index = rightBox.get_children().indexOf(
                    this._showDesktopButton
                );
            }
            target.insert_child_at_index(item.actor, index);
        }
        if (this._settings.get_boolean('folder-menu-enabled')) {
            const rightChildren = rightBox.get_children();
            const rightPanelItemIndices = this._panelItemState
                .filter(item => item.actor.get_parent() === rightBox)
                .map(item => rightChildren.indexOf(item.actor))
                .filter(index => index >= 0);
            const showDesktopIndex = rightChildren.indexOf(
                this._showDesktopButton
            );
            const folderMenuIndex = rightPanelItemIndices.length > 0
                ? Math.min(...rightPanelItemIndices)
                : showDesktopIndex >= 0
                    ? showDesktopIndex
                    : rightBox.get_n_children();
            rightBox.insert_child_at_index(
                this._folderMenuButton,
                folderMenuIndex
            );
        }
        this.updateTaskbarWidth();
    }

    updateTaskbarWidth() {
        if (!this._taskbarBin || !this._settings)
            return;

        if (this.appsAreCentered()) {
            this._taskbarBin.set_width(-1);
            return;
        }

        const monitor = Main.layoutManager.primaryMonitor;
        const leftBox = Main.panel._leftBox;
        const centerBox = Main.panel._centerBox;
        if (!monitor || centerBox.get_n_children() === 0) {
            this._taskbarBin.set_width(-1);
            return;
        }

        const [, centerWidth] = centerBox.get_preferred_width(this._panelHeight);
        let occupiedWidth = 0;
        for (const actor of leftBox.get_children()) {
            if (actor === this._taskbarBin || !actor.visible)
                continue;
            const [, naturalWidth] = actor.get_preferred_width(this._panelHeight);
            occupiedWidth += naturalWidth;
        }

        const centerStart = Math.floor((monitor.width - centerWidth) / 2);
        this._taskbarBin.set_width(Math.max(1, centerStart - occupiedWidth - 8));
    }

    appsAreCentered() {
        return this._settings.get_string('app-alignment') === 'center';
    }

    destroy() {
        this._autoHideController?.destroy();
        this._autoHideController = null;
        if (this._layoutRepairId) {
            GLib.Source.remove(this._layoutRepairId);
            this._layoutRepairId = 0;
        }
        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];
        this._restoreDateMenuIndicatorPadding();

        for (const actor of [
            this._startButton,
            this._taskbarBin,
            this._folderMenuButton,
            this._showDesktopButton,
        ])
            actor?.get_parent()?.remove_child(actor);
        this._restorePanelItems();

        this._menuPositioner?.destroy();
        this._menuPositioner = null;
        this._injectionManager?.clear();
        this._injectionManager = null;

        if (this._panelWasModified) {
            Main.panel.remove_style_class_name('simple-taskbar-panel');
            Main.panel.remove_style_class_name('simple-taskbar-theme-light');
            Main.panel.remove_style_class_name('simple-taskbar-theme-dark');
            Main.panel.remove_style_class_name('simple-taskbar-panel-top');
            Main.panel.remove_style_class_name('simple-taskbar-panel-bottom');
            Main.panel.remove_style_class_name(DEFAULT_BUTTON_PADDING_CLASS);
            Main.panel.remove_style_class_name(LIGHT_BLUR_OVERLAY_CLASS);
            Main.panel.set_style(this._oldPanelStyle ?? '');

            const activities = Main.panel.statusArea.activities?.container;
            if (activities && this._activitiesWasVisible !== null)
                activities.visible = this._activitiesWasVisible;
        }

        const panelBox = Main.layoutManager.panelBox;
        if (this._oldPanelGeometry) {
            if (this._oldPanelHeight !== null)
                Main.panel.set_height(this._oldPanelHeight);
            panelBox.set_size(
                this._oldPanelGeometry.width,
                this._oldPanelGeometry.height
            );
            panelBox.set_position(
                this._oldPanelGeometry.x,
                this._oldPanelGeometry.y
            );
        }

        this._panelItemState = null;
        this._startButton = null;
        this._taskbarBin = null;
        this._showDesktopButton = null;
        this._folderMenuButton = null;
        this._onAppAlignmentChanged = null;
        this._queueOverviewRelayout = null;
        this._isAutoHideBlocked = null;
        this._themeContext = null;
        this._stSettings = null;
        this._settings = null;
        this._oldPanelGeometry = null;
        this._oldPanelHeight = null;
        this._oldPanelStyle = null;
        this._activitiesWasVisible = null;
        this._dateMenuIndicatorPad = null;
        this._dateMenuIndicatorPadConstraints = null;
        this._applyingLayout = false;
        this._panelWasModified = false;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _configurePanelMenuSwitching() {
        const menuManager = Main.panel.menuManager;
        if (!menuManager?._changeMenu)
            return;

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

    _removeDateMenuIndicatorPadding() {
        const dateMenu = Main.panel.statusArea.dateMenu;
        const indicatorPad = dateMenu
            ?.get_first_child()
            ?.get_first_child();
        if (!indicatorPad?.get_constraints ||
            !indicatorPad?.clear_constraints) {
            return;
        }

        this._dateMenuIndicatorPad = indicatorPad;
        this._dateMenuIndicatorPadConstraints =
            [...indicatorPad.get_constraints()];
        indicatorPad.clear_constraints();
        indicatorPad.queue_relayout();
        dateMenu.queue_relayout();
    }

    _restoreDateMenuIndicatorPadding() {
        const indicatorPad = this._dateMenuIndicatorPad;
        if (!indicatorPad)
            return;

        for (const constraint of this._dateMenuIndicatorPadConstraints)
            indicatorPad.add_constraint(constraint);
        indicatorPad.queue_relayout();
        Main.panel.statusArea.dateMenu?.queue_relayout();
        this._dateMenuIndicatorPad = null;
        this._dateMenuIndicatorPadConstraints = [];
    }

    _connectSignals() {
        this._connect(Main.layoutManager, 'monitors-changed', () => {
            this.position();
        });
        this._connect(Main.panel._centerBox, 'notify::width', () => {
            this.updateTaskbarWidth();
        });
        this._connect(this._startButton, 'notify::visible', () => {
            this.updateTaskbarWidth();
        });
        this._connect(Main.panel, 'notify::style-class', () => {
            this._applyTransparency();
        });
        this._connect(
            Main.layoutManager.uiGroup,
            'notify::style-class',
            () => this._syncPanelButtonPadding()
        );
        this._connect(
            Main.extensionManager,
            'extension-state-changed',
            (_manager, extension) => {
                if (extension?.uuid === JUST_PERFECTION_UUID ||
                    extension?.uuid === DASH_TO_PANEL_UUID) {
                    this._queueLayoutRepair();
                }
            }
        );
        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ]) {
            this._connect(box, 'child-added', (_box, child) => {
                this._onPanelBoxChildChanged(child);
            });
            this._connect(box, 'child-removed', (_box, child) => {
                this._onPanelBoxChildChanged(child);
            });
        }
        this._connect(this._settings, 'changed::transparency-enabled', () => {
            this._applyTransparency();
        });
        this._connect(this._settings, 'changed::transparency-level', () => {
            this._applyTransparency();
        });
        this._connect(this._settings, 'changed::panel-theme-follow-system', () => {
            this._applyTheme();
        });
        this._connect(this._settings, 'changed::panel-theme', () => {
            this._applyTheme();
        });
        this._connect(this._settings, 'changed::panel-position', () => {
            this._syncPanelEdgeClass();
            this.position();
            this._menuPositioner?.refresh();
            this._applyTransparency();
        });
        this._connect(this._themeContext, 'changed', () => {
            if (this._settings.get_boolean('panel-theme-follow-system'))
                this._applyTheme();
        });
        for (const signal of [
            'notify::color-scheme',
            'notify::shell-color-scheme',
        ]) {
            this._connect(this._stSettings, signal, () => {
                if (this._settings.get_boolean(
                    'panel-theme-follow-system'
                )) {
                    this._applyTheme();
                }
            });
        }
        this._connect(this._settings, 'changed::app-alignment', () => {
            this._onAppAlignmentChanged();
            this.applyLayout();
        });
        this._connect(this._settings, 'changed::start-button-position', () => {
            this.applyLayout();
        });
        this._connect(this._settings, 'changed::activities-button-visible', () => {
            this._syncActivitiesVisibility();
            this.updateTaskbarWidth();
        });
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
    }

    _onPanelBoxChildChanged(child) {
        if (this._applyingLayout)
            return;

        const managedActors = [
            this._startButton,
            this._taskbarBin,
            this._folderMenuButton,
            ...this._panelItemState.map(item => item.actor),
        ];
        if (managedActors.includes(child))
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
                this._syncActivitiesVisibility();
                this._syncPanelButtonPadding();
                this._applyTheme();
                this.position();
                this._menuPositioner?.refresh();
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

    _syncPanelButtonPadding() {
        if (!this._panelWasModified)
            return;

        const uiStyleClasses =
            Main.layoutManager.uiGroup.get_style_class_name() ?? '';
        const externalPaddingActive = uiStyleClasses
            .split(/\s+/)
            .some(style => style.startsWith(
                JUST_PERFECTION_BUTTON_PADDING_PREFIX
            ));
        if (externalPaddingActive) {
            Main.panel.remove_style_class_name(
                DEFAULT_BUTTON_PADDING_CLASS
            );
        } else {
            Main.panel.add_style_class_name(DEFAULT_BUTTON_PADDING_CLASS);
        }
    }

    _withPanelChildAddedSignalsBlocked(callback) {
        const signalId = GObject.signal_lookup(
            'child-added',
            Clutter.Actor.$gtype
        );
        if (!signalId) {
            callback();
            return;
        }

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

    _rememberPanelState() {
        const panelBox = Main.layoutManager.panelBox;
        const activities = Main.panel.statusArea.activities?.container;
        this._oldPanelGeometry = {
            x: panelBox.x,
            y: panelBox.y,
            width: panelBox.width,
            height: panelBox.height,
        };
        this._oldPanelHeight = Main.panel.height;
        this._oldPanelStyle = Main.panel.get_style();
        this._activitiesWasVisible = activities?.visible ?? false;

        for (const [key, indicator] of [
            ['system-menu-position', Main.panel.statusArea.quickSettings],
            ['clock-position', Main.panel.statusArea.dateMenu],
        ]) {
            const actor = indicator?.container;
            const parent = actor?.get_parent();
            if (!parent)
                continue;

            this._panelItemState.push({
                key,
                actor,
                parent,
                index: parent.get_children().indexOf(actor),
            });
        }
    }

    _attachActors() {
        // GNOME Shell does not expose a public API for restructuring the panel.
        // Keep the private access in one guarded location so API changes fail
        // before the existing panel is modified.
        const leftBox = Main.panel._leftBox;
        const centerBox = Main.panel._centerBox;
        const rightBox = Main.panel._rightBox;
        if (!leftBox?.insert_child_at_index ||
            !centerBox?.insert_child_at_index ||
            !rightBox?.insert_child_at_index)
            throw new Error('GNOME Shell 50 panel boxes are unavailable');

        this._panelWasModified = true;
        Main.panel.add_style_class_name('simple-taskbar-panel');
        this._syncActivitiesVisibility();
        if (!this._settings.get_boolean('default-gnome-panel'))
            leftBox.insert_child_at_index(this._startButton, 0);
        if (this._settings.get_boolean('folder-menu-enabled'))
            rightBox.add_child(this._folderMenuButton);
        rightBox.add_child(this._showDesktopButton);
    }

    _syncActivitiesVisibility() {
        const activities = Main.panel.statusArea.activities?.container;
        if (activities) {
            activities.visible = this._settings.get_boolean(
                'activities-button-visible'
            );
        }
    }

    _syncPanelEdgeClass() {
        if (!this._panelWasModified)
            return;

        const top = panelIsTop(this._settings);
        Main.panel.remove_style_class_name(
            top ? 'simple-taskbar-panel-bottom' : 'simple-taskbar-panel-top'
        );
        Main.panel.add_style_class_name(
            top ? 'simple-taskbar-panel-top' : 'simple-taskbar-panel-bottom'
        );
    }

    _restorePanelItems() {
        for (const {actor} of this._panelItemState ?? [])
            actor.get_parent()?.remove_child(actor);

        const states = [...(this._panelItemState ?? [])]
            .sort((a, b) => a.index - b.index);
        for (const {actor, parent, index} of states) {
            parent.insert_child_at_index(
                actor,
                Math.min(index, parent.get_n_children())
            );
        }
    }

    _usesLightTheme() {
        if (!this._settings.get_boolean('panel-theme-follow-system'))
            return this._settings.get_string('panel-theme') === 'light';

        return shellMenusUseLightTheme();
    }

    _applyTheme() {
        if (!this._settings || !this._panelWasModified)
            return;

        const light = this._usesLightTheme();
        Main.panel.remove_style_class_name(
            light ? 'simple-taskbar-theme-dark' : 'simple-taskbar-theme-light'
        );
        Main.panel.add_style_class_name(
            light ? 'simple-taskbar-theme-light' : 'simple-taskbar-theme-dark'
        );
        this._applyTransparency();
    }

    _applyTransparency() {
        if (!this._settings || !this._panelWasModified)
            return;

        const originalStyle = this._oldPanelStyle?.trim() ?? '';
        const externalPanelStyle = EXTERNAL_PANEL_STYLES.some(style =>
            Main.panel.has_style_class_name(style)
        );
        const light = this._usesLightTheme();
        if (externalPanelStyle && light)
            Main.panel.add_style_class_name(LIGHT_BLUR_OVERLAY_CLASS);
        else
            Main.panel.remove_style_class_name(LIGHT_BLUR_OVERLAY_CLASS);
        if (externalPanelStyle && !light) {
            // External blur actors render their background behind Main.panel.
            Main.panel.set_style(originalStyle);
            return;
        }

        const transparency = externalPanelStyle
            ? LIGHT_BLUR_TRANSPARENCY
            : this._settings.get_boolean('transparency-enabled')
                ? Math.clamp(
                    this._settings.get_int('transparency-level'),
                    0,
                    100
                )
                : 4;
        const opacity = 1 - transparency / 100;
        const background = light ? '235, 235, 238' : '24, 24, 27';
        const border = light ? '0, 0, 0' : '255, 255, 255';
        const borderOpacity = (light ? 0.14 : 0.12) * opacity;
        const shadowOpacity = 0.18 * opacity;
        const top = panelIsTop(this._settings);
        const borderStyle = top
            ? `border-top: 0; border-bottom: 1px solid ` +
                `rgba(${border}, ${borderOpacity.toFixed(3)}); `
            : `border-top: 1px solid ` +
                `rgba(${border}, ${borderOpacity.toFixed(3)}); ` +
                'border-bottom: 0; ';
        const shadowY = top ? 2 : -2;
        const transparencyStyle =
            `background-color: rgba(${background}, ${opacity.toFixed(2)}); ` +
            borderStyle +
            `box-shadow: 0 ${shadowY}px 8px ` +
            `rgba(0, 0, 0, ${shadowOpacity.toFixed(3)});`;
        Main.panel.set_style(
            originalStyle
                ? `${originalStyle}; ${transparencyStyle}`
                : transparencyStyle
        );
    }
}
