// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const WINDOWS_XP_PANEL_HEIGHT = 30;
export const WINDOWS_XP_ICON_SIZE = 16;
export const WINDOWS_XP_ALIGNMENT = 'left';
export const DEFAULT_TASKBAR_PANEL_HEIGHT = 49;
export const DEFAULT_TASKBAR_ICON_SIZE = 32;
export const DEFAULT_TASKBAR_ALIGNMENT = 'center';

function setInteger(settings, key, value) {
    if (settings.get_int(key) !== value)
        settings.set_int(key, value);
}

function setString(settings, key, value) {
    if (settings.get_string(key) !== value)
        settings.set_string(key, value);
}

export function applyWindowsXpThemeSettings(settings) {
    setInteger(settings, 'panel-height', WINDOWS_XP_PANEL_HEIGHT);
    setInteger(settings, 'icon-size', WINDOWS_XP_ICON_SIZE);
    setString(settings, 'app-alignment', WINDOWS_XP_ALIGNMENT);
    setString(
        settings,
        'start-button-position',
        WINDOWS_XP_ALIGNMENT
    );
}

export function applyDefaultTaskbarSettings(settings) {
    setInteger(settings, 'panel-height', DEFAULT_TASKBAR_PANEL_HEIGHT);
    setInteger(settings, 'icon-size', DEFAULT_TASKBAR_ICON_SIZE);
    setString(settings, 'app-alignment', DEFAULT_TASKBAR_ALIGNMENT);
    setString(
        settings,
        'start-button-position',
        DEFAULT_TASKBAR_ALIGNMENT
    );
}

export function setWindowsXpThemeEnabled(settings, enabled) {
    if (settings.get_boolean('windows-xp-theme-enabled') !== enabled)
        settings.set_boolean('windows-xp-theme-enabled', enabled);
    if (enabled) {
        if (settings.get_boolean('default-gnome-panel'))
            settings.set_boolean('default-gnome-panel', false);
        applyWindowsXpThemeSettings(settings);
    } else {
        applyDefaultTaskbarSettings(settings);
    }
}
