// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    applyWindowsXpThemeAppearance,
    applyWindowsXpThemeSettings,
    WINDOWS_XP_ICON_SPACING,
    WINDOWS_XP_ICON_SIZE,
    WINDOWS_XP_PANEL_HEIGHT,
} from '../shared/windowsXpTheme.js';

const LOCKED_SETTING_KEYS = [
    'panel-button-padding',
    'app-alignment',
    'start-button-position',
    'use-pinned-apps-as-launchers',
    'hide-unpinned-taskbar-apps',
    'show-pinned-app-separator',
    'show-location-separator',
    'show-start-button-separator',
    'start-menu-running-indicators',
    'combine-app-buttons-mode',
    'application-overflow-enabled',
    'hide-app-labels',
    'animate-appicon-hover-animation-type',
    'custom-indicator-colors-enabled',
    'match-icon-color',
    'custom-panel-color-enabled',
    'activities-button-position',
    'panel-border-enabled',
    'panel-border-light-enabled',
    'panel-position',
    'clock-position',
    'clock-visible',
    'system-menu-position',
    'transparency-enabled',
    'start-menu-follow-panel-transparency',
    'start-menu-super-key',
    'show-desktop-button-position',
    'windows-start-menu-enabled',
    'folder-menu-position',
    'panel-item-order',
];

const LOCKED_INTEGER_SETTINGS = {
    'icon-size': WINDOWS_XP_ICON_SIZE,
    'icon-spacing': WINDOWS_XP_ICON_SPACING,
    'panel-height': WINDOWS_XP_PANEL_HEIGHT,
};

export class WindowsXpThemeController {
    constructor(settings) {
        this._settings = settings;
    }

    applySettings() {
        applyWindowsXpThemeAppearance(this._settings);
        applyWindowsXpThemeSettings(this._settings);
    }

    enable() {
        for (const key of LOCKED_SETTING_KEYS) {
            this._settings.connectObject(`changed::${key}`, () => {
                if (this._settings.get_boolean('windows-xp-theme-enabled'))
                    applyWindowsXpThemeSettings(this._settings);
            }, this);
        }
    }

    enforceIntegerSetting(key) {
        if (!this._settings.get_boolean('windows-xp-theme-enabled'))
            return false;

        const value = LOCKED_INTEGER_SETTINGS[key];
        if (this._settings.get_int(key) === value)
            return false;

        this._settings.set_int(key, value);
        return true;
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._settings = null;
    }
}
