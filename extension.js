// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {cachedPanelApplicationSettings} from './src/shared/defaultPanelWindowSettings.js';
import {panelApplicationsEnabled} from './src/shared/panelApplicationVisibility.js';
import {taskbarPanelHeight} from './src/shared/panelSizing.js';
import {createRoutedSettings} from './src/shared/routedSettings.js';

import {ExtensionConflictController} from './src/integration/extensionConflictController.js';
import {FolderMenuController} from './src/panel/folderMenuController.js';
import {TrayOverflowController} from './src/overflow/trayOverflowController.js';
import {FavoritesIntegration} from './src/integration/favoritesIntegration.js';
import {GridAltTabController} from './src/windowSwitching/gridAltTabController.js';
import {HotEdgeController} from './src/integration/hotEdgeController.js';
import {restoreOverlayKey} from './src/startMenu/overlayKeyRecovery.js';
import {PrimaryPanelController} from './src/panel/primaryPanelController.js';
import {SecondaryPanelManager} from './src/secondaryPanel/secondaryPanelManager.js';
import {DockPanelManager} from './src/dock/dockPanelManager.js';
import {NotificationBannerController} from './src/integration/notificationBannerController.js';
import {QuickSettingsIntegrations} from './src/integration/quickSettingsIntegrations.js';
import {
    ShowDesktopButtonController,
} from './src/panel/showDesktopButtonController.js';
import {
    SwitcherKeybindingRouter,
} from './src/windowSwitching/switcherKeybindingRouter.js';
import {
    ApplicationKeybindingRouter,
} from './src/windowSwitching/applicationKeybindingRouter.js';
import {panelIconSizeIsAdaptive, panelTaskbarIconSize} from './src/panel/panelIconSizer.js';
import {PanelTaskbarCore} from './src/panel/panelTaskbarCore.js';
import {dynamicTaskbarEnabled, startButtonInPanel} from './src/shared/panelModeSettings.js';
import {
    TaskbarOverlayModel,
} from './src/taskbar/taskbarOverlayModel.js';
import {
    WindowMinimizeEffectController,
} from './src/taskbar/windowMinimizeEffectController.js';
import {OverviewIntegration} from './src/integration/overviewIntegration.js';
import {AppGridLayout} from './src/integration/appGridLayout.js';
import {hidePanelBlur, resetPanelBlur} from './src/integration/blurMyShellRuntime.js';
import {
    clearInterruptedProfileTransition,
    synchronizePanelPosition,
} from './src/shared/panelModeProfiles.js';
import {PanelModeController} from './src/panel/panelModeController.js';
import {connectPanelSizingSignals} from './src/panel/panelSettingsSignals.js';
import {WindowsXpThemeController} from './src/panel/windowsXpThemeController.js';
import {Windows10ThemeController} from './src/panel/windows10ThemeController.js';
import {CLICK_ACTION} from './src/shared/interactionActions.js';

export default class SimpleTaskbarExtension extends Extension {
    enable() {
        this._rebuildId = 0;
        this._appSystem = Shell.AppSystem.get_default();
        this._tracker = Shell.WindowTracker.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._settings = createRoutedSettings(this.getSettings(),
            this.getSettings(`${this.metadata['settings-schema']}.legacy`));
        restoreOverlayKey(this._settings);
        clearInterruptedProfileTransition(this._settings);
        this._switcherKeybindings = new SwitcherKeybindingRouter();
        this._extensionConflictController =
            new ExtensionConflictController(this._settings);
        this._extensionConflictController.enable();
        this._overlayModel = new TaskbarOverlayModel();
        this._favoritesIntegration = new FavoritesIntegration(this._settings);
        this._favoritesIntegration.enable();
        this._notificationBannerController =
            new NotificationBannerController(this._settings);
        this._notificationBannerController.enable();
        this._windowsXpThemeController = new WindowsXpThemeController(this._settings);
        this._panelModeController = new PanelModeController(this._settings, this._windowsXpThemeController, {
            onDefaultPanelChanged: () => this._queueRebuild(),
            onWindowsXpModeChanged: () => {
                this._core.iconSizer.reset();
                this._core.overflowController.clearOverflow();
                this._primaryPanelController.syncVerticalItems();
                this._primaryPanelController.refreshPanelItemSizes();
                this._primaryPanelController.updateTaskbarWidth();
            },
        });
        this._panelModeController.applyInitialSettings();
        this._applicationSettings = cachedPanelApplicationSettings(this._settings);
        const maximumIconSize = this._applicationSettings.get_int('icon-size');
        const iconSize = panelTaskbarIconSize(this._applicationSettings, maximumIconSize);
        this._panelHeight = taskbarPanelHeight(this._settings, iconSize);
        this._overviewIntegration = new OverviewIntegration(
            this._panelHeight,
            this._settings
        );
        this._appGridLayout = new AppGridLayout(this._settings);
        this._core = new PanelTaskbarCore({
            extensionDir: this.dir,
            settings: this._applicationSettings,
            appSystem: this._appSystem,
            tracker: this._tracker,
            favorites: this._favorites,
            overlayModel: this._overlayModel,
            spreadAppWindows: app => this._overviewIntegration.showAppWindows(app),
            openPreferences: () => this.openPreferences(),
            getMonitor: () => Main.layoutManager.primaryMonitor,
            getPositionActor: () => Main.layoutManager.panelBox,
            boxes: [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox],
            getPanelEdgeGap: () => this._primaryPanelController.getPanelEdgeGap(),
            panelHeight: this._panelHeight,
            iconSize,
            maximumIconSize,
            getConfiguredIconSize: () => this._applicationSettings.get_int('icon-size'),
            isAdaptive: () => panelIconSizeIsAdaptive(this._settings, this._core.taskbarController),
            syncVerticalItems: () => this._primaryPanelController.syncVerticalItems(),
            syncPanelHeight: () => this._syncPanelHeight(),
            isPanelMenuOpen: () => this._folderMenuController.menuIsOpen ||
                this._trayOverflowController.menuIsOpen ||
                Main.panel.menuManager.activeMenu?.isOpen,
            isAutoHideHidden: () => this._primaryPanelController.autoHideHidden,
            onHoverAnimationReserveChanged: () => this._primaryPanelController.onHoverAnimationReserveChanged(),
            onHoverAnimationExtentsChanged: (before, after) =>
                this._primaryPanelController.onHoverAnimationExtentsChanged(before, after),
            onRedisplay: () => this._primaryPanelController.updateTaskbarWidth(),
            onStartMenuOpenChanged: open => {
                this._primaryPanelController.setStartMenuOpen(open);
                if (open)
                    this._trayOverflowController.close();
            },
            taskbarOptions: {
                getHoverAnimationEdgeActor: () =>
                    dynamicTaskbarEnabled(this._settings) ? this._showDesktopButton : null,
                onShowDesktopClicked: () => this._core.windowController.toggleDesktop(),
                onShowDesktopModeChanged: () => this._primaryPanelController.applyLayout(),
                isSecondary: false,
            },
            startButtonOptions: {
                keybindingSettings: this._settings,
                toggleFromShortcut: () => this._toggleStartMenuAtPointer(),
                switcherKeybindings: this._switcherKeybindings,
            },
        });
        this._applicationKeybindings = new ApplicationKeybindingRouter(
            this._settings,
            app => this._core.windowController.activateApp(app)
        );
        this._applicationKeybindings.enable();
        this._windowMinimizeEffectController =
            new WindowMinimizeEffectController(this._settings);

        this._createShowDesktopButton();
        this._folderMenuController = new FolderMenuController(this._settings);
        this._folderMenuController.enable();
        this._trayOverflowController = new TrayOverflowController(
            this._settings
        );
        this._primaryPanelController = new PrimaryPanelController({
            settings: this._applicationSettings,
            panelHeight: this._panelHeight,
            core: this._core,
            showDesktopButton: this._showDesktopButton,
            setShowDesktopPanelCorner: corner =>
                this._showDesktopButtonController.setPanelCorner(corner),
            folderMenuButton: this._folderMenuController.actor,
            onAppAlignmentChanged: () => this._applyTaskbarAppearance(),
            isTaskbarAdaptive: () =>
                panelApplicationsEnabled(this._settings) &&
                this._core.iconSizer.isShrunk,
            queueOverviewRelayout: () =>
                this._overviewIntegration.queueRelayout(),
            isAutoHideBlocked: () => this._core.isInteractionBlocked(true),
        });
        this._core.createInteractionController({
            getVolumeIndicator: () => Main.panel.statusArea.quickSettings._volumeOutput,
        });
        this._core.overflowController.enable();
        this._trayOverflowController.enable();
        this._core.interactionController.enable();
        this._core.startButtonController.enable();
        this._primaryPanelController.enable();
        this._primaryPanelController.applyLayout();
        this._core.taskbarController.setShowDesktopButton(
            this._showDesktopButton,
            button => this._showDesktopButtonController.replace(button)
        );
        this._quickSettingsIntegrations = new QuickSettingsIntegrations(
            this._settings,
            this.dir,
            Main.panel.statusArea.quickSettings
        );
        this._quickSettingsIntegrations.enable();
        this._secondaryPanelManager = new SecondaryPanelManager({
            extensionDir: this.dir,
            settings: this._settings,
            appSystem: this._appSystem,
            tracker: this._tracker,
            favorites: this._favorites,
            overlayModel: this._overlayModel,
            spreadAppWindows: app =>
                this._overviewIntegration.showAppWindows(app),
            openPreferences: () => this.openPreferences(),
        });
        this._secondaryPanelManager.enable();
        this._dockPanelManager = new DockPanelManager({
            extensionDir: this.dir,
            settings: this._settings,
            appSystem: this._appSystem,
            tracker: this._tracker,
            favorites: this._favorites,
            overlayModel: this._overlayModel,
            spreadAppWindows: app =>
                this._overviewIntegration.showAppWindows(app),
            openPreferences: () => this.openPreferences(),
        });
        this._dockPanelManager.enable();
        this._hotEdgeController = new HotEdgeController(this._settings, {
            isBlocked: () => this._hotEdgeIsBlocked(),
        });
        this._hotEdgeController.enable();
        this._gridAltTabController =
            new GridAltTabController(
                this._settings.mainSettings,
                this._switcherKeybindings
            );
        this._gridAltTabController.enable();
        this._applyTaskbarAppearance();
        this._overviewIntegration.enable();
        this._panelModeController.enable();
        connectPanelSizingSignals({
            settings: this._settings,
            owner: this,
            core: this._core,
            correctSetting: key => this._panelModeController.correctSizingSetting(key),
            applyAppearance: () => {
                this._core.applyAppearance();
                this._primaryPanelController.syncVerticalItems();
            },
            applyPanelHeight: () => this._applyPanelHeight(),
            syncPanelHeight: () => this._syncPanelHeight(),
            updateWidth: () => this._primaryPanelController.updateTaskbarWidth(),
        });
        this._windowsXpThemeController.enable();
        this._windows10ThemeController = new Windows10ThemeController(
            this._settings
        );
        this._windows10ThemeController.enable();
        this._connectSignals();
        this._core.startButtonController.syncKeybindings();
        this._primaryPanelController.position();
        this._core.taskbarController.enable();
        this._windowMinimizeEffectController.enable();
        this._appGridLayout.enable();
    }

    disable() {
        if (this._rebuildId) {
            GLib.Source.remove(this._rebuildId);
            this._rebuildId = 0;
        }
        if (this._closingPrefsWindow) {
            this._closingPrefsWindow.disconnectObject(this);
            this._closingPrefsWindow = null;
        }
        this._settings.disconnectObject(this);
        this._applicationSettings.disconnectObject(this);
        this._appGridLayout.destroy();
        this._appGridLayout = null;
        this._core.taskbarController.disableHoverAnimations();
        this._windows10ThemeController.destroy();
        this._windows10ThemeController = null;
        this._panelModeController.destroy();
        this._panelModeController = null;
        this._windowsXpThemeController.destroy();
        this._windowsXpThemeController = null;

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
        this._dockPanelManager.destroy();
        this._dockPanelManager = null;
        this._quickSettingsIntegrations.destroy();
        this._quickSettingsIntegrations = null;
        this._core.destroyInteractionController();
        this._primaryPanelController.destroy();
        this._primaryPanelController = null;
        this._trayOverflowController.destroy();
        this._trayOverflowController = null;
        this._folderMenuController.destroy();
        this._folderMenuController = null;
        this._favoritesIntegration.destroy();
        this._favoritesIntegration = null;
        this._applicationKeybindings.destroy();
        this._applicationKeybindings = null;
        this._windowMinimizeEffectController.destroy();
        this._windowMinimizeEffectController = null;
        this._core.destroy();
        this._core = null;
        this._switcherKeybindings.destroy();
        this._switcherKeybindings = null;
        this._overlayModel.destroy();
        this._overlayModel = null;
        this._showDesktopButtonController.destroy();
        this._showDesktopButtonController = null;
        this._overviewIntegration.destroy();
        this._overviewIntegration = null;

        this._showDesktopButton = null;
        this._favorites = null;
        this._tracker = null;
        this._appSystem = null;
        this._applicationSettings.destroy();
        this._applicationSettings = null;
        this._settings = null;
        this._panelHeight = null;
    }

    _queueRebuild() {
        if (this._rebuildId)
            return;

        this._rebuildId = GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
            this._rebuildId = 0;
            this.disable();
            this.enable();
            resetPanelBlur();
            return GLib.SOURCE_REMOVE;
        });
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

        this._closingPrefsWindow = prefsWindow;
        prefsWindow.connectObject('unmanaged', () => {
            prefsWindow.disconnectObject(this);
            this._closingPrefsWindow = null;
            super.openPreferences();
        }, this);
        prefsWindow.delete(global.get_current_time());
    }

    _createShowDesktopButton() {
        this._showDesktopButtonController =
            new ShowDesktopButtonController(
                this._settings,
                this.dir,
                () => this._core.windowController.toggleDesktop(),
                button => {
                    this._showDesktopButton = button;
                    this._core.windowController.setShowDesktopButton(button);
                    this._primaryPanelController.setShowDesktopButton(button);
                }
            );
        this._showDesktopButtonController.enable();
        this._showDesktopButton = this._showDesktopButtonController.actor;
        this._core.windowController.setShowDesktopButton(this._showDesktopButton);
    }

    _connectSignals() {
        if (this._applicationSettings.isDefaultPanelWindows) {
            this._applicationSettings.connectObject(
                'changed::icon-size', () => this._core.iconSizer.reset(),
                'changed::icon-spacing', () => this._applyTaskbarAppearance(),
                'changed::icon-edge-padding', () => this._applyTaskbarAppearance(),
                this
            );
        }
        this._applicationSettings.connectObject(
            'changed::application-click-action',
            () => {
                if (this._applicationSettings.get_string('application-click-action') !==
                    CLICK_ACTION.TOGGLE_SPREAD) {
                    this._overviewIntegration.cancelAppSpread();
                }
            },
            this
        );
        this._settings.connectObject(
            'changed::taskbar-dynamic',
            () => this._queueRebuild(),
            'changed::default-panel-show-running-windows',
            () => this._queueRebuild(),
            this
        );
        this._settings.connectObject('changed::panel-position', () => {
            synchronizePanelPosition(this._settings);
            hidePanelBlur();
            this._primaryPanelController.position();
            this._queueRebuild();
        }, this);
    }

    _applyTaskbarAppearance() {
        if (this._settings.get_boolean('default-gnome-panel'))
            this._core.iconSizer.syncMaximum();
        this._core.applyAppearance();
        this._primaryPanelController.syncVerticalItems();
        this._syncPanelHeight();
        this._primaryPanelController.updateTaskbarWidth();
    }

    _applyPanelHeight() {
        this._panelHeight = taskbarPanelHeight(this._settings, this._core.iconSizer.iconSize);
        this._core.taskbarController.setPanelHeight(this._panelHeight);
        this._overviewIntegration.setPanelHeight(this._panelHeight);
        this._primaryPanelController.setPanelHeight(this._panelHeight);
    }

    _syncPanelHeight() {
        if (taskbarPanelHeight(this._settings, this._core.iconSizer.iconSize) !== this._panelHeight)
            this._applyPanelHeight();
    }

    _hotEdgeIsBlocked() {
        return this._core.isInteractionBlocked(false);
    }

    _toggleStartMenuAtPointer() {
        Main.panel.menuManager.activeMenu?.close();
        this._secondaryPanelManager.closePanelMenus();
        this._dockPanelManager.closePanelMenus();

        const [x, y] = global.get_pointer();
        if (this._dockPanelManager.hasPanelAt(x, y) &&
            !startButtonInPanel(this._settings)) {
            this._core.startButtonController.closeMenus();
            this._secondaryPanelManager.closeStartMenus();
            this._dockPanelManager.toggleStartMenuAt(x, y);
            return;
        }
        if (this._secondaryPanelManager.hasPanelAt(x, y)) {
            this._core.startButtonController.closeMenus();
            this._dockPanelManager.closeStartMenus();
            this._secondaryPanelManager.toggleStartMenuAt(x, y);
            return;
        }

        this._secondaryPanelManager.closeStartMenus();
        this._dockPanelManager.closeStartMenus();
        this._core.startButtonController.toggleStartMenu();
    }

}
