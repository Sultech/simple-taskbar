// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Shell from 'gi://Shell';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const APPLICATION_BINDINGS = [
    'switch-to-application-1',
    'switch-to-application-2',
    'switch-to-application-3',
    'switch-to-application-4',
    'switch-to-application-5',
    'switch-to-application-6',
    'switch-to-application-7',
    'switch-to-application-8',
    'switch-to-application-9',
];
const ACTION_MODES = Shell.ActionMode.NORMAL |
    Shell.ActionMode.OVERVIEW;
const ENABLED_SETTING = 'super-number-keybindings-enabled';
const DISABLED_HANDLER = () => {};

export class ApplicationKeybindingRouter {
    constructor(settings, activateApp) {
        this._settings = settings;
        this._activateApp = activateApp;
        this._handler = this._handleBinding.bind(this);
        this._defaultHandler = Main.wm._switchToApplication.bind(Main.wm);
    }

    enable() {
        this._settings.connectObject(
            `changed::${ENABLED_SETTING}`,
            () => this._sync(),
            this
        );
        this._sync();
    }

    destroy() {
        this._settings.disconnectObject(this);
        for (const binding of APPLICATION_BINDINGS) {
            Main.wm.setCustomKeybindingHandler(
                binding,
                ACTION_MODES,
                this._defaultHandler
            );
        }
        this._defaultHandler = null;
        this._handler = null;
        this._activateApp = null;
        this._settings = null;
    }

    _sync() {
        const handler = this._settings.get_boolean(ENABLED_SETTING)
            ? this._handler
            : DISABLED_HANDLER;
        for (const binding of APPLICATION_BINDINGS) {
            Main.wm.setCustomKeybindingHandler(
                binding,
                ACTION_MODES,
                handler
            );
        }
    }

    _handleBinding(_display, _window, _event, binding) {
        const [, , , target] = binding.get_name().split('-');
        const app = AppFavorites.getAppFavorites().getFavorites()[target - 1];
        if (app)
            this._activateApp(app);
    }
}
