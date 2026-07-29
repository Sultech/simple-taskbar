// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SWITCHER_BINDINGS = [
    'switch-applications',
    'switch-applications-backward',
    'switch-windows',
    'switch-windows-backward',
    'switch-group',
    'switch-group-backward',
];
const SUPER_MASK = Clutter.ModifierType.MOD4_MASK |
    Clutter.ModifierType.SUPER_MASK;

export class SwitcherKeybindingRouter {
    constructor() {
        this._gridHandler = null;
        this._superTabHandler = null;
        this._handlerModes = Shell.ActionMode.NONE;
        this._runtimeHandler = this._handleBinding.bind(this);
        this._defaultHandler = Main.wm._startSwitcher.bind(Main.wm);
    }

    setGridHandler(handler) {
        this._gridHandler = handler;
        this._syncHandlers();
    }

    setSuperTabHandler(handler) {
        this._superTabHandler = handler;
        this._syncHandlers();
    }

    destroy() {
        this._gridHandler = null;
        this._superTabHandler = null;
        this._restoreHandlers();
        this._runtimeHandler = null;
        this._defaultHandler = null;
    }

    _syncHandlers() {
        if (!this._gridHandler && !this._superTabHandler) {
            this._restoreHandlers();
            return;
        }

        let modes = Shell.ActionMode.NORMAL;
        if (this._superTabHandler)
            modes |= Shell.ActionMode.OVERVIEW;
        this._installHandlers(modes);
    }

    _installHandlers(modes) {
        if (this._handlerModes === modes)
            return;

        for (const binding of SWITCHER_BINDINGS) {
            Main.wm.setCustomKeybindingHandler(
                binding,
                modes,
                this._runtimeHandler
            );
        }
        this._handlerModes = modes;
    }

    _restoreHandlers() {
        if (this._handlerModes === Shell.ActionMode.NONE)
            return;

        for (const binding of SWITCHER_BINDINGS) {
            Main.wm.setCustomKeybindingHandler(
                binding,
                Shell.ActionMode.NORMAL,
                this._defaultHandler
            );
        }
        this._handlerModes = Shell.ActionMode.NONE;
    }

    _handleBinding(display, window, event, binding) {
        if (this._superTabHandler && this._isSuperTab(event)) {
            this._superTabHandler();
            return;
        }
        if ((Main.actionMode & Shell.ActionMode.NORMAL) === 0)
            return;
        if (this._gridHandler) {
            this._gridHandler(display, window, event, binding);
            return;
        }
        this._defaultHandler(display, window, event, binding);
    }

    _isSuperTab(event) {
        const keysym = event.get_key_symbol();
        const isTab = keysym === Clutter.KEY_Tab ||
            keysym === Clutter.KEY_ISO_Left_Tab;
        return isTab && Boolean(event.get_state() & SUPER_MASK);
    }
}
