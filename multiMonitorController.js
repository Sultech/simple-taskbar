// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {FolderMenuController} from './folderMenuController.js';
import {PanelAutoHideController} from './panelAutoHideController.js';
import {PanelInteractionController} from './panelInteractionController.js';
import {panelArrowSide, panelIsTop} from './panelPosition.js';
import {StartButtonController} from './startButtonController.js';
import {TaskbarController} from './taskbarController.js';
import {constrainTaskbarWidth} from './taskbarLayout.js';
import {WindowController} from './windowController.js';
import {WindowPreviewController} from './windowPreviewController.js';

const EXTERNAL_PANEL_STYLES = new Set([
    'transparent-panel',
    'light-panel',
    'dark-panel',
    'contrasted-panel',
]);
const INDICATOR_ROLES = ['activities', 'quickSettings', 'dateMenu'];
const INDICATOR_POOL = new Map(
    INDICATOR_ROLES.map(role => [role, []])
);

const SecondaryPanelActor = GObject.registerClass(
class SecondaryPanelActor extends St.Widget {
    _init() {
        super._init({
            name: 'panel',
            style_class:
                'simple-taskbar-panel simple-taskbar-secondary-panel',
            reactive: true,
            clip_to_allocation: true,
        });

        this.leftBox = new St.BoxLayout({
            name: 'panelLeft',
            y_expand: true,
        });
        this.centerBox = new St.BoxLayout({
            name: 'panelCenter',
            y_expand: true,
        });
        this.rightBox = new St.BoxLayout({
            name: 'panelRight',
            y_expand: true,
        });
        this.add_child(this.leftBox);
        this.add_child(this.centerBox);
        this.add_child(this.rightBox);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);

        const width = box.x2 - box.x1;
        const height = box.y2 - box.y1;
        const [, leftNaturalWidth] =
            this.leftBox.get_preferred_width(-1);
        const [, centerNaturalWidth] =
            this.centerBox.get_preferred_width(-1);
        const [, rightNaturalWidth] =
            this.rightBox.get_preferred_width(-1);

        // Match GNOME Shell's Panel allocation: keep both side groups at the
        // monitor edges and allocate the center group around the true center.
        const sideWidth = Math.max(0, (width - centerNaturalWidth) / 2);
        const childBox = new Clutter.ActorBox();
        childBox.y1 = 0;
        childBox.y2 = height;

        if (this.get_text_direction() === Clutter.TextDirection.RTL) {
            childBox.x1 = Math.max(
                width - Math.min(Math.floor(sideWidth), leftNaturalWidth),
                0
            );
            childBox.x2 = width;
        } else {
            childBox.x1 = 0;
            childBox.x2 = Math.min(
                Math.floor(sideWidth),
                leftNaturalWidth
            );
        }
        this.leftBox.allocate(childBox);

        childBox.x1 = Math.ceil(sideWidth);
        childBox.x2 = childBox.x1 + centerNaturalWidth;
        this.centerBox.allocate(childBox);

        if (this.get_text_direction() === Clutter.TextDirection.RTL) {
            childBox.x1 = 0;
            childBox.x2 = Math.min(
                Math.floor(sideWidth),
                rightNaturalWidth
            );
        } else {
            childBox.x1 = Math.max(
                width - Math.min(Math.floor(sideWidth), rightNaturalWidth),
                0
            );
            childBox.x2 = width;
        }
        this.rightBox.allocate(childBox);
    }
});

export class MultiMonitorController {
    constructor({
        extensionDir,
        settings,
        appSystem,
        tracker,
        favorites,
        spreadAppWindows,
        openPreferences,
    }) {
        this._extensionDir = extensionDir;
        this._settings = settings;
        this._appSystem = appSystem;
        this._tracker = tracker;
        this._favorites = favorites;
        this._spreadAppWindows = spreadAppWindows;
        this._openPreferences = openPreferences;
        this._signals = [];
        this._panels = [];
        this._rebuildId = 0;
    }

    enable() {
        this._connect(this._settings, 'changed::multi-monitor-panels', () => {
            this._queueRebuild();
        });
        this._connect(this._settings, 'changed::panel-position', () => {
            this._queueRebuild();
        });
        this._connect(Main.layoutManager, 'monitors-changed', () => {
            this._queueRebuild();
        });
        this._rebuild();
    }

    destroy() {
        if (this._rebuildId) {
            GLib.Source.remove(this._rebuildId);
            this._rebuildId = 0;
        }
        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];
        this._destroyPanels();
        this._extensionDir = null;
        this._settings = null;
        this._appSystem = null;
        this._tracker = null;
        this._favorites = null;
        this._spreadAppWindows = null;
        this._openPreferences = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _queueRebuild() {
        if (this._rebuildId)
            return;

        this._rebuildId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._rebuildId = 0;
                if (this._settings)
                    this._rebuild();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _rebuild() {
        this._destroyPanels();
        if (!this._settings.get_boolean('multi-monitor-panels'))
            return;

        const primaryMonitor = Main.layoutManager.primaryMonitor;
        for (const monitor of Main.layoutManager.monitors) {
            if (monitor === primaryMonitor)
                continue;

            const panel = new SecondaryTaskbarPanel({
                extensionDir: this._extensionDir,
                settings: this._settings,
                appSystem: this._appSystem,
                tracker: this._tracker,
                favorites: this._favorites,
                spreadAppWindows: this._spreadAppWindows,
                monitor,
                openPreferences: this._openPreferences,
            });
            this._panels.push(panel);
            panel.enable();
        }
    }

    _destroyPanels() {
        for (const panel of this._panels)
            panel.destroy();
        this._panels = [];
    }
}

class SecondaryTaskbarPanel {
    constructor({
        extensionDir,
        settings,
        appSystem,
        tracker,
        favorites,
        spreadAppWindows,
        monitor,
        openPreferences,
    }) {
        this._settings = settings;
        this._monitor = monitor;
        this._openPreferencesCallback = openPreferences;
        this._signals = [];
        this._panelHeight = settings.get_int('panel-height');
        this._iconSize = settings.get_int('icon-size');

        this._windowController = new WindowController(tracker, {
            settings,
            spreadAppWindows,
        });
        this._taskbarController = new TaskbarController({
            settings,
            appSystem,
            tracker,
            favorites,
            iconSize: this._iconSize,
            panelHeight: this._panelHeight,
            getInterestingWindows: app =>
                this._windowController.getInterestingWindows(app),
            onAppClicked: (item, app) =>
                this._windowController.handleAppClicked(item, app),
            onWindowClicked: window =>
                this._windowController.handleWindowClicked(window),
            openNewWindow: app => this._windowController.openNewWindow(app),
        });
        this._windowPreviews = new WindowPreviewController(
            () => this._taskbarController.getItems(),
            app => this._windowController.getInterestingWindows(app),
            settings
        );
        this._taskbarController.setPreviewController(this._windowPreviews);
        this._windowController.setTaskbarController(this._taskbarController);
        this._windowController.setPreviewController(this._windowPreviews);
        this._startButtonController = new StartButtonController({
            extensionDir,
            settings,
            iconSize: this._iconSize,
            previewController: this._windowPreviews,
            openPreferences,
            manageKeybindings: false,
        });
        this._folderMenuController = new FolderMenuController(settings);

        this._taskbarBin = new St.ScrollView({
            style_class: 'simple-taskbar-bin',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            enable_mouse_scrolling: true,
            clip_to_allocation: true,
            visible: !settings.get_boolean('default-gnome-panel'),
        });
        this._taskbarBin.add_child(this._taskbarController.actor);

        this.actor = new SecondaryPanelActor();
        this._leftBox = this.actor.leftBox;
        this._centerBox = this.actor.centerBox;
        this._rightBox = this.actor.rightBox;
        this._taskbarController.setAlignmentActor(this._centerBox);
        this._interactionController = null;
        this._autoHideController = null;
        this._menuManager = null;
        this._indicators = new Map();
    }

    enable() {
        this._menuManager = new PopupMenu.PopupMenuManager(this.actor);
        this._folderMenuController.enable(this._menuManager);
        this._acquireIndicators();
        this._applyLayout();
        this._syncTheme();
        Main.layoutManager.addChrome(this.actor, {
            affectsStruts: true,
            trackFullscreen: true,
        });
        this._position();
        this._startButtonController.enable();
        this._taskbarController.enable();
        this._interactionController = new PanelInteractionController({
            settings: this._settings,
            taskbarController: this._taskbarController,
            taskbarBin: this._taskbarBin,
            previewController: this._windowPreviews,
            openPreferences: this._openPreferencesCallback,
            panelActor: this.actor,
            panelBoxes: [this._leftBox, this._centerBox, this._rightBox],
        });
        this._interactionController.enable();
        this._autoHideController = new PanelAutoHideController({
            settings: this._settings,
            panelActor: this.actor,
            positionActor: this.actor,
            getMonitor: () => this._monitor,
            getPanelHeight: () => this._panelHeight,
            isBlocked: () => this._autoHideIsBlocked(),
        });
        this._autoHideController.enable();
        this._connectSignals();
    }

    destroy() {
        this._autoHideController?.destroy();
        this._autoHideController = null;
        this._interactionController?.destroy();
        this._interactionController = null;
        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];

        this._startButtonController?.destroy();
        this._startButtonController = null;
        this._windowController?.destroy();
        this._taskbarController?.destroy();
        this._windowPreviews?.destroy();
        this._windowPreviews = null;
        this._taskbarController = null;
        this._windowController = null;
        this._releaseIndicators();
        this._folderMenuController?.destroy();
        this._folderMenuController = null;
        this._menuManager = null;

        if (this.actor) {
            Main.layoutManager.removeChrome(this.actor);
            this.actor.destroy();
        }
        this.actor = null;
        this._leftBox = null;
        this._centerBox = null;
        this._rightBox = null;
        this._taskbarBin = null;
        this._monitor = null;
        this._openPreferencesCallback = null;
        this._settings = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _connectSignals() {
        this._connect(Main.panel, 'notify::style-class', () => {
            this._syncTheme();
        });
        this._connect(Main.panel, 'notify::style', () => {
            this._syncTheme();
        });
        this._connect(this._settings, 'changed::icon-size', () => {
            this._iconSize = this._settings.get_int('icon-size');
            this._startButtonController.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._taskbarController.setIconSize(this._iconSize);
            this._updateTaskbarWidth();
        });
        this._connect(this._settings, 'changed::panel-height', () => {
            this._panelHeight = this._settings.get_int('panel-height');
            this._taskbarController.setPanelHeight(this._panelHeight);
            this._position();
        });
        this._connect(this._settings, 'changed::icon-spacing', () => {
            this._applyAppearance();
            this._updateTaskbarWidth();
        });
        this._connect(this._settings, 'changed::default-gnome-panel', () => {
            this._syncTaskbarVisibility();
        });
        this._connect(this._settings, 'changed::app-alignment', () => {
            this._applyAppearance();
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::start-button-position', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::activities-button-visible', () => {
            this._syncActivitiesVisibility();
            this._updateTaskbarWidth();
        });
        this._connect(this._settings, 'changed::clock-position', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::system-menu-position', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::folder-menu-enabled', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::start-button-padding', () => {
            this._startButtonController.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._updateTaskbarWidth();
        });
        for (const signal of ['child-added', 'child-removed']) {
            this._connect(this._taskbarController.actor, signal, () => {
                this._updateTaskbarWidth();
            });
        }
        this._connect(this._settings, 'changed::hide-app-labels', () => {
            this._updateTaskbarWidth();
        });
    }

    _applyAppearance() {
        this._startButtonController.applyAppearance(
            this._iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._taskbarController.applyAppearance(
            this._settings.get_int('icon-spacing'),
            this._appsAreCentered()
        );
    }

    _syncTaskbarVisibility() {
        const visible = !this._settings.get_boolean('default-gnome-panel');
        this._taskbarBin.visible = visible;
        if (!visible) {
            this._windowPreviews.hideTooltip(false);
            this._windowPreviews.hide();
        }
        this._applyLayout();
    }

    _applyLayout() {
        const startButton = this._startButtonController.actor;
        const activities = this._indicators.get('activities')?.container;
        const quickSettings = this._indicators.get('quickSettings')?.container;
        const dateMenu = this._indicators.get('dateMenu')?.container;
        const folderMenuButton = this._folderMenuController.actor;
        for (const actor of [
            startButton,
            this._taskbarBin,
            activities,
            quickSettings,
            dateMenu,
            folderMenuButton,
        ])
            actor?.get_parent()?.remove_child(actor);

        const startBox =
            this._settings.get_string('start-button-position') === 'center'
                ? this._centerBox
                : this._leftBox;
        const taskbarBox = this._appsAreCentered()
            ? this._centerBox
            : this._leftBox;
        if (!this._settings.get_boolean('default-gnome-panel'))
            startBox.add_child(startButton);
        if (activities)
            this._leftBox.add_child(activities);
        taskbarBox.add_child(this._taskbarBin);
        if (this._settings.get_boolean('folder-menu-enabled'))
            this._rightBox.add_child(folderMenuButton);
        for (const [actor, settingKey] of [
            [quickSettings, 'system-menu-position'],
            [dateMenu, 'clock-position'],
        ]) {
            if (!actor)
                continue;
            const position = this._settings.get_string(settingKey);
            const target = position === 'left'
                ? this._leftBox
                : position === 'center'
                    ? this._centerBox
                    : this._rightBox;
            target.add_child(actor);
        }
        this._syncActivitiesVisibility();
        this._applyAppearance();
        this._updateTaskbarWidth();
    }

    _appsAreCentered() {
        return this._settings.get_string('app-alignment') === 'center';
    }

    _position() {
        this.actor.set_size(this._monitor.width, this._panelHeight);
        this.actor.x = this._monitor.x;
        if (this._autoHideController)
            this._autoHideController.syncPosition();
        else
            this.actor.y = panelIsTop(this._settings)
                ? this._monitor.y
                : this._monitor.y + this._monitor.height - this._panelHeight;
        this._updateTaskbarWidth();
    }

    _autoHideIsBlocked() {
        return Boolean(
            this._interactionController?.menuIsOpen ||
            this._startButtonController?.menuIsOpen ||
            this._folderMenuController?.menuIsOpen ||
            this._windowPreviews?.isOpen ||
            this._taskbarController?.isDragging ||
            this._taskbarController?.hasOpenMenu() ||
            this._menuManager?.activeMenu?.isOpen
        );
    }

    _updateTaskbarWidth() {
        const availableWidth = constrainTaskbarWidth({
            taskbarBin: this._taskbarBin,
            taskbarActor: this._taskbarController.actor,
            leftBox: this._leftBox,
            centerBox: this._centerBox,
            rightBox: this._rightBox,
            panelWidth: this._monitor.width,
            panelHeight: this._panelHeight,
            spacing: this._settings.get_int('icon-spacing'),
            centered: this._appsAreCentered(),
        });
        if (availableWidth !== undefined)
            this._taskbarController.setAvailableWidth(availableWidth);
    }

    _syncTheme() {
        const classes = Main.panel.get_style_class_name()
            .split(/\s+/)
            .filter(style => style && !EXTERNAL_PANEL_STYLES.has(style));
        classes.push('simple-taskbar-panel', 'simple-taskbar-secondary-panel');
        this.actor.set_style_class_name([...new Set(classes)].join(' '));
        this.actor.set_style(Main.panel.get_style());
    }

    _acquireIndicators() {
        for (const role of INDICATOR_ROLES) {
            const primaryIndicator = Main.panel.statusArea[role];
            const IndicatorConstructor = primaryIndicator?.constructor;
            if (!IndicatorConstructor)
                continue;

            const pool = INDICATOR_POOL.get(role);
            const indicator = pool.pop() ?? new IndicatorConstructor();
            this._indicators.set(role, indicator);
            const menu = indicator.menu;
            if (!menu)
                continue;

            this._menuManager.addMenu(menu);
            const side = panelArrowSide(this._settings);
            const boxPointer = menu._boxPointer;
            if (boxPointer)
                boxPointer._userArrowSide = side;
            if ('_arrowSide' in menu)
                menu._arrowSide = side;
            if (role !== 'quickSettings' &&
                !panelIsTop(this._settings)) {
                menu.actor.add_style_class_name(
                    'simple-taskbar-bottom-panel-menu'
                );
            }
        }

        const originalChangeMenu = this._menuManager._changeMenu;
        const settings = this._settings;
        this._menuManager._changeMenu = function (menu) {
            if (!settings.get_boolean('panel-menu-click-only'))
                originalChangeMenu.call(this, menu);
        };
    }

    _releaseIndicators() {
        for (const [role, indicator] of this._indicators) {
            const menu = indicator.menu;
            if (menu) {
                menu.close();
                menu.actor.remove_style_class_name(
                    'simple-taskbar-bottom-panel-menu'
                );
                this._menuManager?.removeMenu(menu);
            }
            indicator.container?.get_parent()?.remove_child(
                indicator.container
            );
            // GNOME Shell never destroys its own panel menus. Reuse these
            // instances after monitor changes instead of leaving their global
            // signal connections behind or invoking their fragile destroy path.
            INDICATOR_POOL.get(role).push(indicator);
        }
        this._indicators.clear();
    }

    _syncActivitiesVisibility() {
        const activities = this._indicators.get('activities')?.container;
        if (activities) {
            activities.visible = this._settings.get_boolean(
                'activities-button-visible'
            );
        }
    }
}
