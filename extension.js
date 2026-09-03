// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ExtensionConflictController} from './src/integration/extensionConflictController.js';
import {FolderMenuController} from './src/folderMenuController.js';
import {TrayOverflowController} from './src/overflow/trayOverflowController.js';
import {FavoritesIntegration} from './src/integration/favoritesIntegration.js';
import {GridAltTabController} from './src/windowSwitching/gridAltTabController.js';
import {HotEdgeController} from './src/hotEdgeController.js';
import {restoreOverlayKey} from './src/keybindingRecovery.js';
import {PanelController} from './src/panel/panelController.js';
import {PanelInteractionController} from './src/panel/panelInteractionController.js';
import {SecondaryPanelManager} from './src/secondaryPanel/secondaryPanelManager.js';
import {DockPanelManager} from './src/dock/dockPanelManager.js';
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
import {
    ApplicationKeybindingRouter,
} from './src/windowSwitching/applicationKeybindingRouter.js';
import {TaskbarController} from './src/taskbar/taskbarController.js';
import {
    getTaskbarHoverAnimationNeighbours,
} from './src/taskbar/taskbarHoverAnimationUtils.js';
import {
    NotificationBadgeModel,
} from './src/taskbar/notificationBadgeModel.js';
import {createTaskbarViewport} from './src/taskbar/taskbarViewportFactory.js';
import {VolumeMixerController} from './src/integration/volumeMixerController.js';
import {WindowController} from './src/taskbar/windowController.js';
import {
    WindowMinimizeEffectController,
} from './src/taskbar/windowMinimizeEffectController.js';
import {WindowPreviewController} from './src/taskbar/windowPreviewController.js';
import {OverviewIntegration} from './src/integration/overviewIntegration.js';
import {ICON_VERTICAL_RESERVE} from './src/shared/panelSizing.js';
import {hidePanelBlur, resetPanelBlur} from './src/integration/blurMyShellRuntime.js';
import {synchronizePanelPosition} from './src/shared/panelModeProfiles.js';
import {WindowsXpModeController} from './src/windowsXpModeController.js';
import {CLICK_ACTION} from './src/shared/applicationClickActions.js';

export default class SimpleTaskbarExtension extends Extension {
    enable() {
        this._rebuildId = 0;
        this._appSystem = Shell.AppSystem.get_default();
        this._tracker = Shell.WindowTracker.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._settings = this.getSettings();
        restoreOverlayKey(this._settings);
        this._switcherKeybindings = new SwitcherKeybindingRouter();
        this._extensionConflictController =
            new ExtensionConflictController(this._settings);
        this._extensionConflictController.enable();
        this._notificationBadgeModel = new NotificationBadgeModel();
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
                    this._maximumIconSize = iconSize;
                    this._iconSize = iconSize;
                    this._startButtonController.applyAppearance(
                        this._iconSize,
                        this._settings.get_int('start-button-padding')
                    );
                    this._taskbarController.setIconSize(this._iconSize);
                    this._panelController.syncVerticalItems();
                    this._applicationOverflowController.sync();
                    this._panelController.updateTaskbarWidth();
                },
                onIconSpacingChanged: () => this._applyTaskbarAppearance(),
                onModeChanged: () => {
                    this._resetTaskbarIconSize();
                    this._applicationOverflowController.clearOverflow();
                    this._panelController.syncVerticalItems();
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
        this._maximumIconSize = this._settings.get_int('icon-size');
        this._iconSize = this._maximumIconSize;
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
        this._applicationKeybindings = new ApplicationKeybindingRouter(
            app => this._windowController.activateApp(app)
        );
        this._applicationKeybindings.enable();
        this._taskbarController = new TaskbarController({
            settings: this._settings,
            appSystem: this._appSystem,
            tracker: this._tracker,
            favorites: this._favorites,
            notificationBadgeModel: this._notificationBadgeModel,
            iconSize: this._iconSize,
            panelHeight: this._panelHeight,
            getInterestingWindows: app =>
                this._windowController.getInterestingWindows(app),
            onAppClicked: (item, app, action) =>
                this._windowController.handleAppClicked(item, app, action),
            onWindowClicked: window =>
                this._windowController.handleWindowClicked(window),
            openNewWindow: app => this._windowController.openNewWindow(app),
            getPositionActor: () => Main.layoutManager.panelBox,
            getHoverAnimationMonitor: () =>
                Main.layoutManager.primaryMonitor,
            getPanelInteractionController: () =>
                this._panelInteractionController,
            getHoverAnimationNeighbours: () =>
                getTaskbarHoverAnimationNeighbours(
                    this._taskbarBin,
                    this._startButtonController.panelActor,
                    this._taskbarViewport
                ),
            onHoverAnimationReserveChanged: () =>
                this._panelController.updateTaskbarWidth(),
            isHoverAnimationBlocked: () =>
                this._panelInteractionIsBlocked(false),
            onShowDesktopClicked: () =>
                this._windowController.toggleDesktop(),
            onShowDesktopModeChanged: () =>
                this._panelController.applyLayout(),
            getPreviewController: () => this._windowPreviews,
            onRedisplay: () => {
                this._panelController.updateTaskbarWidth();
                this._applicationOverflowController.sync();
            },
        });
        this._windowMinimizeEffectController =
            new WindowMinimizeEffectController(this._settings);
        this._taskbarController.setAlignmentActor(Main.panel._centerBox);
        this._windowPreviews = new WindowPreviewController(
            () => this._taskbarController.getItems(),
            app => this._windowController.getInterestingWindows(app),
            this._settings,
            () => this._applicationOverflowController.closeWithAnimation(),
            () => this._taskbarController.getHoverAnimationOutwardReserve(),
            () => this._taskbarController.isPointerInMagnifyBounds()
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
            toggleDesktop: () => this._windowController.toggleDesktop(),
            toggleFromShortcut: () => this._toggleStartMenuAtPointer(),
            switcherKeybindings: this._switcherKeybindings,
            onMenuOpenStateChanged: open => {
                this._taskbarController.setStartMenuOpen(open);
                this._panelController.setStartMenuOpen(open);
                if (open) {
                    this._taskbarController.dropHoverAnimations();
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
            onPanelHidden: () => {
                this._taskbarController.dropHoverAnimations();
                this._windowPreviews.hideTooltip(false);
            },
            getHoverAnimationOutwardReserve: () =>
                this._taskbarController.getHoverAnimationOutwardReserve(),
            startButton: this._startButtonController.panelActor,
            taskbarBin: this._taskbarBin,
            taskbarActor: this._taskbarController.actor,
            showDesktopButton: this._showDesktopButton,
            folderMenuButton: this._folderMenuController.actor,
            onAppAlignmentChanged: () => this._applyTaskbarAppearance(),
            onTaskbarAvailableWidthChanged: width =>
                this._syncTaskbarIconSize(width),
            isTaskbarAdaptive: () =>
                this._iconSize < this._maximumIconSize,
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
            onAppScrolled: (item, direction) =>
                this._windowController.handleAppScrolled(item, direction),
            onPanelScrolled: direction =>
                this._windowController.handlePanelScrolled(direction),
            getVolumeIndicator: () =>
                Main.panel.statusArea.quickSettings._volumeOutput,
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
            notificationBadgeModel: this._notificationBadgeModel,
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
            notificationBadgeModel: this._notificationBadgeModel,
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
        this._windowMinimizeEffectController.enable();
    }

    disable() {
        if (this._rebuildId) {
            GLib.Source.remove(this._rebuildId);
            this._rebuildId = 0;
        }
        this._settings.disconnectObject(this);
        this._taskbarController.disableHoverAnimations();
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
        this._dockPanelManager.destroy();
        this._dockPanelManager = null;
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
        this._applicationKeybindings.destroy();
        this._applicationKeybindings = null;
        this._windowMinimizeEffectController.destroy();
        this._windowMinimizeEffectController = null;
        this._taskbarController.destroy();
        this._windowController.destroy();
        this._notificationBadgeModel.destroy();
        this._notificationBadgeModel = null;
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
        this._maximumIconSize = null;
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

        prefsWindow.connectObject('unmanaged', () => {
            super.openPreferences();
            prefsWindow.disconnectObject(this);
        }, this);
        prefsWindow.delete(global.get_current_time());
    }

    _createTaskbarActors() {
        const {viewport, overflowController} = createTaskbarViewport({
            settings: this._settings,
            taskbarController: this._taskbarController,
            previewController: this._windowPreviews,
        });
        this._taskbarViewport = viewport;
        this._applicationOverflowController = overflowController;
        this._taskbarBin = overflowController.actor;

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
            'changed::application-click-action',
            () => {
                if (this._settings.get_string('application-click-action') !==
                    CLICK_ACTION.TOGGLE_SPREAD) {
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
            this._panelController.syncVerticalItems();
            this._panelController.updateTaskbarWidth();
        }, this);
        this._settings.connectObject(
            'changed::dock-min-icon-size',
            () => {
                if (this._settings.get_boolean('default-gnome-panel') ||
                    this._settings.get_boolean('dock-mode') ||
                    this._settings.get_boolean('windows-xp-theme-enabled')) {
                    return;
                }
                this._panelController.updateTaskbarWidth();
            },
            this
        );
        this._settings.connectObject(
            'changed::show-location-separator',
            () => this._panelController.updateTaskbarWidth(),
            this
        );
        this._settings.connectObject('changed::panel-position', () => {
            synchronizePanelPosition(this._settings);
            hidePanelBlur();
            this._panelController.position();
            this._queueRebuild();
        }, this);
    }

    _applyTaskbarAppearance() {
        this._startButtonController.applyAppearance(
            this._iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._taskbarController.applyAppearance();
        this._panelController.syncVerticalItems();
        this._panelController.updateTaskbarWidth();
    }

    _syncTaskbarIconSize(availableLength) {
        this._taskbarController.setAvailableWidth(availableLength);
        if (this._taskbarController.isRebuilding() ||
            this._settings.get_boolean('default-gnome-panel') ||
            this._settings.get_boolean('dock-mode') ||
            this._settings.get_boolean('windows-xp-theme-enabled')) {
            return false;
        }

        const maximum = this._maximumIconSize;
        const minimum = Math.min(
            this._settings.get_int('dock-min-icon-size'),
            maximum
        );
        const iconSize = this._taskbarController.getIconSizeForLength(
            availableLength,
            maximum,
            minimum,
            this._startButtonController.actor.visible ? this._iconSize : null
        );
        if (iconSize === this._iconSize)
            return false;

        this._iconSize = iconSize;
        this._taskbarController.setIconSize(iconSize);
        this._startButtonController.applyAppearance(
            iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._panelController.syncVerticalItems();
        this._applicationOverflowController.syncIconSizeChange();
        return true;
    }

    _resetTaskbarIconSize() {
        this._maximumIconSize = this._settings.get_int('icon-size');
        this._iconSize = this._maximumIconSize;
        this._taskbarController.setIconSize(this._iconSize);
        this._startButtonController.applyAppearance(
            this._iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._applicationOverflowController.sync();
    }

    _syncTaskbarVisibility() {
        const visible = !this._settings.get_boolean('default-gnome-panel');
        this._taskbarBin.visible = visible;
        if (!visible) {
            this._windowPreviews.hideTooltip(false);
            this._windowPreviews.hide();
            this._overviewIntegration.cancelAppSpread();
        }
        if (visible && !this._settings.get_boolean('dock-mode') &&
            !this._settings.get_boolean('windows-xp-theme-enabled')) {
            this._resetTaskbarIconSize();
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
        this._dockPanelManager.closePanelMenus();

        const [x, y] = global.get_pointer();
        if (this._dockPanelManager.hasPanelAt(x, y)) {
            this._startButtonController.closeMenus();
            this._secondaryPanelManager.closeStartMenus();
            this._dockPanelManager.toggleStartMenuAt(x, y);
            return;
        }
        if (this._secondaryPanelManager.hasPanelAt(x, y)) {
            this._startButtonController.closeMenus();
            this._dockPanelManager.closeStartMenus();
            this._secondaryPanelManager.toggleStartMenuAt(x, y);
            return;
        }

        this._secondaryPanelManager.closeStartMenus();
        this._dockPanelManager.closeStartMenus();
        this._startButtonController.toggleStartMenu();
    }

}
