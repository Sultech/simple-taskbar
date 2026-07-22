// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {StartMenuKeybindings} from './startMenuKeybindings.js';
import {WindowsStartMenu} from './windowsStartMenu.js';
import {panelArrowSide, syncMenuArrowSide} from './panelPosition.js';

export class StartButtonController {
    constructor({
        extensionDir,
        settings,
        iconSize,
        previewController,
        openPreferences,
        manageKeybindings = true,
        toggleFromShortcut = null,
    }) {
        this._settings = settings;
        this._previews = previewController;
        this._openPreferences = openPreferences;
        this._toggleFromShortcut = toggleFromShortcut;
        this._signals = [];
        this._startOpenedOverview = false;
        this._windowsStartMenu = null;
        this._contextMenu = null;
        this._menuManager = null;

        this._windowsGIcon = new Gio.FileIcon({
            file: extensionDir.get_child('gnome-start-symbolic.svg'),
        });
        this._gnomeGIcon = new Gio.ThemedIcon({
            name: 'view-app-grid-symbolic',
        });
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
        this._hover = new St.Widget({
            style_class: 'simple-taskbar-start-hover',
            reactive: false,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_expand: true,
        });
        this._content.add_child(this._hover);
        this._content.add_child(this._icon);
        this.actor = new St.Button({
            style_class: 'panel-button simple-taskbar-start',
            reactive: true,
            can_focus: true,
            track_hover: true,
            toggle_mode: true,
            accessible_name: this._accessibleName(),
            child: this._content,
        });
        this._connect(this.actor, 'clicked', () => this._toggleApplications());
        this._syncVisibility();

        this._keybindings = manageKeybindings
            ? new StartMenuKeybindings(
                settings,
                () => this._toggleApplicationsFromShortcut(),
                () => this._toggleOverviewFromShortcut(),
                () => this._openFileManager()
            )
            : null;
        this.applyAppearance(iconSize, settings.get_int('start-button-padding'));
    }

    enable() {
        this._createWindowsStartMenu();
        this._createContextMenu();
        this._connectStateSignals();
        this._syncState();
    }

    get menuIsOpen() {
        return Boolean(
            this._windowsStartMenu?.isOpen || this._contextMenu?.isOpen
        );
    }

    syncKeybindings() {
        this._keybindings?.sync();
    }

    toggleStartMenu() {
        if (!this._windowsModeEnabled())
            return;

        if (Main.overview.visible)
            Main.overview.hide();
        this._windowsStartMenu?.toggle();
    }

    closeMenus() {
        this._windowsStartMenu?.close();
        this._contextMenu?.close();
    }

    applyAppearance(iconSize, padding) {
        this._icon.icon_size = iconSize;
        const width = iconSize + padding * 2;
        this._content.set_width(width);
        this.actor.set_width(width);
        this.actor.set_style('min-width: 0; padding: 0;');
    }

    destroy() {
        this._keybindings?.destroy();
        this._keybindings = null;

        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];
        this._setActivitiesOverviewState(
            Main.overview._shown ?? Main.overview.visible
        );

        this._contextMenu?.destroy();
        this._contextMenu = null;
        this._windowsStartMenu?.destroy();
        this._windowsStartMenu = null;
        this._menuManager = null;
        this.actor?.destroy();
        this.actor = null;

        this._hover = null;
        this._content = null;
        this._icon = null;
        this._windowsGIcon = null;
        this._gnomeGIcon = null;
        this._previews = null;
        this._openPreferences = null;
        this._toggleFromShortcut = null;
        this._settings = null;
        this._startOpenedOverview = false;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _createWindowsStartMenu() {
        this._menuManager = new PopupMenu.PopupMenuManager();
        this._menuManager._changeMenu = () => {};
        this._windowsStartMenu = new WindowsStartMenu(
            this.actor,
            this._settings,
            {
                onOpenStateChanged: open => {
                    if (this._windowsModeEnabled())
                        this.actor.checked = open;
                },
                menuManager: this._menuManager,
                onSourceContextMenu: () => this._openContextMenu(),
            }
        );
    }

    _createContextMenu() {
        const menu = new PopupMenu.PopupMenu(
            this.actor,
            0.5,
            panelArrowSide(this._settings)
        );
        menu.addAction(_('Start Menu Settings'), () => {
            this._settings.set_string('target-prefs-page', 'start-menu');
            this._openPreferences();
        });
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        this._menuManager.addMenu(menu);
        this._contextMenu = menu;

        this._connect(this.actor, 'event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
                event.get_button() !== Clutter.BUTTON_SECONDARY ||
                !this._windowsModeEnabled())
                return Clutter.EVENT_PROPAGATE;

            this._openContextMenu();
            return Clutter.EVENT_STOP;
        });
        this._connect(this.actor, 'popup-menu', () => {
            if (!this._windowsModeEnabled())
                return Clutter.EVENT_PROPAGATE;

            this._openContextMenu();
            return Clutter.EVENT_STOP;
        });
    }

    _connectStateSignals() {
        const shellShowAppsButton =
            Main.overview.searchController?._showAppsButton;
        if (shellShowAppsButton) {
            this._connect(shellShowAppsButton, 'notify::checked', () => {
                this._syncState();
            });
        }
        this._connect(Main.overview, 'showing', () => {
            if (shellShowAppsButton?.checked)
                this._setActivitiesOverviewState(false);
        });
        this._connect(Main.overview, 'hidden', () => {
            this.actor.checked = this._windowsModeEnabled()
                ? this._windowsStartMenu?.isOpen ?? false
                : false;
            this._startOpenedOverview = false;
            this._setActivitiesOverviewState(false);
        });
        this._connect(this._settings, 'changed::windows-start-menu-enabled', () => {
            this._windowsStartMenu?.close();
            this._contextMenu?.close();
            this._startOpenedOverview = false;
            this._icon.gicon = this._currentGIcon();
            this.actor.accessible_name = this._accessibleName();
            this._syncVisibility();
            this._syncState();
            this._keybindings?.sync();
        });
        this._connect(this._settings, 'changed::start-button-custom-icon', () => {
            this._icon.gicon = this._currentGIcon();
        });
        this._connect(this._settings, 'changed::gnome-start-button-visible', () => {
            this._syncVisibility();
        });
        this._connect(this._settings, 'changed::default-gnome-panel', () => {
            this._windowsStartMenu?.close();
            this._contextMenu?.close();
            this._syncVisibility();
            this._keybindings?.sync();
        });
        this._connect(this._settings, 'changed::start-menu-super-key', () => {
            this._keybindings?.sync();
        });
        this._connect(this._settings, 'changed::start-menu-super-tab', () => {
            this._keybindings?.sync();
        });
        this._connect(this._settings, 'changed::start-menu-custom-hotkey', () => {
            this._keybindings?.customAcceleratorChanged();
        });
        this._connect(
            this._settings,
            'changed::super-e-file-manager-enabled',
            () => this._keybindings?.sync()
        );
        this._connect(this._settings, 'changed::start-menu-theme', () => {
            this._windowsStartMenu?.syncTheme();
        });
        this._connect(
            this._settings,
            'changed::start-menu-follow-panel-theme',
            () => this._windowsStartMenu?.syncTheme()
        );
        this._connect(Main.panel, 'notify::style-class', () => {
            if (this._settings.get_boolean(
                'start-menu-follow-panel-theme'
            )) {
                this._windowsStartMenu?.syncTheme();
            }
        });
    }

    _openContextMenu() {
        this._windowsStartMenu?.close();
        this._previews.hideTooltip(false);
        this._previews.hide();
        syncMenuArrowSide(this._contextMenu, this._settings);
        this._contextMenu.open(BoxPointer.PopupAnimation.FULL);
    }

    _toggleApplications() {
        if (this._windowsModeEnabled()) {
            this.toggleStartMenu();
            return;
        }

        const shellShowAppsButton =
            Main.overview.searchController?._showAppsButton;

        if (this.actor.checked) {
            this._startOpenedOverview = !Main.overview.visible;
            if (shellShowAppsButton && !shellShowAppsButton.checked)
                shellShowAppsButton.checked = true;
            Main.overview.show(OverviewControls.ControlsState.APP_GRID);
        } else if (this._startOpenedOverview) {
            this._startOpenedOverview = false;
            Main.overview.hide();
        } else {
            if (shellShowAppsButton?.checked)
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
        this._windowsStartMenu?.close();
        this._contextMenu?.close();
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

        const shellShowAppsButton =
            Main.overview.searchController?._showAppsButton;
        const applicationsActive = shellShowAppsButton?.checked ?? false;
        this.actor.checked = this._windowsModeEnabled()
            ? this._windowsStartMenu?.isOpen ?? false
            : applicationsActive;
        this._setActivitiesOverviewState(
            !applicationsActive &&
            (Main.overview._shown ?? Main.overview.visible)
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
    }

    _accessibleName() {
        return this._windowsModeEnabled() ? _('Start') : _('Applications');
    }
}
