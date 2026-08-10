// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const WINDOWS_XP_PANEL_HEIGHT = 30;
export const WINDOWS_XP_ICON_SIZE = 16;
export const WINDOWS_XP_ICON_SPACING = 0;
export const WINDOWS_XP_ALIGNMENT = 'left';
export const WINDOWS_XP_COMBINE_MODE = 'never';
export const DEFAULT_TASKBAR_PANEL_HEIGHT = 49;
export const DEFAULT_TASKBAR_ICON_SIZE = 32;
export const DEFAULT_TASKBAR_ICON_SPACING = 3;
export const DEFAULT_TASKBAR_ALIGNMENT = 'center';
export const DEFAULT_TASKBAR_COMBINE_MODE = 'always';

function setInteger(settings, key, value) {
    if (settings.get_int(key) !== value)
        settings.set_int(key, value);
}

function setString(settings, key, value) {
    if (settings.get_string(key) !== value)
        settings.set_string(key, value);
}

function setBoolean(settings, key, value) {
    if (settings.get_boolean(key) !== value)
        settings.set_boolean(key, value);
}

export function applyWindowsXpThemeSettings(settings) {
    setInteger(settings, 'panel-height', WINDOWS_XP_PANEL_HEIGHT);
    setInteger(settings, 'icon-size', WINDOWS_XP_ICON_SIZE);
    setInteger(settings, 'icon-spacing', WINDOWS_XP_ICON_SPACING);
    setString(settings, 'app-alignment', WINDOWS_XP_ALIGNMENT);
    setString(
        settings,
        'start-button-position',
        WINDOWS_XP_ALIGNMENT
    );
    setBoolean(settings, 'use-pinned-apps-as-launchers', true);
    setBoolean(settings, 'application-overflow-enabled', true);
    setBoolean(settings, 'hide-app-labels', false);
    setString(
        settings,
        'combine-app-buttons-mode',
        WINDOWS_XP_COMBINE_MODE
    );
}

export function applyDefaultTaskbarSettings(settings) {
    setInteger(settings, 'panel-height', DEFAULT_TASKBAR_PANEL_HEIGHT);
    setInteger(settings, 'icon-size', DEFAULT_TASKBAR_ICON_SIZE);
    setInteger(settings, 'icon-spacing', DEFAULT_TASKBAR_ICON_SPACING);
    setString(settings, 'app-alignment', DEFAULT_TASKBAR_ALIGNMENT);
    setString(
        settings,
        'start-button-position',
        DEFAULT_TASKBAR_ALIGNMENT
    );
    setBoolean(settings, 'use-pinned-apps-as-launchers', false);
    setBoolean(settings, 'application-overflow-enabled', true);
    setBoolean(settings, 'hide-app-labels', false);
    setString(
        settings,
        'combine-app-buttons-mode',
        DEFAULT_TASKBAR_COMBINE_MODE
    );
}

export function setWindowsXpThemeEnabled(settings, enabled) {
    setBoolean(settings, 'windows-xp-theme-enabled', enabled);
    if (enabled) {
        if (settings.get_boolean('default-gnome-panel'))
            settings.set_boolean('default-gnome-panel', false);
        setBoolean(settings, 'activities-button-visible', false);
        applyWindowsXpThemeSettings(settings);
    } else {
        setBoolean(settings, 'activities-button-visible', true);
        applyDefaultTaskbarSettings(settings);
    }
}
