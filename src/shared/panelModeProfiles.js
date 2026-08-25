// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import {
    DEFAULT_PANEL_ITEM_ORDER,
    normalizePanelItemOrder,
} from './panelItemOrder.js';
import {applyDefaultTaskbarSettings} from './taskbarDefaults.js';
import {
    setInteger,
    setString,
    setStringArray,
} from './settingsUtils.js';
import {
    applyWindowsXpThemeAppearance,
    applyWindowsXpThemeBehaviorDefaults,
    applyWindowsXpThemeSettings,
    WINDOWS_XP_COMBINE_MODE,
} from './windowsXpTheme.js';

export const PANEL_MODE_TASKBAR = 'taskbar';
export const PANEL_MODE_DEFAULT = 'default-panel';
export const PANEL_MODE_WINDOWS_XP = 'windows-xp';

const XP_PREVIOUS_DOCK_MODE = 'dock';

const PANEL_AXIS_HORIZONTAL = 'horizontal';
const PANEL_AXIS_VERTICAL = 'vertical';

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

const AXIS_PROFILE_KEYS = new Map([
    [`${PANEL_MODE_TASKBAR}:${PANEL_AXIS_HORIZONTAL}`, {
        settings: 'taskbar-horizontal-settings',
        saved: 'taskbar-horizontal-settings-saved',
    }],
    [`${PANEL_MODE_TASKBAR}:${PANEL_AXIS_VERTICAL}`, {
        settings: 'taskbar-vertical-settings',
        saved: 'taskbar-vertical-settings-saved',
    }],
    [`${PANEL_MODE_DEFAULT}:${PANEL_AXIS_HORIZONTAL}`, {
        settings: 'default-panel-horizontal-settings',
        saved: 'default-panel-horizontal-settings-saved',
    }],
    [`${PANEL_MODE_DEFAULT}:${PANEL_AXIS_VERTICAL}`, {
        settings: 'default-panel-vertical-settings',
        saved: 'default-panel-vertical-settings-saved',
    }],
]);

const MODE_SETTING_KEYS = new Set([
    'active-panel-axis',
    'active-panel-mode',
    'default-gnome-panel',
    'dock-item-order',
    'dock-mode',
    'dock-mode-initialized',
    'dock-autohide-enabled',
    'dock-dodge-windows-enabled',
    'dock-dodge-windows-mode',
    'dock-dodge-pointer-reveal-enabled',
    'dock-edge-reveal-enabled',
    'dock-multi-monitor-panels',
    'dock-max-length',
    'dock-min-icon-size',
    'dock-transparency-enabled',
    'dock-transparency-level',
    'dock-custom-panel-color-enabled',
    'dock-custom-panel-color',
    'dock-panel-theme-follow-system',
    'dock-panel-theme',
    'dock-panel-border-enabled',
    'dock-panel-border-light-enabled',
    'dock-workspace-scroll-enabled',
    'dock-workspace-scroll-delay',
    'dock-panel-mode',
    'dock-position',
    'panel-axis-profiles-initialized',
    'panel-mode-profiles-initialized',
    'panel-profile-transition',
    'windows-xp-theme-enabled',
    'windows-xp-previous-mode',
]);
for (const profile of PROFILE_KEYS.values()) {
    MODE_SETTING_KEYS.add(profile.settings);
    MODE_SETTING_KEYS.add(profile.saved);
}
for (const profile of AXIS_PROFILE_KEYS.values()) {
    MODE_SETTING_KEYS.add(profile.settings);
    MODE_SETTING_KEYS.add(profile.saved);
}

function getPanelAxis(settings) {
    const position = settings.get_string('panel-position');
    return position === 'left' || position === 'right'
        ? PANEL_AXIS_VERTICAL
        : PANEL_AXIS_HORIZONTAL;
}

function axisProfile(mode, axis) {
    return AXIS_PROFILE_KEYS.get(`${mode}:${axis}`);
}

function getRequestedPanelMode(settings) {
    if (settings.get_boolean('windows-xp-theme-enabled'))
        return PANEL_MODE_WINDOWS_XP;
    if (settings.get_boolean('default-gnome-panel'))
        return PANEL_MODE_DEFAULT;
    return PANEL_MODE_TASKBAR;
}

function getModeBeforeWindowsXp(settings) {
    const mode = settings.get_string('active-panel-mode');
    if (mode === PANEL_MODE_DEFAULT &&
        settings.get_boolean('dock-mode')) {
        return XP_PREVIOUS_DOCK_MODE;
    }
    return mode;
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

function savePanelAxisSettings(settings, mode, axis) {
    const profile = axisProfile(mode, axis);
    const values = {};
    for (const key of settings.settings_schema.list_keys()) {
        if (MODE_SETTING_KEYS.has(key) || key === 'panel-position')
            continue;
        const value = settings.get_user_value(key);
        if (value)
            values[key] = value;
    }
    settings.set_value(profile.settings, new GLib.Variant('a{sv}', values));
    settings.set_boolean(profile.saved, true);
}

function restorePanelAxisSettings(settings, mode, axis) {
    const profile = axisProfile(mode, axis);
    if (!settings.get_boolean(profile.saved))
        return false;

    const values = settings.get_value(profile.settings).deepUnpack();
    for (const key of settings.settings_schema.list_keys()) {
        if (MODE_SETTING_KEYS.has(key) || key === 'panel-position')
            continue;
        if (values[key])
            settings.set_value(key, values[key]);
        else
            settings.reset(key);
    }
    return true;
}

function syncActivitiesPanelItemOrder(settings, vertical) {
    const order = normalizePanelItemOrder(settings.get_strv('panel-item-order'));
    order.splice(order.indexOf('activities'), 1);
    if (vertical)
        order.splice(order.indexOf('right-box'), 0, 'activities');
    else
        order.splice(order.indexOf('left-box') + 1, 0, 'activities');
    setStringArray(settings, 'panel-item-order', order);
}

function applyInitialPanelAxisSettings(settings, mode, axis) {
    if (mode !== PANEL_MODE_TASKBAR)
        return;

    const vertical = axis === PANEL_AXIS_VERTICAL;
    setString(settings, 'app-alignment', vertical ? 'left' : 'center');
    setInteger(settings, 'icon-spacing', vertical ? 6 : 3);
    setInteger(settings, 'start-button-padding', vertical ? 8 : 3);
    setString(
        settings,
        'activities-button-position',
        vertical ? 'right' : 'left'
    );
    syncActivitiesPanelItemOrder(settings, vertical);
}

function activateRestoredPanelAxis(settings, mode) {
    const axis = getPanelAxis(settings);
    settings.set_string('active-panel-axis', axis);
    if (mode !== PANEL_MODE_WINDOWS_XP) {
        const profile = axisProfile(mode, axis);
        if (!settings.get_boolean(profile.saved))
            savePanelAxisSettings(settings, mode, axis);
    }
    settings.set_boolean('panel-axis-profiles-initialized', true);
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
    if (mode !== PANEL_MODE_DEFAULT)
        settings.set_boolean('dock-mode', false);
}

export function setPanelMode(settings, mode) {
    if (!settings.get_boolean('panel-mode-profiles-initialized'))
        initializePanelModeProfiles(settings);
    if (!settings.get_boolean('panel-axis-profiles-initialized'))
        initializePanelAxisProfiles(settings);

    const currentMode = settings.get_string('active-panel-mode');
    settings.set_boolean('panel-profile-transition', true);
    if (mode === PANEL_MODE_WINDOWS_XP &&
        currentMode !== PANEL_MODE_WINDOWS_XP) {
        settings.set_string(
            'windows-xp-previous-mode',
            getModeBeforeWindowsXp(settings)
        );
    }
    if (currentMode !== mode) {
        if (currentMode !== PANEL_MODE_WINDOWS_XP) {
            savePanelAxisSettings(
                settings,
                currentMode,
                settings.get_string('active-panel-axis')
            );
        }
        savePanelModeSettings(settings, currentMode);
        setModeFlags(settings, mode);
        if (!restorePanelModeSettings(settings, mode))
            applyInitialPanelModeSettings(settings, mode);
        settings.set_string('active-panel-mode', mode);
        activateRestoredPanelAxis(settings, mode);
    } else {
        setModeFlags(settings, mode);
    }
    settings.set_boolean('panel-profile-transition', false);
    settings.set_boolean('panel-mode-profiles-initialized', true);
}

export function restorePanelModeAfterWindowsXp(settings) {
    const previousMode = settings.get_string('windows-xp-previous-mode');
    if (previousMode === XP_PREVIOUS_DOCK_MODE) {
        setPanelMode(settings, PANEL_MODE_DEFAULT);
        settings.set_boolean('dock-mode', true);
        return;
    }

    setPanelMode(settings, previousMode);
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
    initializePanelAxisProfiles(settings);
}

export function synchronizePanelMode(settings) {
    if (settings.get_boolean('panel-profile-transition'))
        return;
    setPanelMode(settings, getRequestedPanelMode(settings));
}

export function setPanelPosition(settings, position) {
    if (!settings.get_boolean('panel-mode-profiles-initialized'))
        initializePanelModeProfiles(settings);
    if (!settings.get_boolean('panel-axis-profiles-initialized'))
        initializePanelAxisProfiles(settings);

    const mode = settings.get_string('active-panel-mode');
    const currentAxis = settings.get_string('active-panel-axis');
    settings.set_boolean('panel-profile-transition', true);
    settings.set_string('panel-position', position);
    const axis = getPanelAxis(settings);
    if (mode !== PANEL_MODE_WINDOWS_XP && currentAxis !== axis) {
        savePanelAxisSettings(settings, mode, currentAxis);
        if (!restorePanelAxisSettings(settings, mode, axis))
            applyInitialPanelAxisSettings(settings, mode, axis);
        settings.set_string('active-panel-axis', axis);
    }
    settings.set_boolean('panel-profile-transition', false);
}

export function initializePanelAxisProfiles(settings) {
    if (settings.get_boolean('panel-axis-profiles-initialized')) {
        synchronizePanelPosition(settings);
        return;
    }

    const mode = settings.get_string('active-panel-mode');
    activateRestoredPanelAxis(settings, mode);
}

export function synchronizePanelPosition(settings) {
    if (settings.get_boolean('panel-profile-transition'))
        return;
    setPanelPosition(settings, settings.get_string('panel-position'));
}
