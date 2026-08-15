// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ExtensionConflictController} from './src/integration/extensionConflictController.js';
import {
    ApplicationOverflowController,
} from './src/overflow/applicationOverflowController.js';
import {FolderMenuController} from './src/folderMenuController.js';
import {TrayOverflowController} from './src/overflow/trayOverflowController.js';
import {FavoritesIntegration} from './src/integration/favoritesIntegration.js';
import {GridAltTabController} from './src/windowSwitching/gridAltTabController.js';
import {HotEdgeController} from './src/hotEdgeController.js';
import {restoreOverlayKey} from './src/keybindingRecovery.js';
import {PanelController} from './src/panel/panelController.js';
import {PanelInteractionController} from './src/panel/panelInteractionController.js';
import {SecondaryPanelManager} from './src/secondaryPanel/secondaryPanelManager.js';
import {NotificationBannerController} from './src/integration/notificationBannerController.js';
import {
    QuickSettingsPowerController,
} from './src/integration/quickSettingsPowerController.js';
import {
    QuickSettingsXpIconController,
} from './src/integration/quickSettingsXpIconController.js';
import {
    ShowDesktopButtonController,
} from './src/taskbar/showDesktopButtonController.js';
import {StartButtonController} from './src/startMenu/startButtonController.js';
import {
    SwitcherKeybindingRouter,
} from './src/windowSwitching/switcherKeybindingRouter.js';
import {TaskbarController} from './src/taskbar/taskbarController.js';
import {TaskbarViewport} from './src/taskbar/taskbarViewport.js';
import {VolumeMixerController} from './src/integration/volumeMixerController.js';
import {WindowController} from './src/taskbar/windowController.js';
import {WindowPreviewController} from './src/taskbar/windowPreviewController.js';
import {OverviewIntegration} from './src/integration/overviewIntegration.js';
import {ICON_VERTICAL_RESERVE} from './src/shared/panelSizing.js';
import {WindowsXpModeController} from './src/windowsXpModeController.js';

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
        this._windowsXpModeController = new WindowsXpModeController(
            this._settings,
            {
                onDefaultPanelChanged: () => this._syncTaskbarVisibility(),
                onIconSizeChanged: iconSize => {
                    this._iconSize = iconSize;
                    this._startButtonController.applyAppearance(
                        this._iconSize,
                        this._settings.get_int('start-button-padding')
                    );
                    this._taskbarController.setIconSize(this._iconSize);
                    this._panelController.updateTaskbarWidth();
                },
                onIconSpacingChanged: () => this._applyTaskbarAppearance(),
                onModeChanged: () => {
                    this._applicationOverflowController.clearOverflow();
                    this._startButtonController.applyAppearance(
                        this._iconSize,
                        this._settings.get_int('start-button-padding')
                    );
                    this._panelController.updateTaskbarWidth();
                },
                onPanelHeightChanged: panelHeight => {
                    this._panelHeight = panelHeight;
                    this._taskbarController.setPanelHeight(this._panelHeight);
                    this._overviewIntegration.setPanelHeight(this._panelHeight);
                    this._panelController.setPanelHeight(this._panelHeight);
                },
            }
        );
        this._windowsXpModeController.applyInitialSettings();
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
            getTaskbarController: () => this._taskbarController,
            getPreviewController: () => this._windowPreviews,
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
            onShowDesktopModeChanged: () =>
                this._panelController.applyLayout(),
            getPreviewController: () => this._windowPreviews,
        });
        this._taskbarController.setAlignmentActor(Main.panel._centerBox);
        this._windowPreviews = new WindowPreviewController(
            () => this._taskbarController.getItems(),
            app => this._windowController.getInterestingWindows(app),
            this._settings,
            () => this._applicationOverflowController.closeWithAnimation()
        );
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
                this._panelController.setStartMenuOpen(open);
                if (open) {
                    this._applicationOverflowController.close();
                    this._trayOverflowController.close();
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
            button => this._showDesktopButtonController.replace(button)
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
        this._secondaryPanelManager = new SecondaryPanelManager({
            extensionDir: this.dir,
            settings: this._settings,
            appSystem: this._appSystem,
            tracker: this._tracker,
            favorites: this._favorites,
            spreadAppWindows: app =>
                this._overviewIntegration.showAppWindows(app),
            openPreferences: () => this.openPreferences(),
        });
        this._secondaryPanelManager.enable();
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
        this._windowsXpModeController.enable();
        this._connectSignals();
        this._startButtonController.syncKeybindings();
        this._panelController.position();
        this._taskbarController.enable();
    }

    disable() {
        this._settings.disconnectObject(this);
        this._windowsXpModeController.destroy();
        this._windowsXpModeController = null;

        this._gridAltTabController.destroy();
        this._gridAltTabController = null;
        this._hotEdgeController.destroy();
        this._hotEdgeController = null;
        this._extensionConflictController.destroy();
        this._extensionConflictController = null;
        this._notificationBannerController.destroy();
        this._notificationBannerController = null;
        this._secondaryPanelManager.destroy();
        this._secondaryPanelManager = null;
        this._quickSettingsXpIconController.destroy();
        this._quickSettingsXpIconController = null;
        this._quickSettingsPowerController.destroy();
        this._quickSettingsPowerController = null;
        this._volumeMixerController.destroy();
        this._volumeMixerController = null;
        this._panelInteractionController.destroy();
        this._panelInteractionController = null;
        this._panelController.destroy();
        this._panelController = null;
        this._trayOverflowController.destroy();
        this._trayOverflowController = null;
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
        this._showDesktopButtonController.destroy();
        this._showDesktopButtonController = null;
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

    openPreferences() {
        const prefsWindow = global.get_window_actors()
            .map(windowActor => windowActor.meta_window)
            .find(window => window.wm_class === 'org.gnome.Shell.Extensions');
        if (!prefsWindow) {
            super.openPreferences();
            return;
        }

        if (prefsWindow.title === this.metadata.name) {
            Main.activateWindow(prefsWindow);
            return;
        }

        prefsWindow.connectObject('unmanaged', () => {
            super.openPreferences();
            prefsWindow.disconnectObject(this);
        }, this);
        prefsWindow.delete(global.get_current_time());
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

        this._showDesktopButtonController =
            new ShowDesktopButtonController(
                this._settings,
                this.dir,
                () => this._windowController.toggleDesktop(),
                button => {
                    this._showDesktopButton = button;
                    this._windowController.setShowDesktopButton(button);
                    this._panelController.setShowDesktopButton(button);
                }
            );
        this._showDesktopButtonController.enable();
        this._showDesktopButton = this._showDesktopButtonController.actor;
        this._windowController.setShowDesktopButton(this._showDesktopButton);
    }

    _connectSignals() {
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
        this._secondaryPanelManager.closePanelMenus();

        const [x, y] = global.get_pointer();
        if (this._secondaryPanelManager.hasPanelAt(x, y)) {
            this._startButtonController.closeMenus();
            this._secondaryPanelManager.toggleStartMenuAt(x, y);
            return;
        }

        this._secondaryPanelManager.closeStartMenus();
        this._startButtonController.toggleStartMenu();
    }

}
