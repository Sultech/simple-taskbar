// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {GridAltTabPopup} from './gridAltTabPopup.js';
import {
    KEYBINDING_RELEASE_DELAY,
    SystemKeybindingClaim,
} from './systemKeybindingClaim.js';

const FORWARD_BINDING = 'grid-alt-tab-hotkey';
const BACKWARD_BINDING = 'grid-alt-tab-backward-hotkey';
const DISPLACED_BINDINGS_KEY = 'grid-alt-tab-displaced-bindings';

export class GridAltTabController {
    constructor(settings) {
        this._settings = settings;
        this._settingChangedId = 0;
        this._registrationId = 0;
        this._keybindingClaim = new SystemKeybindingClaim(
            settings,
            DISPLACED_BINDINGS_KEY,
            () => this._queueBindingRegistration()
        );
        this._forwardAction = Meta.KeyBindingAction.NONE;
        this._backwardAction = Meta.KeyBindingAction.NONE;
        this._popup = null;
        this._windowOrder = [];
    }

    enable() {
        this._settingChangedId = this._settings.connect(
            'changed::grid-alt-tab-enabled',
            () => this._sync()
        );
        this._sync();
    }

    destroy() {
        if (this._settingChangedId) {
            this._settings.disconnect(this._settingChangedId);
            this._settingChangedId = 0;
        }
        this._closePopup();
        this._disableBindings();
        this._keybindingClaim.destroy();
        this._keybindingClaim = null;
        this._windowOrder = null;
        this._settings = null;
    }

    _sync() {
        this._closePopup();
        if (this._settings.get_boolean('grid-alt-tab-enabled'))
            this._enableBindings();
        else
            this._disableBindings();
    }

    _enableBindings() {
        if (this._forwardAction !== Meta.KeyBindingAction.NONE ||
            this._registrationId) {
            return;
        }

        const waitForRelease = this._keybindingClaim.enable([
            ...this._settings.get_strv(FORWARD_BINDING),
            ...this._settings.get_strv(BACKWARD_BINDING),
        ]);
        if (waitForRelease) {
            this._queueBindingRegistration();
            return;
        }
        this._registerBindings();
    }

    _queueBindingRegistration() {
        this._removeRegisteredBindings();
        if (this._registrationId) {
            GLib.Source.remove(this._registrationId);
            this._registrationId = 0;
        }
        this._registrationId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            KEYBINDING_RELEASE_DELAY,
            () => {
                this._registrationId = 0;
                if (this._settings.get_boolean(
                    'grid-alt-tab-enabled'
                )) {
                    this._registerBindings();
                } else {
                    this._keybindingClaim.disable();
                }
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _registerBindings() {
        this._forwardAction = Main.wm.addKeybinding(
            FORWARD_BINDING,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            this._startSwitcher.bind(this, false)
        );
        this._backwardAction = Main.wm.addKeybinding(
            BACKWARD_BINDING,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            this._startSwitcher.bind(this, true)
        );

        if (this._forwardAction === Meta.KeyBindingAction.NONE ||
            this._backwardAction === Meta.KeyBindingAction.NONE) {
            console.warn(
                'Simple Taskbar: Grid Alt-Tab shortcuts could not be registered'
            );
            this._disableBindings();
            this._settings.set_boolean('grid-alt-tab-enabled', false);
        }
    }

    _disableBindings() {
        if (this._registrationId) {
            GLib.Source.remove(this._registrationId);
            this._registrationId = 0;
        }
        this._removeRegisteredBindings();
        this._keybindingClaim.disable();
    }

    _removeRegisteredBindings() {
        if (this._forwardAction !== Meta.KeyBindingAction.NONE)
            Main.wm.removeKeybinding(FORWARD_BINDING);
        if (this._backwardAction !== Meta.KeyBindingAction.NONE)
            Main.wm.removeKeybinding(BACKWARD_BINDING);
        this._forwardAction = Meta.KeyBindingAction.NONE;
        this._backwardAction = Meta.KeyBindingAction.NONE;
    }

    _startSwitcher(backward, _display, _window, _event, binding) {
        this._closePopup();

        let popup;
        popup = new GridAltTabPopup(
            this._getSwitcherWindows(),
            this._settings.get_int('grid-alt-tab-max-card-size'),
            this._forwardAction,
            this._backwardAction,
            () => {
                if (this._popup === popup)
                    this._popup = null;
            }
        );
        this._popup = popup;

        if (!popup.show(
            backward,
            binding.get_name(),
            binding.get_mask()
        )) {
            popup.destroy();
        }
    }

    _getSwitcherWindows() {
        const workspace = this._settings.get_boolean(
            'grid-alt-tab-isolate-workspaces'
        )
            ? global.workspace_manager.get_active_workspace()
            : null;
        const tabList = global.display.get_tab_list(
            Meta.TabList.NORMAL_ALL,
            workspace
        );
        const windows = tabList
            .map(window =>
                window.is_attached_dialog()
                    ? window.get_transient_for()
                    : window)
            .filter((window, index, allWindows) =>
                !window.skip_taskbar &&
                allWindows.indexOf(window) === index);
        const currentWindows = new Set(windows);
        const orderIsCurrent =
            windows.length === this._windowOrder.length &&
            this._windowOrder.every(window =>
                currentWindows.has(window));

        if (orderIsCurrent)
            return [...this._windowOrder];

        if (windows.length > 1)
            windows.push(windows.shift());
        this._windowOrder = windows;
        return [...this._windowOrder];
    }

    _closePopup() {
        if (!this._popup)
            return;

        const popup = this._popup;
        this._popup = null;
        popup.destroy();
    }

}
