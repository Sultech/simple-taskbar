// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    Extension,
    gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ExtensionConflictController} from './extensionConflictController.js';
import {
    ApplicationOverflowController,
} from './applicationOverflowController.js';
import {FolderMenuController} from './folderMenuController.js';
import {TrayOverflowController} from './trayOverflowController.js';
import {FavoritesIntegration} from './favoritesIntegration.js';
import {GridAltTabController} from './gridAltTabController.js';
import {HotEdgeController} from './hotEdgeController.js';
import {restoreOverlayKey} from './keybindingRecovery.js';
import {PanelController} from './panelController.js';
import {PanelInteractionController} from './panelInteractionController.js';
import {MultiMonitorController} from './multiMonitorController.js';
import {NotificationBannerController} from './notificationBannerController.js';
import {
    QuickSettingsPowerController,
} from './quickSettingsPowerController.js';
import {
    QuickSettingsXpIconController,
} from './quickSettingsXpIconController.js';
import {StartButtonController} from './startButtonController.js';
import {
    SwitcherKeybindingRouter,
} from './switcherKeybindingRouter.js';
import {TaskbarController} from './taskbarController.js';
import {TaskbarViewport} from './taskbarViewport.js';
import {VolumeMixerController} from './volumeMixerController.js';
import {WindowController} from './windowController.js';
import {WindowPreviewController} from './windowPreviewController.js';
import {OverviewIntegration} from './overviewIntegration.js';
import {
    ICON_VERTICAL_RESERVE,
    STANDARD_MIN_PANEL_HEIGHT,
} from './panelSizing.js';
import {
    applyDefaultTaskbarSettings,
    applyWindowsXpThemeAppearance,
    applyWindowsXpThemeSettings,
    WINDOWS_XP_ICON_SPACING,
    WINDOWS_XP_ICON_SIZE,
    WINDOWS_XP_PANEL_HEIGHT,
} from './windowsXpTheme.js';

export default class SimpleTaskbarExtension extends Extension {
    enable() {
        this._appSystem = Shell.AppSystem.get_default();
        this._tracker = Shell.WindowTracker.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._settings = this.getSettings();
        restoreOverlayKey(this._settings);
        this._switcherKeybindings = new SwitcherKeybindingRouter();
        this._extensionConflictController =
            new ExtensionConflictController(this._settings);
        this._extensionConflictController.enable();
        this._favoritesIntegration = new FavoritesIntegration(this._settings);
        this._favoritesIntegration.enable();
        this._notificationBannerController =
            new NotificationBannerController(this._settings);
        this._notificationBannerController.enable();
        this._syncWindowsXpTheme(false);
        this._iconSize = this._settings.get_int('icon-size');
        this._panelHeight = this._settings.get_int('panel-height');
        if (!this._settings.get_boolean('default-gnome-panel') &&
            !this._settings.get_boolean('windows-xp-theme-enabled') &&
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
            onShowDesktopClicked: () =>
                this._windowController.toggleDesktop(),
            onShowDesktopModeChanged: () => {
                if (this._panelController)
                    this._panelController.applyLayout();
            },
        });
        this._taskbarController.setAlignmentActor(Main.panel._centerBox);
        this._windowPreviews = new WindowPreviewController(
            () => this._taskbarController.getItems(),
            app => this._windowController.getInterestingWindows(app),
            this._settings,
            () => this._applicationOverflowController.closeWithAnimation()
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
            closeApp: (app, timestamp) =>
                this._taskbarController.closeApp(app, timestamp),
            getInterestingWindows: app =>
                this._windowController.getInterestingWindows(app),
            toggleFromShortcut: () => this._toggleStartMenuAtPointer(),
            switcherKeybindings: this._switcherKeybindings,
            onMenuOpenStateChanged: open => {
                this._taskbarController.setStartMenuOpen(open);
                this._panelController?.setStartMenuOpen(open);
                if (open) {
                    this._applicationOverflowController.close();
                    this._trayOverflowController?.close();
                }
            },
        });

        this._createTaskbarActors();
        this._folderMenuController = new FolderMenuController(this._settings);
        this._folderMenuController.enable();
        this._trayOverflowController = new TrayOverflowController(
            this._settings
        );
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
            taskbarBin: this._taskbarViewport,
            taskbarContainer: this._taskbarBin,
            previewController: this._windowPreviews,
            openPreferences: () => this.openPreferences(),
        });
        this._applicationOverflowController.enable();
        this._panelController.enable();
        this._trayOverflowController.enable();
        this._panelController.applyLayout();
        this._taskbarController.setShowDesktopButton(
            this._showDesktopButton,
            button => this._replaceShowDesktopButton(button)
        );
        this._panelInteractionController.enable();
        this._startButtonController.enable();
        this._volumeMixerController = new VolumeMixerController(
            this._settings,
            Main.panel.statusArea.quickSettings
        );
        this._volumeMixerController.enable();
        this._quickSettingsPowerController =
            new QuickSettingsPowerController(
                this._settings,
                Main.panel.statusArea.quickSettings
            );
        this._quickSettingsPowerController.enable();
        this._quickSettingsXpIconController =
            new QuickSettingsXpIconController(
                this._settings,
                this.dir,
                Main.panel.statusArea.quickSettings
            );
        this._quickSettingsXpIconController.enable();
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
            isBlocked: () => this._hotEdgeIsBlocked(),
        });
        this._hotEdgeController.enable();
        this._gridAltTabController =
            new GridAltTabController(
                this._settings,
                this._switcherKeybindings
            );
        this._gridAltTabController.enable();
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

        this._gridAltTabController.destroy();
        this._gridAltTabController = null;
        this._hotEdgeController.destroy();
        this._hotEdgeController = null;
        this._extensionConflictController.destroy();
        this._extensionConflictController = null;
        this._notificationBannerController.destroy();
        this._notificationBannerController = null;
        this._multiMonitorController.destroy();
        this._multiMonitorController = null;
        this._quickSettingsXpIconController.destroy();
        this._quickSettingsXpIconController = null;
        this._quickSettingsPowerController.destroy();
        this._quickSettingsPowerController = null;
        this._volumeMixerController.destroy();
        this._volumeMixerController = null;
        this._panelInteractionController.destroy();
        this._panelInteractionController = null;
        this._trayOverflowController.destroy();
        this._trayOverflowController = null;
        this._panelController.destroy();
        this._panelController = null;
        this._applicationOverflowController.destroy();
        this._applicationOverflowController = null;
        this._folderMenuController.destroy();
        this._folderMenuController = null;
        this._favoritesIntegration.destroy();
        this._favoritesIntegration = null;
        this._startButtonController.destroy();
        this._startButtonController = null;
        this._switcherKeybindings.destroy();
        this._switcherKeybindings = null;
        this._windowController.destroy();
        this._taskbarController.destroy();
        this._windowPreviews.destroy();
        this._windowPreviews = null;
        this._taskbarController = null;
        this._windowController = null;
        this._taskbarViewport.destroy();
        this._showDesktopButton.child = null;
        this._showDesktopVisual.destroy();
        this._showDesktopVisual = null;
        this._showDesktopIcon = null;
        this._showDesktopButton.destroy();
        this._overviewIntegration.destroy();
        this._overviewIntegration = null;

        this._taskbarBin = null;
        this._taskbarViewport = null;
        this._showDesktopButton = null;
        this._favorites = null;
        this._tracker = null;
        this._appSystem = null;
        this._settings = null;
        this._panelHeight = null;
    }

    _createTaskbarActors() {
        this._taskbarViewport = new TaskbarViewport({
            style_class: 'simple-taskbar-bin',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            enable_mouse_scrolling: true,
            clip_to_allocation: true,
            x_expand: false,
            y_expand: true,
        });
        this._taskbarViewport.add_child(this._taskbarController.actor);
        this._applicationOverflowController =
            new ApplicationOverflowController({
                settings: this._settings,
                taskbarController: this._taskbarController,
                previewController: this._windowPreviews,
                viewport: this._taskbarViewport,
            });
        this._taskbarBin = this._applicationOverflowController.actor;
        this._taskbarBin.visible =
            !this._settings.get_boolean('default-gnome-panel');

        this._createShowDesktopButton();
    }

    _createShowDesktopButton() {
        this._showDesktopIcon = new St.Icon({
            gicon: new Gio.FileIcon({
                file: this.dir
                    .get_child('icons')
                    .get_child('taskbar')
                    .get_child('xp')
                    .get_child('desktop.png'),
            }),
            icon_size: 16,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._showDesktopIcon.translation_y = 1;
        const showDesktopGlass = new St.Widget({
            style_class: 'simple-taskbar-show-desktop-glass',
            x: 2,
            y: 5,
            width: 26,
            height: 21,
        });
        const showDesktopTexture = new St.Widget({
            style_class: 'simple-taskbar-show-desktop-texture',
            x: 2,
            y: 5,
            width: 26,
            height: 21,
        });
        showDesktopTexture.set_style(
            'background-size: 26px 21px;'
        );
        const showDesktopBorder = new St.Widget({
            style_class: 'simple-taskbar-show-desktop-border',
            x: 0,
            y: 3,
            width: 30,
            height: 25,
        });
        const showDesktopIconHost = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x: 0,
            y: 0,
            width: 30,
            height: WINDOWS_XP_PANEL_HEIGHT,
        });
        showDesktopIconHost.add_child(this._showDesktopIcon);
        this._showDesktopVisual = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: 30,
            height: WINDOWS_XP_PANEL_HEIGHT,
            clip_to_allocation: false,
        });
        this._showDesktopVisual.add_child(showDesktopGlass);
        this._showDesktopVisual.add_child(showDesktopTexture);
        this._showDesktopVisual.add_child(showDesktopBorder);
        this._showDesktopVisual.add_child(showDesktopIconHost);
        this._showDesktopButton = new St.Button({
            style_class: 'panel-button simple-taskbar-show-desktop',
            reactive: true,
            can_focus: true,
            track_hover: true,
            toggle_mode: true,
            accessible_name: _('Show desktop'),
        });
        this._syncShowDesktopIcon();
        this._windowController.setShowDesktopButton(this._showDesktopButton);
        this._showDesktopButton.connectObject(
            'clicked',
            () => this._windowController.toggleDesktop(),
            this
        );
    }

    _replaceShowDesktopButton(button) {
        const checked = button.checked;
        button.disconnectObject(this);
        button.child = null;
        this._showDesktopVisual.destroy();
        button.destroy();

        this._createShowDesktopButton();
        this._showDesktopButton.checked = checked;
        this._panelController.setShowDesktopButton(this._showDesktopButton);
        return this._showDesktopButton;
    }

    _syncWindowsXpTheme(modeChanged) {
        if (!this._settings.get_boolean('windows-xp-theme-enabled')) {
            if (modeChanged &&
                !this._settings.get_boolean('default-gnome-panel')) {
                this._settings.set_boolean(
                    'activities-button-visible',
                    true
                );
                applyDefaultTaskbarSettings(this._settings);
                return;
            }
            if (!this._settings.get_boolean('default-gnome-panel')) {
                const minimumPanelHeight =
                    this._settings.get_int('icon-size') +
                    ICON_VERTICAL_RESERVE;
                if (this._settings.get_int('panel-height') <
                    minimumPanelHeight) {
                    this._settings.set_int(
                        'panel-height',
                        minimumPanelHeight
                    );
                }
            }
            return;
        }

        if (this._settings.get_boolean('default-gnome-panel'))
            this._settings.set_boolean('default-gnome-panel', false);
        if (modeChanged) {
            this._settings.set_boolean(
                'activities-button-visible',
                false
            );
        }
        applyWindowsXpThemeAppearance(this._settings);
        applyWindowsXpThemeSettings(this._settings);
    }

    _syncShowDesktopIcon() {
        this._showDesktopButton.child =
            this._settings.get_boolean('windows-xp-theme-enabled')
                ? this._showDesktopVisual
                : null;
    }

    _connectSignals() {
        this._settings.connectObject('changed::icon-size', () => {
            this._iconSize = this._settings.get_int('icon-size');
            if (this._settings.get_boolean('windows-xp-theme-enabled') &&
                this._iconSize !== WINDOWS_XP_ICON_SIZE) {
                this._settings.set_int(
                    'icon-size',
                    WINDOWS_XP_ICON_SIZE
                );
                return;
            }
            const minimumPanelHeight =
                this._iconSize + ICON_VERTICAL_RESERVE;
            if (!this._settings.get_boolean('default-gnome-panel') &&
                !this._settings.get_boolean('windows-xp-theme-enabled') &&
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
            const windowsXpThemeEnabled = this._settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            const iconSpacing = this._settings.get_int('icon-spacing');
            if (windowsXpThemeEnabled &&
                iconSpacing !== WINDOWS_XP_ICON_SPACING) {
                this._settings.set_int(
                    'icon-spacing',
                    WINDOWS_XP_ICON_SPACING
                );
                return;
            }
            if (!windowsXpThemeEnabled && iconSpacing < 0) {
                this._settings.set_int('icon-spacing', 0);
                return;
            }
            this._applyTaskbarAppearance();
        }, this);
        this._settings.connectObject('changed::default-gnome-panel', () => {
            if (this._settings.get_boolean('windows-xp-theme-enabled') &&
                this._settings.get_boolean('default-gnome-panel')) {
                applyWindowsXpThemeSettings(this._settings);
                this._settings.set_boolean('default-gnome-panel', false);
                return;
            }
            this._syncTaskbarVisibility();
        }, this);
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => {
                this._syncWindowsXpTheme(true);
                this._syncShowDesktopIcon();
                this._startButtonController.applyAppearance(
                    this._iconSize,
                    this._settings.get_int('start-button-padding')
                );
                this._panelController.updateTaskbarWidth();
            },
            this
        );
        for (const key of [
            'panel-button-padding',
            'app-alignment',
            'start-button-position',
            'use-pinned-apps-as-launchers',
            'combine-app-buttons-mode',
            'application-overflow-enabled',
            'hide-app-labels',
            'custom-indicator-colors-enabled',
            'custom-panel-color-enabled',
            'activities-button-position',
            'panel-border-enabled',
            'panel-border-light-enabled',
            'panel-position',
            'clock-position',
            'system-menu-position',
            'start-menu-super-key',
            'show-desktop-button-position',
            'show-desktop-button-visible',
            'windows-start-menu-enabled',
            'panel-item-order',
        ]) {
            this._settings.connectObject(`changed::${key}`, () => {
                if (this._settings.get_boolean(
                    'windows-xp-theme-enabled'
                )) {
                    applyWindowsXpThemeSettings(this._settings);
                }
            }, this);
        }
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
            const windowsXpThemeEnabled = this._settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            if (windowsXpThemeEnabled &&
                this._panelHeight !== WINDOWS_XP_PANEL_HEIGHT) {
                this._settings.set_int(
                    'panel-height',
                    WINDOWS_XP_PANEL_HEIGHT
                );
                return;
            }
            if (!windowsXpThemeEnabled &&
                !this._settings.get_boolean('default-gnome-panel') &&
                this._panelHeight < STANDARD_MIN_PANEL_HEIGHT) {
                this._settings.set_int(
                    'panel-height',
                    STANDARD_MIN_PANEL_HEIGHT
                );
                return;
            }
            const maximumIconSize =
                this._panelHeight - ICON_VERTICAL_RESERVE;
            if (!windowsXpThemeEnabled &&
                !this._settings.get_boolean('default-gnome-panel') &&
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
        this._startButtonController.applyAppearance(
            this._iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._taskbarController.applyAppearance();
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
        return this._panelInteractionIsBlocked(true);
    }

    _hotEdgeIsBlocked() {
        return this._panelInteractionIsBlocked(false);
    }

    _panelInteractionIsBlocked(includeWindowPreviews) {
        return Boolean(
            this._panelInteractionController.menuIsOpen ||
            this._startButtonController.menuIsOpen ||
            this._folderMenuController.menuIsOpen ||
            this._trayOverflowController.menuIsOpen ||
            this._applicationOverflowController.menuIsOpen ||
            (includeWindowPreviews && this._windowPreviews.isOpen) ||
            this._taskbarController.isDragging ||
            this._taskbarController.hasOpenMenu() ||
            Main.panel.menuManager.activeMenu?.isOpen
        );
    }

    _toggleStartMenuAtPointer() {
        Main.panel.menuManager.activeMenu?.close();
        this._multiMonitorController.closePanelMenus();

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
