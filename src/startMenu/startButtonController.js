// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {StartMenuKeybindings} from './startMenuKeybindings.js';
import {StartMenuController} from './startMenuController.js';
import {StartButtonContextMenuController} from './startButtonContextMenuController.js';
import {WindowsXpStartButton} from './windowsXpStartButton.js';
import {openPopupMenu} from '../shared/popupMenuUtils.js';
import {TaskbarItemContainer} from '../taskbar/taskbarItemContainer.js';
import {
    BLUR_MY_SHELL_UUID,
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from '../shared/blurMyShellUtils.js';
import {
    panelArrowSide,
    panelIsVertical,
    syncMenuArrowSide,
} from '../panel/panelPosition.js';
import {
    taskbarGlassHeight,
    taskbarIconButtonWidth,
    taskbarVisualPanelHeight,
    taskbarVerticalItemExtent,
} from '../shared/panelSizing.js';
import {
    CLASSIC_HIGHLIGHT_SETTINGS,
    TASKBAR_HIGHLIGHT_SETTING_KEYS,
    TASKBAR_HIGHLIGHT_STYLE,
} from '../shared/classicHighlightSettings.js';
import {normalizePanelItemOrder} from '../shared/panelItemOrder.js';
import {
    createTaskbarSeparator,
    resetSeparatorToTarget,
    syncSeparatorGeometry,
    syncSeparatorVisibility,
} from '../taskbar/taskbarSeparator.js';
import {REFLOW_ANIMATION_TIME} from '../taskbar/reflowAnimation.js';

export class StartButtonController {
    constructor({
        extensionDir,
        settings,
        iconSize,
        previewController,
        openPreferences,
        closeApp,
        getInterestingWindows,
        manageKeybindings = true,
        toggleFromShortcut = null,
        switcherKeybindings = null,
        toggleDesktop,
        onMenuOpenStateChanged,
    }) {
        this._extensionDir = extensionDir;
        this._settings = settings;
        this._previews = previewController;
        this._openPreferences = openPreferences;
        this._closeApp = closeApp;
        this._getInterestingWindows = getInterestingWindows;
        this._toggleFromShortcut = toggleFromShortcut;
        this._toggleDesktop = toggleDesktop;
        this._onMenuOpenStateChanged = onMenuOpenStateChanged;
        this._signalHolder = new TransientSignalHolder();
        this._startOpenedOverview = false;
        this._startMenuController = null;
        this._contextMenu = null;
        this._contextMenuController = null;
        this._menuManager = null;
        this._positionAnimationStart = null;

        this._windowsGIcon = new Gio.FileIcon({
            file: extensionDir
                .get_child('icons')
                .get_child('start')
                .get_child('gnome-start-symbolic.svg'),
        });
        this._powerGIcon = new Gio.FileIcon({
            file: extensionDir
                .get_child('icons')
                .get_child('start')
                .get_child('power-symbolic.svg'),
        });
        this._settingsGIcon = new Gio.FileIcon({
            file: extensionDir
                .get_child('icons')
                .get_child('start')
                .get_child('settings-symbolic.svg'),
        });
        this._gnomeGIcon = new Gio.ThemedIcon({
            name: 'view-app-grid-symbolic',
        });
        this._windowsXpStartButton = new WindowsXpStartButton();
        this._icon = new St.Icon({
            gicon: this._currentGIcon(),
            icon_size: iconSize,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._content = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        this._contentContainer = new TaskbarItemContainer();
        this._contentContainer.setSnapChildAllocation(true);
        this._contentContainer.x_align = Clutter.ActorAlign.FILL;
        this._contentContainer.y_align = Clutter.ActorAlign.FILL;
        this._contentContainer.x_expand = true;
        this._contentContainer.y_expand = true;
        this._contentContainer.scale_x = 1;
        this._contentContainer.scale_y = 1;
        this._contentContainer.opacity = 255;
        this._contentContainer.setChild(this._content);
        this._hover = new St.Widget({
            style_class: 'simple-taskbar-start-hover',
            reactive: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        this._classicHover = new St.Widget({
            style_class: 'simple-taskbar-start-classic-hover',
            reactive: false,
            visible: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        this._classicHover.set_pivot_point(0, 0);
        this._content.add_child(this._hover);
        this._content.add_child(this._classicHover);
        this._content.add_child(this._icon);
        this.actor = new St.Button({
            style_class: 'panel-button simple-taskbar-start',
            reactive: true,
            can_focus: true,
            track_hover: true,
            toggle_mode: true,
            accessible_name: this._accessibleName(),
            child: this._settings.get_boolean('windows-xp-theme-enabled')
                ? this._windowsXpStartButton.actor
                : this._contentContainer,
        });
        const {separator, line} = createTaskbarSeparator();
        this._separator = separator;
        this._separator.visible = false;
        this._separatorLine = line;
        this._separatorVertical = null;
        this.panelActor = new St.BoxLayout({
            reactive: false,
        });
        this.panelActor.add_child(this.actor);
        this.panelActor.add_child(this._separator);
        this.panelActor.connectObject(
            'notify::allocation', () => this._animatePosition(),
            this._signalHolder
        );
        this.actor.connectObject(
            'clicked', () => this._toggleApplications(),
            'notify::hover', () => this._syncClassicHighlight(),
            'notify::pressed', () => this._syncClassicHighlight(),
            'notify::checked', () => this._syncClassicHighlight(),
            'notify::pseudo-class', () => this._syncClassicHighlight(),
            this._signalHolder
        );
        this._syncWindowsXpStartButton();
        this._syncVisibility();

        this._keybindings = manageKeybindings
            ? new StartMenuKeybindings(
                settings,
                () => this._toggleApplicationsFromShortcut(),
                () => this._toggleOverviewFromShortcut(),
                () => this._openFileManager(),
                switcherKeybindings
            )
            : null;
        this.applyAppearance(iconSize, settings.get_int('start-button-padding'));
        this._syncClassicHighlight();
    }

    enable() {
        if (this._windowsModeEnabled())
            this._ensureStartMenuController();
        this._createContextMenu();
        this._connectStateSignals();
        this._connectBlurMyShellSignals();
        this._syncState();
    }

    get menuIsOpen() {
        return Boolean(
            this._startMenuController?.isOpen || this._contextMenu.isOpen
        );
    }

    syncKeybindings() {
        this._keybindings?.sync();
    }

    toggleStartMenu() {
        if (!this._windowsModeEnabled())
            return;

        this._previews.hideTooltip(false);
        this._previews.hide();
        if (Main.overview.visible)
            Main.overview.hide();
        this._ensureStartMenuController().toggle();
    }

    closeMenus() {
        this._startMenuController?.close();
        this._contextMenu.close();
    }

    applyAppearance(iconSize, padding) {
        this._icon.icon_size = iconSize;
        const windowsXpTheme = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const vertical = panelIsVertical(this._settings);
        const floatingDock = this._settings.isDock &&
            !this._settings.get_boolean('dock-panel-mode');
        const glassWidth = windowsXpTheme
            ? this._windowsXpStartButton.width
            : taskbarIconButtonWidth(iconSize);
        const iconSpacing = windowsXpTheme
            ? 0
            : Math.max(this._settings.get_int('icon-spacing'), 0);
        const glassMainExtent = vertical
            ? taskbarVerticalItemExtent(iconSize)
            : taskbarGlassHeight(
                taskbarVisualPanelHeight(
                    this._settings.get_int('panel-height'),
                    iconSize,
                    floatingDock
                ),
                windowsXpTheme
            );
        const width = windowsXpTheme
            ? this._windowsXpStartButton.width
            : (vertical ? glassMainExtent : glassWidth) + iconSpacing;
        this._hover.set_width(glassWidth);
        this._hover.set_height(glassMainExtent);
        this._classicHover.set_width(glassWidth);
        this._classicHover.set_height(glassMainExtent);
        if (vertical) {
            this._hover.translation_y = 0;
            this._hover.y_align = Clutter.ActorAlign.CENTER;
            this._hover.y_expand = false;
        } else {
            this._hover.translation_y = 0;
            this._hover.y_align = Clutter.ActorAlign.CENTER;
            this._hover.y_expand = false;
        }
        this._classicHover.translation_y = 0;
        this._classicHover.y_align = Clutter.ActorAlign.CENTER;
        this._classicHover.y_expand = false;
        const startButtonPosition = this._settings.get_boolean(
            'start-button-follow-app-alignment'
        )
            ? this._settings.get_string('app-alignment')
            : this._settings.get_string('start-button-position');
        const leadingMargin = !windowsXpTheme &&
            startButtonPosition === 'left'
            ? padding
            : 0;
        const trailingMargin = !windowsXpTheme &&
            startButtonPosition === 'right'
            ? padding
            : 0;
        if (vertical) {
            this._content.set_width(-1);
            this._content.set_height(width);
            this.actor.set_width(-1);
            this.actor.set_height(width);
            this.actor.set_style(
                `min-width: 0; padding: 0; margin-top: ${leadingMargin}px;` +
                `margin-bottom: ${trailingMargin}px;` +
                `margin-right: ${windowsXpTheme ? 6 : 0}px;`
            );
            this._syncSeparator(false);
            return;
        }

        this._content.set_height(
            taskbarVisualPanelHeight(
                this._settings.get_int('panel-height'),
                iconSize,
                floatingDock
            )
        );
        this.actor.set_height(-1);
        this._content.set_width(width);
        this.actor.set_width(width);
        const borderStyle = floatingDock && !windowsXpTheme
            ? ' border-width: 0;'
            : '';
        this.actor.set_style(
            `min-width: 0; padding: 0;${borderStyle}` +
                ` margin-left: ${leadingMargin}px;` +
                `margin-right: ${trailingMargin}px;`
        );
        this._syncSeparator(false);
    }

    preparePositionAnimation() {
        if (!St.Settings.get().enable_animations ||
            !this.panelActor.has_allocation()) {
            return;
        }

        const [x, y] = this.panelActor.get_transformed_position();
        this._positionAnimationStart = {x, y};
    }

    destroy() {
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._setActivitiesOverviewState(Main.overview._shown);

        this._keybindings?.destroy();
        this._keybindings = null;
        this._contextMenuController.destroy();
        this._contextMenuController = null;
        this._contextMenu.destroy();
        this._contextMenu = null;
        this._startMenuController?.destroy();
        this._startMenuController = null;
        this._menuManager = null;
        this._windowsXpStartButton.destroy();
        this._windowsXpStartButton = null;
        this.panelActor.destroy();
        this.panelActor = null;
        this.actor = null;

        this._separator = null;
        this._separatorLine = null;
        this._separatorVertical = null;
        this._hover = null;
        this._classicHover = null;
        this._contentContainer = null;
        this._content = null;
        this._icon = null;
        this._windowsGIcon = null;
        this._powerGIcon = null;
        this._settingsGIcon = null;
        this._gnomeGIcon = null;
        this._extensionDir = null;
        this._previews = null;
        this._openPreferences = null;
        this._closeApp = null;
        this._getInterestingWindows = null;
        this._toggleFromShortcut = null;
        this._toggleDesktop = null;
        this._onMenuOpenStateChanged = null;
        this._settings = null;
        this._startOpenedOverview = false;
        this._positionAnimationStart = null;
    }

    _animatePosition() {
        if (!this._positionAnimationStart)
            return;

        const start = this._positionAnimationStart;
        this._positionAnimationStart = null;
        this.panelActor.remove_transition('translation-x');
        this.panelActor.remove_transition('translation-y');
        this.panelActor.translation_x = 0;
        this.panelActor.translation_y = 0;
        const [targetX, targetY] =
            this.panelActor.get_transformed_position();
        const translationX = start.x - targetX;
        const translationY = start.y - targetY;
        if (translationX === 0 && translationY === 0)
            return;

        this.panelActor.translation_x = translationX;
        this.panelActor.translation_y = translationY;
        this.panelActor.ease({
            translation_x: 0,
            translation_y: 0,
            duration: REFLOW_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    _connectBlurMyShellSignals() {
        Main.uiGroup.connectObject('notify::style-class', () => {
            this._startMenuController?.queueTransparencySync();
        }, this._signalHolder);
        Main.extensionManager.connectObject(
            'extension-state-changed',
            (_manager, extension) => {
                if (extension.uuid === BLUR_MY_SHELL_UUID)
                    this._startMenuController?.queueTransparencySync();
            },
            this._signalHolder
        );

        const settings = getBlurMyShellSettings();
        if (!settings)
            return;

        const popupSettings = getBlurMyShellChildSettings(settings, 'popup');
        const panelSettings = getBlurMyShellChildSettings(settings, 'panel');
        for (const [componentSettings, key] of [
            [popupSettings, 'blur'],
            [popupSettings, 'override-background'],
            [popupSettings, 'style-popup'],
            [popupSettings, 'menu-corner-radius'],
            [panelSettings, 'blur'],
        ]) {
            if (!componentSettings ||
                !blurMyShellHasKey(componentSettings, key)) {
                continue;
            }
            componentSettings.connectObject(
                `changed::${key}`,
                () => this._startMenuController?.queueTransparencySync(),
                this._signalHolder
            );
        }
    }

    _ensureMenuManager() {
        if (this._menuManager)
            return this._menuManager;

        this._menuManager = new PopupMenu.PopupMenuManager();
        this._menuManager._changeMenu = () => {};
        return this._menuManager;
    }

    _ensureStartMenuController() {
        if (this._startMenuController)
            return this._startMenuController;

        this._ensureMenuManager();
        this._startMenuController = new StartMenuController(
            this.actor,
            this._settings,
            {
                onOpenStateChanged: open => {
                    if (this._windowsModeEnabled())
                        this.actor.checked = open;
                    this._notifyMenuOpenStateChanged();
                },
                menuManager: this._menuManager,
                onSourceContextMenu: () => this._openContextMenu(),
                closeApp: (app, timestamp) =>
                    this._closeApp(app, timestamp),
                getInterestingWindows: app =>
                    this._getInterestingWindows(app),
                powerGIcon: this._powerGIcon,
                settingsGIcon: this._settingsGIcon,
            }
        );
        return this._startMenuController;
    }

    _createContextMenu() {
        this._ensureMenuManager();
        const menu = new PopupMenu.PopupMenu(
            this.actor,
            0.5,
            panelArrowSide(this._settings)
        );
        this._contextMenuController = new StartButtonContextMenuController({
            settings: this._settings,
            menu,
            closeMenus: () => this.closeMenus(),
            openFileManager: () => this._openFileManager(),
            toggleDesktop: () => this._toggleDesktop(),
        });
        menu.addAction(_('Start Menu Settings'), () => {
            this._settings.set_string('target-prefs-page', 'start-menu');
            this._openPreferences();
        });
        if (this._settings.isDock) {
            menu.addAction(_('Dock Settings'), () => {
                this._settings.set_string('target-prefs-page', 'dock');
                this._openPreferences();
            });
        } else {
            menu.addAction(_('Taskbar Settings'), () => {
                this._settings.set_string('target-prefs-page', 'taskbar');
                this._openPreferences();
            });
        }
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        this._menuManager.addMenu(menu);
        this._contextMenu = menu;
        menu.connectObject('open-state-changed', () => {
            this._notifyMenuOpenStateChanged();
        }, this._signalHolder);

        this.actor.connectObject('event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
                event.get_button() !== Clutter.BUTTON_SECONDARY)
                return Clutter.EVENT_PROPAGATE;

            this._openContextMenu();
            return Clutter.EVENT_STOP;
        }, this._signalHolder);
        this.actor.connectObject('popup-menu', () => {
            this._openContextMenu();
            return Clutter.EVENT_STOP;
        }, this._signalHolder);
    }

    _connectStateSignals() {
        const shellShowAppsButton = Main.overview.dash.showAppsButton;
        shellShowAppsButton.connectObject('notify::checked', () => {
            this._syncState();
            this._notifyMenuOpenStateChanged();
        }, this._signalHolder);
        Main.overview.connectObject('showing', () => {
            if (shellShowAppsButton.checked)
                this._setActivitiesOverviewState(false);
        }, this._signalHolder);
        Main.overview.connectObject('hidden', () => {
            this.actor.checked = this._windowsModeEnabled()
                ? Boolean(this._startMenuController?.isOpen)
                : false;
            this._startOpenedOverview = false;
            this._setActivitiesOverviewState(false);
            this._notifyMenuOpenStateChanged();
        }, this._signalHolder);
        this._settings.connectObject('changed::windows-start-menu-enabled', () => {
            this._startMenuController?.close();
            if (this._windowsModeEnabled())
                this._ensureStartMenuController();
            this._contextMenu.close();
            this._startOpenedOverview = false;
            this._icon.gicon = this._currentGIcon();
            this.actor.accessible_name = this._accessibleName();
            this._syncVisibility();
            this._syncState();
            this._notifyMenuOpenStateChanged();
            this._keybindings?.sync();
        }, this._signalHolder);
        this._settings.connectObject('changed::windows-xp-theme-enabled', () => {
            this._startMenuController?.close();
            this._contextMenu.close();
            this._syncWindowsXpStartButton();
            this.applyAppearance(
                this._icon.icon_size,
                this._settings.get_int('start-button-padding')
            );
            this._syncVisibility();
            this._syncState();
            this._notifyMenuOpenStateChanged();
        }, this._signalHolder);
        const syncAppearance = () => this.applyAppearance(
            this._icon.icon_size,
            this._settings.get_int('start-button-padding')
        );
        this._settings.connectObject(
            'changed::app-alignment', syncAppearance,
            'changed::start-button-position', syncAppearance,
            'changed::start-button-follow-app-alignment', syncAppearance,
            'changed::panel-item-order', syncAppearance,
            'changed::panel-position', syncAppearance,
            'changed::panel-height', syncAppearance,
            'changed::dock-panel-mode', syncAppearance,
            this._signalHolder
        );
        for (const key of TASKBAR_HIGHLIGHT_SETTING_KEYS) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this._syncClassicHighlight(),
                this._signalHolder
            );
        }
        this._settings.connectObject(
            'changed::show-start-button-separator',
            () => this._syncSeparator(true),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::start-menu-recommended-apps',
            () => this._startMenuController?.refresh(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::start-menu-hide-pinned-app-titles',
            () => this._startMenuController?.refresh(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::start-menu-power-options-enabled',
            () => this._startMenuController?.syncPowerOptions(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::start-menu-show-profile-picture',
            () => this._startMenuController?.syncUserAvatar(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::start-menu-open-all-apps',
            () => this._startMenuController?.refreshDefaultView(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::start-menu-app-categories',
            () => this._startMenuController?.refresh(),
            this._signalHolder
        );
        this._settings.connectObject('changed::start-button-custom-icon', () => {
            this._icon.gicon = this._currentGIcon();
        }, this._signalHolder);
        this._settings.connectObject('changed::gnome-start-button-visible', () => {
            this._syncVisibility();
        }, this._signalHolder);
        this._settings.connectObject('changed::default-gnome-panel', () => {
            this._startMenuController?.close();
            this._contextMenu.close();
            this._syncVisibility();
            this._keybindings?.sync();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::dock-mode',
            () => this._keybindings?.sync(),
            this._signalHolder
        );
        this._settings.connectObject('changed::start-menu-super-key', () => {
            this._keybindings?.sync();
        }, this._signalHolder);
        this._settings.connectObject('changed::start-menu-super-tab', () => {
            this._keybindings?.sync();
        }, this._signalHolder);
        this._settings.connectObject('changed::start-menu-custom-hotkey', () => {
            this._keybindings?.customAcceleratorChanged();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::super-e-file-manager-enabled',
            () => this._keybindings?.sync(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::grid-alt-tab-enabled',
            () => this._keybindings?.sync(),
            this._signalHolder
        );
        this._settings.connectObject('changed::start-menu-theme', () => {
            this._startMenuController?.syncTheme();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::start-menu-follow-panel-theme',
            () => this._startMenuController?.syncTheme(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::start-menu-follow-panel-transparency',
            () => this._startMenuController?.syncTransparency(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::transparency-enabled',
            () => this._startMenuController?.syncTransparency(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::transparency-level',
            () => this._startMenuController?.syncTransparency(),
            this._signalHolder
        );
        Main.panel.connectObject('notify::style-class', () => {
            if (this._settings.get_boolean(
                'start-menu-follow-panel-theme'
            )) {
                this._startMenuController?.syncTheme();
            }
        }, this._signalHolder);
    }

    _openContextMenu() {
        this._startMenuController?.close();
        this._previews.hideTooltip(false);
        this._previews.hide();
        syncMenuArrowSide(this._contextMenu, this._settings);
        this._contextMenuController.sync();
        openPopupMenu(this._contextMenu);
    }

    _notifyMenuOpenStateChanged() {
        const shellShowAppsButton = Main.overview.dash.showAppsButton;
        const open = this._windowsModeEnabled()
            ? this.menuIsOpen
            : shellShowAppsButton.checked;
        this._onMenuOpenStateChanged(open);
    }

    _toggleApplications() {
        if (this._windowsModeEnabled()) {
            this.toggleStartMenu();
            return;
        }

        const shellShowAppsButton = Main.overview.dash.showAppsButton;

        if (this.actor.checked) {
            this._startOpenedOverview = !Main.overview.visible;
            if (!shellShowAppsButton.checked)
                shellShowAppsButton.checked = true;
            Main.overview.show(OverviewControls.ControlsState.APP_GRID);
        } else if (this._startOpenedOverview) {
            this._startOpenedOverview = false;
            Main.overview.hide();
        } else {
            if (shellShowAppsButton.checked)
                shellShowAppsButton.checked = false;
            else
                Main.overview.show(OverviewControls.ControlsState.WINDOW_PICKER);
        }
    }

    _toggleApplicationsFromShortcut() {
        if (this._toggleFromShortcut) {
            this._toggleFromShortcut();
            return;
        }

        this._toggleApplications();
    }

    _toggleOverviewFromShortcut() {
        this._startMenuController?.close();
        this._contextMenu.close();
        this._previews.hideTooltip(false);
        this._previews.hide();
        Main.overview.toggle();
    }

    _openFileManager() {
        const app = Gio.app_info_get_default_for_type(
            'inode/directory',
            false
        );
        if (!app)
            return;

        this.closeMenus();
        this._previews.hideTooltip(false);
        this._previews.hide();
        const home = Gio.File.new_for_path(GLib.get_home_dir());
        app.launch([home], global.create_app_launch_context(0, -1));
    }

    _syncState() {
        if (!this.actor)
            return;

        const shellShowAppsButton = Main.overview.dash.showAppsButton;
        const applicationsActive = shellShowAppsButton.checked;
        this.actor.checked = this._windowsModeEnabled()
            ? Boolean(this._startMenuController?.isOpen)
            : applicationsActive;
        this._setActivitiesOverviewState(
            !applicationsActive && Main.overview._shown
        );
    }

    _setActivitiesOverviewState(active) {
        const activitiesButton = Main.panel.statusArea.activities;
        if (!activitiesButton)
            return;

        if (active)
            activitiesButton.add_style_pseudo_class('checked');
        else
            activitiesButton.remove_style_pseudo_class('checked');
    }

    _windowsModeEnabled() {
        return this._settings.get_boolean('windows-start-menu-enabled');
    }

    _syncWindowsXpStartButton() {
        const enabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        this.actor.child = enabled
            ? this._windowsXpStartButton.actor
            : this._contentContainer;
        this._icon.visible = !enabled;
        this._syncClassicHighlight();
    }

    _syncClassicHighlight() {
        const classic = this._settings.get_string(
            'taskbar-highlight-style'
        ) === TASKBAR_HIGHLIGHT_STYLE.CLASSIC;
        const windowsXpTheme = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const enabled = classic && !windowsXpTheme;
        this._hover.visible = !classic && !windowsXpTheme;
        this._classicHover.visible = enabled;
        this._classicHover.opacity = 0;
        const radius = this._settings.get_int(
            CLASSIC_HIGHLIGHT_SETTINGS.borderRadius
        );
        const pressed = this.actor.pressed || this.actor.checked;
        const colorKey = pressed
            ? CLASSIC_HIGHLIGHT_SETTINGS.pressedColor
            : CLASSIC_HIGHLIGHT_SETTINGS.hoverColor;
        this._classicHover.set_style(
            `background-color: ${this._settings.get_string(
                colorKey
            )};border-radius: ${radius}px;`
        );
        const hovered = this.actor.hover ||
            this.actor.has_style_pseudo_class('hover') ||
            this.actor.has_style_pseudo_class('focus');
        const hoverEnabled = this._settings.get_boolean(
            CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled
        );
        if (windowsXpTheme)
            return;

        const active = hoverEnabled && (hovered || pressed);
        this._classicHover.opacity = active && classic ? 255 : 0;
    }

    _currentGIcon() {
        const customIcon = this._getCustomGIcon();
        if (customIcon)
            return customIcon;

        return this._windowsModeEnabled()
            ? this._windowsGIcon
            : this._gnomeGIcon;
    }

    _getCustomGIcon() {
        const location = this._settings.get_string(
            'start-button-custom-icon'
        );
        if (!location)
            return null;

        if (location === 'builtin:gnome') {
            return new Gio.FileIcon({
                file: this._extensionDir
                    .get_child('icons')
                    .get_child('start')
                    .get_child('gnome-start-symbolic.svg'),
            });
        }
        if (location === 'builtin:eleven') {
            return new Gio.FileIcon({
                file: this._extensionDir
                    .get_child('icons')
                    .get_child('start')
                    .get_child('eleven-start-symbolic.svg'),
            });
        }
        if (location.startsWith('distro:')) {
            const filename = location.slice('distro:'.length);
            if (!/^distro-[a-z0-9-]+\.(?:png|svg)$/.test(filename))
                return null;

            return new Gio.FileIcon({
                file: this._extensionDir
                    .get_child('icons')
                    .get_child('distros')
                    .get_child(filename),
            });
        }

        const file = location.includes('://')
            ? Gio.File.new_for_uri(location)
            : Gio.File.new_for_path(location);
        return file.query_exists(null) ? new Gio.FileIcon({file}) : null;
    }

    _syncVisibility() {
        this.actor.visible =
            !this._settings.get_boolean('default-gnome-panel') &&
            (this._windowsModeEnabled() ||
                this._settings.get_boolean('gnome-start-button-visible'));
        this.panelActor.visible = this.actor.visible;
        this._syncSeparator(false);
    }

    _syncSeparator(animate) {
        const vertical = panelIsVertical(this._settings);
        const orientationChanged = this._separatorVertical !== vertical;
        this._separatorVertical = vertical;
        this.panelActor.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        this.panelActor.x_align = vertical
            ? Clutter.ActorAlign.FILL
            : Clutter.ActorAlign.CENTER;
        this.panelActor.x_expand = vertical;
        this.panelActor.y_align = vertical
            ? Clutter.ActorAlign.CENTER
            : Clutter.ActorAlign.FILL;
        this.panelActor.y_expand = !vertical;
        syncSeparatorGeometry(
            this._separator,
            this._separatorLine,
            vertical,
            this._icon.icon_size
        );
        if (orientationChanged)
            resetSeparatorToTarget(this._separator, vertical);
        this.panelActor.set_child_at_index(
            this._separator,
            this._separatorFollowsButton() ? 1 : 0
        );

        const visible = this.actor.visible &&
            !this._settings.get_boolean('windows-xp-theme-enabled') &&
            this._settings.get_boolean('show-start-button-separator');
        syncSeparatorVisibility(this._separator, vertical, visible, animate);
    }

    _separatorFollowsButton() {
        const startPosition = this._settings.get_boolean(
            'start-button-follow-app-alignment'
        )
            ? this._settings.get_string('app-alignment')
            : this._settings.get_string('start-button-position');
        const appPosition = this._settings.get_string('app-alignment');
        if (startPosition !== appPosition) {
            const positions = ['left', 'center', 'right'];
            return positions.indexOf(startPosition) <
                positions.indexOf(appPosition);
        }

        const order = normalizePanelItemOrder(
            this._settings.get_strv('panel-item-order')
        );
        return order.indexOf('start-button') <
            order.indexOf('applications');
    }

    _accessibleName() {
        return this._windowsModeEnabled() ? _('Start') : _('Applications');
    }
}
