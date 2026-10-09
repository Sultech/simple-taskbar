// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {synchronizePanelMode} from './shared/panelModeProfiles.js';
import {
    applyWindows10ThemeSettings,
    WINDOWS_10_LOCKED_SETTING_KEYS,
} from './shared/windows10Theme.js';

export class Windows10ModeController {
    constructor(settings) {
        this._settings = settings;
    }

    enable() {
        this._settings.connectObject(
            'changed::windows-10-theme-enabled',
            () => {
                synchronizePanelMode(this._settings);
                this._applyLockedSettings();
            },
            this
        );
        for (const key of WINDOWS_10_LOCKED_SETTING_KEYS) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this._applyLockedSettings(),
                this
            );
        }
        this._applyLockedSettings();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._settings = null;
    }

    _applyLockedSettings() {
        if (this._settings.get_boolean('windows-10-theme-enabled'))
            applyWindows10ThemeSettings(this._settings);
    }
}
