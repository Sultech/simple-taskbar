// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelArrowSide} from './panelPosition.js';

export class StartMenuPowerController {
    constructor(settings, {closeMenu, applyTheme}) {
        this._settings = settings;
        this._closeMenu = closeMenu;
        this._applyTheme = applyTheme;
        this._systemActions = SystemActions.getDefault();
        this._button = null;
        this._menu = null;
        this._menuManager = null;
        this._actionIdleId = 0;
        this._sourcePressWasOpen = false;
        this._sourcePressResetId = 0;
    }

    get button() {
        return this._button;
    }

    get isOpen() {
        return Boolean(this._menu);
    }

    setButton(button) {
        this._button = button;
        this.syncVisibility();
    }

    toggle() {
        if (this._sourcePressWasOpen) {
            this._sourcePressWasOpen = false;
            this.close();
            return;
        }

        if (this._menu) {
            this.close();
            return;
        }

        this._open();
    }

    markSourcePress() {
        this._sourcePressWasOpen = true;
        if (this._sourcePressResetId)
            GLib.Source.remove(this._sourcePressResetId);
        this._sourcePressResetId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._sourcePressResetId = 0;
                this._sourcePressWasOpen = false;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    syncVisibility() {
        const enabled = this._settings.get_boolean(
            'start-menu-power-options-enabled'
        );
        this._button.visible = enabled;
        if (!enabled)
            this.close();
    }

    syncTheme() {
        if (this._menu)
            this._applyTheme(this._menu.actor);
    }

    close() {
        const menu = this._menu;
        this._menu = null;
        this._menuManager = null;
        if (menu)
            menu.destroy();
    }

    destroy() {
        if (this._sourcePressResetId) {
            GLib.Source.remove(this._sourcePressResetId);
            this._sourcePressResetId = 0;
        }
        if (this._actionIdleId) {
            GLib.Source.remove(this._actionIdleId);
            this._actionIdleId = 0;
        }
        this.close();
        this._button = null;
        this._systemActions = null;
        this._applyTheme = null;
        this._closeMenu = null;
        this._settings = null;
    }

    _open() {
        this.close();

        const menu = new PopupMenu.PopupMenu(
            this._button,
            0.5,
            panelArrowSide(this._settings)
        );
        const menuManager = new PopupMenu.PopupMenuManager(this._button);

        menu.actor.add_style_class_name('simple-taskbar-windows-start-context');
        this._applyTheme(menu.actor);
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        menuManager.addMenu(menu);

        const powerItems = [
            this._addAction(
                menu,
                _('Suspend'),
                'canSuspend',
                'notify::can-suspend',
                () => this._systemActions.activateSuspend()
            ),
            this._addAction(
                menu,
                _('Restart'),
                'canRestart',
                'notify::can-restart',
                () => this._systemActions.activateRestart()
            ),
            this._addAction(
                menu,
                _('Power Off'),
                'canPowerOff',
                'notify::can-power-off',
                () => this._systemActions.activatePowerOff()
            ),
        ];
        const separator = new PopupMenu.PopupSeparatorMenuItem();
        menu.addMenuItem(separator);
        const sessionItems = [
            this._addAction(
                menu,
                _('Lock Screen'),
                'canLockScreen',
                'notify::can-lock-screen',
                () => this._systemActions.activateLockScreen()
            ),
            this._addAction(
                menu,
                _('Log Out'),
                'canLogout',
                'notify::can-logout',
                () => this._systemActions.activateLogout()
            ),
            this._addAction(
                menu,
                _('Switch User'),
                'canSwitchUser',
                'notify::can-switch-user',
                () => this._systemActions.activateSwitchUser()
            ),
        ];
        const syncSeparator = () => {
            separator.visible =
                powerItems.some(item => item.visible) &&
                sessionItems.some(item => item.visible);
        };
        for (const item of [...powerItems, ...sessionItems])
            item.connectObject('notify::visible', syncSeparator, menu.actor);
        syncSeparator();

        this._menu = menu;
        this._menuManager = menuManager;
        menu.connect('menu-closed', () => {
            if (this._menu !== menu)
                return;
            this._menu = null;
            this._menuManager = null;
            menu.destroy();
        });

        this._systemActions.forceUpdate();
        menu.open(BoxPointer.PopupAnimation.FULL);
    }

    _addAction(menu, label, property, signal, activate) {
        const item = menu.addAction(
            label,
            () => this._queueAction(activate)
        );
        const syncVisibility = () => {
            item.visible = this._systemActions[property];
        };
        this._systemActions.connectObject(signal, syncVisibility, menu.actor);
        syncVisibility();
        return item;
    }

    _queueAction(activate) {
        if (this._actionIdleId)
            return;

        this._actionIdleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._actionIdleId = 0;
                this._closeMenu();
                activate();
                return GLib.SOURCE_REMOVE;
            }
        );
    }
}
