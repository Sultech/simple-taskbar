// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

const MODE_SETTING_KEYS = new Set([
    'default-gnome-panel',
    'taskbar-mode-settings',
    'taskbar-mode-settings-saved',
    'windows-xp-theme-enabled',
]);

export function saveTaskbarModeSettings(settings) {
    if (settings.get_boolean('taskbar-mode-settings-saved'))
        return;

    const values = {};
    for (const key of settings.settings_schema.list_keys()) {
        if (MODE_SETTING_KEYS.has(key))
            continue;
        const value = settings.get_user_value(key);
        if (value)
            values[key] = value;
    }
    settings.set_value(
        'taskbar-mode-settings',
        new GLib.Variant('a{sv}', values)
    );
    settings.set_boolean('taskbar-mode-settings-saved', true);
}

export function restoreTaskbarModeSettings(settings) {
    if (!settings.get_boolean('taskbar-mode-settings-saved'))
        return false;

    const values = settings.get_value('taskbar-mode-settings').deepUnpack();
    for (const key of settings.settings_schema.list_keys()) {
        if (MODE_SETTING_KEYS.has(key))
            continue;
        if (values[key])
            settings.set_value(key, values[key]);
        else
            settings.reset(key);
    }
    settings.reset('taskbar-mode-settings');
    settings.reset('taskbar-mode-settings-saved');
    return true;
}
