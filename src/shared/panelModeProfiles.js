// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import {DEFAULT_PANEL_ITEM_ORDER} from './panelItemOrder.js';
import {applyDefaultTaskbarSettings} from './taskbarDefaults.js';
import {
    applyWindowsXpThemeAppearance,
    applyWindowsXpThemeBehaviorDefaults,
    applyWindowsXpThemeSettings,
    WINDOWS_XP_COMBINE_MODE,
} from './windowsXpTheme.js';

export const PANEL_MODE_TASKBAR = 'taskbar';
export const PANEL_MODE_DEFAULT = 'default-panel';
export const PANEL_MODE_WINDOWS_XP = 'windows-xp';

const PROFILE_KEYS = new Map([
    [PANEL_MODE_TASKBAR, {
        settings: 'taskbar-mode-settings',
        saved: 'taskbar-mode-settings-saved',
    }],
    [PANEL_MODE_DEFAULT, {
        settings: 'default-panel-mode-settings',
        saved: 'default-panel-mode-settings-saved',
    }],
    [PANEL_MODE_WINDOWS_XP, {
        settings: 'windows-xp-mode-settings',
        saved: 'windows-xp-mode-settings-saved',
    }],
]);

const MODE_SETTING_KEYS = new Set([
    'active-panel-mode',
    'default-gnome-panel',
    'panel-mode-profiles-initialized',
    'windows-xp-theme-enabled',
]);
for (const profile of PROFILE_KEYS.values()) {
    MODE_SETTING_KEYS.add(profile.settings);
    MODE_SETTING_KEYS.add(profile.saved);
}

function getRequestedPanelMode(settings) {
    if (settings.get_boolean('windows-xp-theme-enabled'))
        return PANEL_MODE_WINDOWS_XP;
    if (settings.get_boolean('default-gnome-panel'))
        return PANEL_MODE_DEFAULT;
    return PANEL_MODE_TASKBAR;
}

function savePanelModeSettings(settings, mode) {
    const profile = PROFILE_KEYS.get(mode);
    const values = {};
    for (const key of settings.settings_schema.list_keys()) {
        if (MODE_SETTING_KEYS.has(key))
            continue;
        const value = settings.get_user_value(key);
        if (value)
            values[key] = value;
    }
    settings.set_value(profile.settings, new GLib.Variant('a{sv}', values));
    settings.set_boolean(profile.saved, true);
}

function restorePanelModeSettings(settings, mode) {
    const profile = PROFILE_KEYS.get(mode);
    if (!settings.get_boolean(profile.saved))
        return false;

    const values = settings.get_value(profile.settings).deepUnpack();
    for (const key of settings.settings_schema.list_keys()) {
        if (MODE_SETTING_KEYS.has(key))
            continue;
        if (values[key])
            settings.set_value(key, values[key]);
        else
            settings.reset(key);
    }
    return true;
}

function applyDefaultPanelSettings(settings) {
    settings.set_int('panel-height', 32);
    settings.set_int('panel-button-padding', 12);
    settings.set_string('panel-position', 'top');
    settings.set_boolean('activities-button-visible', true);
    settings.set_string('activities-button-position', 'left');
    settings.set_string('clock-position', 'center');
    settings.set_string('system-menu-position', 'right');
    settings.set_string('folder-menu-position', 'right');
    settings.set_string('tray-overflow-position', 'right');
    settings.set_strv('panel-item-order', DEFAULT_PANEL_ITEM_ORDER);
    settings.set_boolean('multi-monitor-panels', true);
    settings.set_boolean('windows-start-menu-enabled', false);
    settings.set_boolean('gnome-start-button-visible', false);
    settings.set_boolean('show-desktop-button-visible', false);
    settings.set_boolean('panel-border-enabled', false);
    settings.set_boolean('panel-border-light-enabled', false);
}

function applyInitialPanelModeSettings(settings, mode) {
    if (mode === PANEL_MODE_TASKBAR) {
        applyDefaultTaskbarSettings(settings);
    } else if (mode === PANEL_MODE_DEFAULT) {
        applyDefaultPanelSettings(settings);
    } else {
        settings.set_boolean('activities-button-visible', false);
        settings.set_string(
            'combine-app-buttons-mode',
            WINDOWS_XP_COMBINE_MODE
        );
        applyWindowsXpThemeBehaviorDefaults(settings);
        applyWindowsXpThemeAppearance(settings);
        applyWindowsXpThemeSettings(settings);
    }
}

function setModeFlags(settings, mode) {
    settings.set_boolean(
        'default-gnome-panel',
        mode === PANEL_MODE_DEFAULT
    );
    settings.set_boolean(
        'windows-xp-theme-enabled',
        mode === PANEL_MODE_WINDOWS_XP
    );
}

export function setPanelMode(settings, mode) {
    if (!settings.get_boolean('panel-mode-profiles-initialized'))
        initializePanelModeProfiles(settings);

    const currentMode = settings.get_string('active-panel-mode');
    if (currentMode !== mode) {
        savePanelModeSettings(settings, currentMode);
        setModeFlags(settings, mode);
        if (!restorePanelModeSettings(settings, mode))
            applyInitialPanelModeSettings(settings, mode);
        settings.set_string('active-panel-mode', mode);
    } else {
        setModeFlags(settings, mode);
    }
    settings.set_boolean('panel-mode-profiles-initialized', true);
}

export function initializePanelModeProfiles(settings) {
    if (settings.get_boolean('panel-mode-profiles-initialized')) {
        synchronizePanelMode(settings);
        return;
    }

    const mode = getRequestedPanelMode(settings);
    savePanelModeSettings(settings, mode);
    settings.set_string('active-panel-mode', mode);
    settings.set_boolean('panel-mode-profiles-initialized', true);
}

export function synchronizePanelMode(settings) {
    setPanelMode(settings, getRequestedPanelMode(settings));
}
