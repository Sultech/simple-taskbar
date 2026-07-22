// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    Extension,
    gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ExtensionConflictController} from './extensionConflictController.js';
import {FolderMenuController} from './folderMenuController.js';
import {FavoritesIntegration} from './favoritesIntegration.js';
import {HotEdgeController} from './hotEdgeController.js';
import {PanelController} from './panelController.js';
import {PanelInteractionController} from './panelInteractionController.js';
import {MultiMonitorController} from './multiMonitorController.js';
import {NotificationBannerController} from './notificationBannerController.js';
import {StartButtonController} from './startButtonController.js';
import {TaskbarController} from './taskbarController.js';
import {WindowController} from './windowController.js';
import {WindowPreviewController} from './windowPreviewController.js';
import {OverviewIntegration} from './overviewIntegration.js';

const ICON_VERTICAL_RESERVE = 14;

export default class SimpleTaskbarExtension extends Extension {
    enable() {
        this._appSystem = Shell.AppSystem.get_default();
        this._tracker = Shell.WindowTracker.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._settings = this.getSettings();
        this._extensionConflictController =
            new ExtensionConflictController(this._settings);
        this._extensionConflictController.enable();
        this._favoritesIntegration = new FavoritesIntegration(this._settings);
        this._favoritesIntegration.enable();
        this._notificationBannerController =
            new NotificationBannerController(this._settings);
        this._notificationBannerController.enable();
        this._iconSize = this._settings.get_int('icon-size');
        this._panelHeight = this._settings.get_int('panel-height');
        if (!this._settings.get_boolean('default-gnome-panel') &&
            this._panelHeight < this._iconSize + ICON_VERTICAL_RESERVE) {
            this._panelHeight = this._iconSize + ICON_VERTICAL_RESERVE;
            this._settings.set_int('panel-height', this._panelHeight);
        }
        this._overviewIntegration = new OverviewIntegration(
            this._panelHeight,
            this._settings
        );
        this._windowController = new WindowController(this._tracker, {
            settings: this._settings,
            spreadAppWindows: app =>
                this._overviewIntegration.showAppWindows(app),
            getMonitor: () => Main.layoutManager.primaryMonitor,
        });
        this._taskbarController = new TaskbarController({
            settings: this._settings,
            appSystem: this._appSystem,
            tracker: this._tracker,
            favorites: this._favorites,
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
        this._taskbarController.setAlignmentActor(Main.panel._centerBox);
        this._windowPreviews = new WindowPreviewController(
            () => this._taskbarController.getItems(),
            app => this._windowController.getInterestingWindows(app),
            this._settings
        );
        this._taskbarController.setPreviewController(this._windowPreviews);
        this._windowController.setTaskbarController(this._taskbarController);
        this._windowController.setPreviewController(this._windowPreviews);
        this._startButtonController = new StartButtonController({
            extensionDir: this.dir,
            settings: this._settings,
            iconSize: this._iconSize,
            previewController: this._windowPreviews,
            openPreferences: () => this.openPreferences(),
            toggleFromShortcut: () => this._toggleStartMenuAtPointer(),
        });

        this._createTaskbarActors();
        this._folderMenuController = new FolderMenuController(this._settings);
        this._folderMenuController.enable();
        this._panelController = new PanelController({
            settings: this._settings,
            panelHeight: this._panelHeight,
            startButton: this._startButtonController.actor,
            taskbarBin: this._taskbarBin,
            taskbarActor: this._taskbarController.actor,
            showDesktopButton: this._showDesktopButton,
            folderMenuButton: this._folderMenuController.actor,
            onAppAlignmentChanged: () => this._applyTaskbarAppearance(),
            onTaskbarAvailableWidthChanged: width =>
                this._taskbarController.setAvailableWidth(width),
            queueOverviewRelayout: () =>
                this._overviewIntegration.queueRelayout(),
            isAutoHideBlocked: () => this._panelAutoHideIsBlocked(),
        });
        this._panelInteractionController = new PanelInteractionController({
            settings: this._settings,
            taskbarController: this._taskbarController,
            taskbarBin: this._taskbarBin,
            previewController: this._windowPreviews,
            openPreferences: () => this.openPreferences(),
        });
        this._panelController.enable();
        this._panelInteractionController.enable();
        this._startButtonController.enable();
        this._multiMonitorController = new MultiMonitorController({
            extensionDir: this.dir,
            settings: this._settings,
            appSystem: this._appSystem,
            tracker: this._tracker,
            favorites: this._favorites,
            spreadAppWindows: app =>
                this._overviewIntegration.showAppWindows(app),
            openPreferences: () => this.openPreferences(),
        });
        this._multiMonitorController.enable();
        this._hotEdgeController = new HotEdgeController(this._settings, {
            isBlocked: () => this._panelAutoHideIsBlocked(),
        });
        this._hotEdgeController.enable();
        this._applyTaskbarAppearance();
        this._overviewIntegration.enable();
        this._connectSignals();
        this._startButtonController.syncKeybindings();
        this._panelController.position();
        this._taskbarController.enable();
    }

    disable() {
        this._settings.disconnectObject(this);
        this._showDesktopButton.disconnectObject(this);

        this._hotEdgeController.destroy();
        this._hotEdgeController = null;
        this._extensionConflictController.destroy();
        this._extensionConflictController = null;
        this._notificationBannerController.destroy();
        this._notificationBannerController = null;
        this._multiMonitorController.destroy();
        this._multiMonitorController = null;
        this._panelInteractionController.destroy();
        this._panelInteractionController = null;
        this._panelController.destroy();
        this._panelController = null;
        this._folderMenuController.destroy();
        this._folderMenuController = null;
        this._favoritesIntegration.destroy();
        this._favoritesIntegration = null;
        this._startButtonController.destroy();
        this._startButtonController = null;
        this._windowController.destroy();
        this._taskbarController.destroy();
        this._windowPreviews.destroy();
        this._windowPreviews = null;
        this._taskbarController = null;
        this._windowController = null;
        this._taskbarBin.destroy();
        this._showDesktopButton.destroy();
        this._overviewIntegration.destroy();
        this._overviewIntegration = null;

        this._taskbarBin = null;
        this._showDesktopButton = null;
        this._favorites = null;
        this._tracker = null;
        this._appSystem = null;
        this._settings = null;
        this._panelHeight = 44;
    }

    _createTaskbarActors() {
        this._taskbarBin = new St.ScrollView({
            style_class: 'simple-taskbar-bin',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            enable_mouse_scrolling: true,
            clip_to_allocation: true,
            x_expand: true,
            y_expand: true,
            visible: !this._settings.get_boolean('default-gnome-panel'),
        });
        this._taskbarBin.add_child(this._taskbarController.actor);

        this._showDesktopButton = new St.Button({
            style_class: 'panel-button simple-taskbar-show-desktop',
            reactive: true,
            can_focus: true,
            track_hover: true,
            toggle_mode: true,
            accessible_name: _('Show desktop'),
        });
        this._windowController.setShowDesktopButton(this._showDesktopButton);
        this._showDesktopButton.connectObject(
            'clicked',
            () => this._windowController.toggleDesktop(),
            this
        );
    }

    _connectSignals() {
        this._settings.connectObject('changed::icon-size', () => {
            this._iconSize = this._settings.get_int('icon-size');
            const minimumPanelHeight =
                this._iconSize + ICON_VERTICAL_RESERVE;
            if (!this._settings.get_boolean('default-gnome-panel') &&
                this._settings.get_int('panel-height') < minimumPanelHeight) {
                this._settings.set_int('panel-height', minimumPanelHeight);
            }
            this._startButtonController.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._taskbarController.setIconSize(this._iconSize);
            this._panelController.updateTaskbarWidth();
        }, this);
        this._settings.connectObject('changed::icon-spacing', () => {
            this._applyTaskbarAppearance();
        }, this);
        this._settings.connectObject('changed::default-gnome-panel', () => {
            this._syncTaskbarVisibility();
        }, this);
        this._settings.connectObject(
            'changed::multi-window-click-spread',
            () => {
                if (!this._settings.get_boolean(
                    'multi-window-click-spread'
                )) {
                    this._overviewIntegration.cancelAppSpread();
                }
            },
            this
        );
        this._settings.connectObject('changed::panel-height', () => {
            this._panelHeight = this._settings.get_int('panel-height');
            const maximumIconSize =
                this._panelHeight - ICON_VERTICAL_RESERVE;
            if (!this._settings.get_boolean('default-gnome-panel') &&
                this._settings.get_int('icon-size') > maximumIconSize) {
                this._settings.set_int('icon-size', maximumIconSize);
            }
            this._taskbarController.setPanelHeight(this._panelHeight);
            this._overviewIntegration.setPanelHeight(this._panelHeight);
            this._panelController.setPanelHeight(this._panelHeight);
        }, this);
        this._settings.connectObject('changed::start-button-padding', () => {
            this._startButtonController.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._panelController.updateTaskbarWidth();
        }, this);
        this._settings.connectObject('changed::panel-position', () => {
            this._overviewIntegration.syncPanelPosition();
        }, this);
    }

    _applyTaskbarAppearance() {
        const spacing = this._settings.get_int('icon-spacing');
        const centered = this._panelController.appsAreCentered();
        this._startButtonController.applyAppearance(
            this._iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._taskbarController.applyAppearance(spacing, centered);
        this._panelController.updateTaskbarWidth();
    }

    _syncTaskbarVisibility() {
        const visible = !this._settings.get_boolean('default-gnome-panel');
        this._taskbarBin.visible = visible;
        if (!visible) {
            this._windowPreviews.hideTooltip(false);
            this._windowPreviews.hide();
            this._overviewIntegration.cancelAppSpread();
        }
        this._panelController.applyLayout();
        this._panelController.updateTaskbarWidth();
    }

    _panelAutoHideIsBlocked() {
        return Boolean(
            this._panelInteractionController.menuIsOpen ||
            this._startButtonController.menuIsOpen ||
            this._folderMenuController.menuIsOpen ||
            this._windowPreviews.isOpen ||
            this._taskbarController.isDragging ||
            this._taskbarController.hasOpenMenu() ||
            Main.panel.menuManager.activeMenu?.isOpen
        );
    }

    _toggleStartMenuAtPointer() {
        const [x, y] = global.get_pointer();
        if (this._multiMonitorController.hasPanelAt(x, y)) {
            this._startButtonController.closeMenus();
            this._multiMonitorController.toggleStartMenuAt(x, y);
            return;
        }

        this._multiMonitorController.closeStartMenus();
        this._startButtonController.toggleStartMenu();
    }

}
