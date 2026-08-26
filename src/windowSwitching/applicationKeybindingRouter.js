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

export class ApplicationKeybindingRouter {
    constructor(activateApp) {
        this._activateApp = activateApp;
        this._handler = this._handleBinding.bind(this);
        this._defaultHandler = Main.wm._switchToApplication.bind(Main.wm);
    }

    enable() {
        for (const binding of APPLICATION_BINDINGS) {
            Main.wm.setCustomKeybindingHandler(
                binding,
                ACTION_MODES,
                this._handler
            );
        }
    }

    destroy() {
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
    }

    _handleBinding(_display, _window, _event, binding) {
        const [, , , target] = binding.get_name().split('-');
        const app = AppFavorites.getAppFavorites().getFavorites()[target - 1];
        if (app)
            this._activateApp(app);
    }
}
