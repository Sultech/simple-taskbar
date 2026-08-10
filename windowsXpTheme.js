// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const WINDOWS_XP_PANEL_HEIGHT = 30;
export const WINDOWS_XP_ICON_SIZE = 16;
export const DEFAULT_TASKBAR_PANEL_HEIGHT = 49;
export const DEFAULT_TASKBAR_ICON_SIZE = 32;

function setInteger(settings, key, value) {
    if (settings.get_int(key) !== value)
        settings.set_int(key, value);
}

export function applyWindowsXpThemeDimensions(settings) {
    setInteger(settings, 'panel-height', WINDOWS_XP_PANEL_HEIGHT);
    setInteger(settings, 'icon-size', WINDOWS_XP_ICON_SIZE);
}

export function applyDefaultTaskbarDimensions(settings) {
    setInteger(settings, 'panel-height', DEFAULT_TASKBAR_PANEL_HEIGHT);
    setInteger(settings, 'icon-size', DEFAULT_TASKBAR_ICON_SIZE);
}

export function setWindowsXpThemeEnabled(settings, enabled) {
    if (settings.get_boolean('windows-xp-theme-enabled') !== enabled)
        settings.set_boolean('windows-xp-theme-enabled', enabled);
    if (enabled) {
        if (settings.get_boolean('default-gnome-panel'))
            settings.set_boolean('default-gnome-panel', false);
        applyWindowsXpThemeDimensions(settings);
    } else {
        applyDefaultTaskbarDimensions(settings);
    }
}
