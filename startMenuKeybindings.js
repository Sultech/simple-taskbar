// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SUPER_TAB_KEYBINDING = 'start-menu-super-tab-hotkey';
const CUSTOM_KEYBINDING = 'start-menu-custom-hotkey';
const SWITCH_APPLICATIONS_KEY = 'switch-applications';
const DISPLACED_BINDINGS_KEY =
    'start-menu-displaced-switch-applications';
const ACTION_MODES = Shell.ActionMode.NORMAL |
    Shell.ActionMode.OVERVIEW |
    Shell.ActionMode.POPUP;

export class StartMenuKeybindings {
    constructor(settings, toggleMenu) {
        this._settings = settings;
        this._toggleMenu = toggleMenu;
        this._wmKeybindings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.wm.keybindings',
        });
        this._displacedSwitchApplications = this._settings.get_strv(
            DISPLACED_BINDINGS_KEY
        );
        this._superTabEnabled = false;
        this._customEnabled = false;
    }

    sync() {
        if (!this._settings.get_boolean('windows-start-menu-enabled')) {
            this.disable();
            return;
        }

        if (this._settings.get_boolean('start-menu-super-tab')) {
            this._disableCustom();
            this._enableSuperTab();
            return;
        }

        this._disableSuperTab();
        if (this._settings.get_strv(CUSTOM_KEYBINDING).length > 0)
            this._enableCustom();
        else
            this._disableCustom();
    }

    customAcceleratorChanged() {
        // Mutter reads the accelerator when the binding is registered.
        this._disableCustom();
        this.sync();
    }

    disable() {
        this._disableSuperTab();
        this._disableCustom();
    }

    destroy() {
        this.disable();
        this._wmKeybindings = null;
        this._displacedSwitchApplications = null;
        this._settings = null;
        this._toggleMenu = null;
    }

    _enableSuperTab() {
        if (this._superTabEnabled)
            return;

        this._displaceSwitchApplicationsSuperTab();
        const action = Main.wm.addKeybinding(
            SUPER_TAB_KEYBINDING,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            ACTION_MODES,
            () => this._toggleMenu()
        );
        this._superTabEnabled = action !== Meta.KeyBindingAction.NONE;
        if (!this._superTabEnabled) {
            this._restoreSwitchApplicationsSuperTab();
            console.warn('Simple Taskbar: Super+Tab Start menu shortcut could not be registered');
        }
    }

    _disableSuperTab() {
        if (this._superTabEnabled)
            Main.wm.removeKeybinding(SUPER_TAB_KEYBINDING);
        this._superTabEnabled = false;
        this._restoreSwitchApplicationsSuperTab();
    }

    _displaceSwitchApplicationsSuperTab() {
        const accelerators = this._wmKeybindings.get_strv(
            SWITCH_APPLICATIONS_KEY
        );
        const retained = [];
        for (const accelerator of accelerators) {
            if (accelerator.replaceAll(' ', '').toLowerCase() === '<super>tab') {
                if (!this._displacedSwitchApplications.includes(accelerator))
                    this._displacedSwitchApplications.push(accelerator);
            } else {
                retained.push(accelerator);
            }
        }

        if (this._displacedSwitchApplications.length > 0) {
            // Save recovery state first so a Shell crash cannot permanently
            // remove the user's original app-switcher accelerator.
            this._settings.set_strv(
                DISPLACED_BINDINGS_KEY,
                this._displacedSwitchApplications
            );
            this._wmKeybindings.set_strv(
                SWITCH_APPLICATIONS_KEY,
                retained
            );
        }
    }

    _restoreSwitchApplicationsSuperTab() {
        if (this._displacedSwitchApplications.length === 0)
            return;

        const accelerators = this._wmKeybindings.get_strv(
            SWITCH_APPLICATIONS_KEY
        );
        for (const accelerator of this._displacedSwitchApplications) {
            if (!accelerators.includes(accelerator))
                accelerators.push(accelerator);
        }
        this._wmKeybindings.set_strv(
            SWITCH_APPLICATIONS_KEY,
            accelerators
        );
        this._settings.set_strv(DISPLACED_BINDINGS_KEY, []);
        this._displacedSwitchApplications = [];
    }

    _enableCustom() {
        if (this._customEnabled)
            return;

        const action = Main.wm.addKeybinding(
            CUSTOM_KEYBINDING,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            ACTION_MODES,
            () => this._toggleMenu()
        );
        this._customEnabled = action !== Meta.KeyBindingAction.NONE;
        if (!this._customEnabled)
            console.warn('Simple Taskbar: custom Start menu shortcut could not be registered');
    }

    _disableCustom() {
        if (!this._customEnabled)
            return;

        Main.wm.removeKeybinding(CUSTOM_KEYBINDING);
        this._customEnabled = false;
    }
}
