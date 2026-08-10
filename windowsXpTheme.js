// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    DEFAULT_PANEL_ITEM_ORDER,
    getWindowsXpPanelItemOrder,
} from './panelItemOrder.js';

export const WINDOWS_XP_PANEL_HEIGHT = 30;
export const WINDOWS_XP_ICON_SIZE = 16;
export const WINDOWS_XP_ICON_SPACING = 0;
export const WINDOWS_XP_ALIGNMENT = 'left';
export const WINDOWS_XP_COMBINE_MODE = 'never';
export const WINDOWS_XP_PANEL_POSITION = 'bottom';
export const WINDOWS_XP_CLOCK_POSITION = 'right';
export const WINDOWS_XP_SYSTEM_MENU_POSITION = 'right';
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

function setStringArray(settings, key, value) {
    const current = settings.get_strv(key);
    if (current.length !== value.length ||
        current.some((item, index) => item !== value[index])) {
        settings.set_strv(key, value);
    }
}

export function applyWindowsXpThemeAppearance(settings) {
    setBoolean(settings, 'panel-theme-follow-system', false);
    setString(settings, 'panel-theme', 'dark');
}

export function applyWindowsXpThemeSettings(settings) {
    setInteger(settings, 'panel-height', WINDOWS_XP_PANEL_HEIGHT);
    setInteger(settings, 'panel-button-padding', 0);
    setInteger(settings, 'icon-size', WINDOWS_XP_ICON_SIZE);
    setInteger(settings, 'icon-spacing', WINDOWS_XP_ICON_SPACING);
    setString(settings, 'app-alignment', WINDOWS_XP_ALIGNMENT);
    setString(settings, 'panel-position', WINDOWS_XP_PANEL_POSITION);
    setString(settings, 'clock-position', WINDOWS_XP_CLOCK_POSITION);
    setString(
        settings,
        'system-menu-position',
        WINDOWS_XP_SYSTEM_MENU_POSITION
    );
    setString(settings, 'show-desktop-button-position', 'left');
    if (settings.get_string('activities-button-position') === 'center')
        setString(settings, 'activities-button-position', 'left');
    setStringArray(
        settings,
        'panel-item-order',
        getWindowsXpPanelItemOrder(
            settings.get_strv('panel-item-order'),
            settings.get_string('activities-button-position')
        )
    );
    setString(
        settings,
        'start-button-position',
        WINDOWS_XP_ALIGNMENT
    );
    setBoolean(settings, 'use-pinned-apps-as-launchers', true);
    setBoolean(settings, 'windows-start-menu-enabled', true);
    setBoolean(settings, 'start-menu-super-key', true);
    setBoolean(settings, 'custom-indicator-colors-enabled', false);
    setBoolean(settings, 'custom-panel-color-enabled', false);
    setBoolean(settings, 'panel-border-enabled', false);
    setBoolean(settings, 'panel-border-light-enabled', false);
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
    setInteger(settings, 'panel-button-padding', -1);
    setInteger(settings, 'icon-size', DEFAULT_TASKBAR_ICON_SIZE);
    setInteger(settings, 'icon-spacing', DEFAULT_TASKBAR_ICON_SPACING);
    setString(settings, 'app-alignment', DEFAULT_TASKBAR_ALIGNMENT);
    setString(settings, 'activities-button-position', 'left');
    setString(settings, 'panel-position', 'bottom');
    setString(settings, 'clock-position', 'right');
    setString(settings, 'system-menu-position', 'right');
    setString(settings, 'show-desktop-button-position', 'right');
    setStringArray(
        settings,
        'panel-item-order',
        DEFAULT_PANEL_ITEM_ORDER
    );
    setString(
        settings,
        'start-button-position',
        DEFAULT_TASKBAR_ALIGNMENT
    );
    setBoolean(settings, 'use-pinned-apps-as-launchers', false);
    setBoolean(settings, 'windows-start-menu-enabled', true);
    setBoolean(settings, 'show-desktop-button-visible', true);
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
        setBoolean(settings, 'default-gnome-panel', false);
        setBoolean(settings, 'activities-button-visible', false);
        setBoolean(settings, 'tray-overflow-enabled', true);
        applyWindowsXpThemeAppearance(settings);
        applyWindowsXpThemeSettings(settings);
    } else {
        setBoolean(settings, 'activities-button-visible', true);
        applyDefaultTaskbarSettings(settings);
    }
}
