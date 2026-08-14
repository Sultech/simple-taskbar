// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import AccountsService from 'gi://AccountsService';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as UserWidget from 'resource:///org/gnome/shell/ui/userWidget.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

export class StartMenuFooterController {
    constructor({
        appSystem,
        powerController,
        powerGIcon,
        settings,
        settingsGIcon,
        closeMenu,
        enableNavigation,
        syncButtonClasses,
    }) {
        this._appSystem = appSystem;
        this._powerController = powerController;
        this._settings = settings;
        this._closeMenu = closeMenu;
        this._enableNavigation = enableNavigation;
        this._syncButtonClasses = syncButtonClasses;
        this._defaultUserIcon = null;
        this._userAvatar = null;
        this._userNameLabel = null;
        this._user = null;
        this.actor = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-footer',
            x_expand: true,
        });

        const userBox = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-user-content',
            x_expand: true,
        });
        this._defaultUserIcon = new St.Icon({
            icon_name: 'avatar-default-symbolic',
            icon_size: 28,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._user = AccountsService.UserManager
            .get_default()
            .get_user(GLib.get_user_name());
        this._userAvatar = new UserWidget.Avatar(this._user, {
            styleClass: 'simple-taskbar-windows-start-user-avatar',
            iconSize: 28,
        });
        this._userAvatar.y_align = Clutter.ActorAlign.CENTER;
        this._userNameLabel = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._user.connectObject(
            'notify::is-loaded', () => this._syncUserDetails(),
            'changed', () => this._syncUserDetails(),
            this._userAvatar
        );
        this._syncUserDetails();
        userBox.add_child(this._defaultUserIcon);
        userBox.add_child(this._userAvatar);
        this.syncUserAvatar();
        userBox.add_child(this._userNameLabel);
        const userButton = new St.Button({
            style_class: 'simple-taskbar-windows-start-footer-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            child: userBox,
        });
        this._enableNavigation(userButton);
        userButton.connect('clicked', () => {
            this._closeMenu();
            this._openSettingsPanel('system', ['users']);
        });
        this._syncButtonClasses(userButton);

        const settingsButton = this._createIconButton(
            settingsGIcon,
            _('Settings'),
            () => {
                this._closeMenu();
                this._openSettings();
            }
        );
        const powerButton = this._createIconButton(
            powerGIcon,
            _('Power Options'),
            () => this._powerController.toggle(),
            {
                iconStyleClass:
                    'simple-taskbar-windows-start-power-icon',
            }
        );
        this.actor.add_child(userButton);
        this.actor.add_child(settingsButton);
        this.actor.add_child(powerButton);
        this._powerController.setButton(powerButton);
    }

    syncUserAvatar() {
        const showProfilePicture = this._settings.get_boolean(
            'start-menu-show-profile-picture'
        );
        this._userAvatar.visible = showProfilePicture;
        this._defaultUserIcon.visible = !showProfilePicture;
    }

    destroy() {
        this.actor.destroy();
        this._userAvatar = null;
        this._defaultUserIcon = null;
        this._userNameLabel = null;
        this._user = null;
        this.actor = null;
        this._syncButtonClasses = null;
        this._enableNavigation = null;
        this._closeMenu = null;
        this._settings = null;
        this._powerController = null;
        this._appSystem = null;
    }

    _syncUserDetails() {
        this._userAvatar.update();
        const realName = this._user.get_real_name();
        this._userNameLabel.text = realName || GLib.get_user_name();
    }

    _openSettings() {
        this._appSystem.lookup_app('org.gnome.Settings.desktop').activate();
    }

    _openSettingsPanel(panel, args = []) {
        const actionParameter = new GLib.Variant('(sav)', [
            panel,
            args.map(argument => new GLib.Variant('s', argument)),
        ]);
        const parameters = new GLib.Variant('(sava{sv})', [
            'launch-panel',
            [actionParameter],
            {},
        ]);
        Gio.DBus.session.call(
            'org.gnome.Settings',
            '/org/gnome/Settings',
            'org.freedesktop.Application',
            'ActivateAction',
            parameters,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (connection, result) => {
                connection.call_finish(result);
            }
        );
    }

    _createIconButton(iconSource, accessibleName, callback, params = {}) {
        const icon = new St.Icon({
            gicon: iconSource,
            style_class: params.iconStyleClass ?? null,
            icon_size: params.iconSize ?? 18,
        });
        const button = new St.Button({
            style_class: 'simple-taskbar-windows-start-icon-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: accessibleName,
            child: new St.Bin({
                width: 20,
                height: 20,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                child: icon,
            }),
        });
        this._enableNavigation(button);
        button.connect('clicked', callback);
        this._syncButtonClasses(button);
        return button;
    }
}
