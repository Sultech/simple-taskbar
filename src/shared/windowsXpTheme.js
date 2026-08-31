// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    getWindowsXpPanelItemOrder,
} from './panelItemOrder.js';
import {CLICK_ACTION} from './applicationClickActions.js';
import {SCROLL_ACTION} from './applicationScrollActions.js';
import {
    setBoolean,
    setInteger,
    setString,
    setStringArray,
} from './settingsUtils.js';

export const WINDOWS_XP_PANEL_HEIGHT = 30;
export const WINDOWS_XP_ICON_SIZE = 16;
export const WINDOWS_XP_ICON_SPACING = -5;
export const WINDOWS_XP_ALIGNMENT = 'left';
export const WINDOWS_XP_COMBINE_MODE = 'when-full';
export const WINDOWS_XP_PANEL_POSITION = 'bottom';
export const WINDOWS_XP_CLOCK_POSITION = 'right';
export const WINDOWS_XP_SYSTEM_MENU_POSITION = 'right';

export function applyWindowsXpThemeAppearance(settings) {
    setBoolean(settings, 'panel-theme-follow-system', false);
    setString(settings, 'panel-theme', 'dark');
}

export function applyWindowsXpThemeBehaviorDefaults(settings) {
    setString(
        settings,
        'application-click-action',
        CLICK_ACTION.TOGGLE_SPREAD
    );
    setString(
        settings,
        'scroll-icon-action',
        SCROLL_ACTION.SWITCH_WORKSPACE
    );
    setInteger(settings, 'scroll-icon-delay', 5);
    setBoolean(settings, 'window-previews-enabled', true);
    setBoolean(settings, 'panel-autohide-enabled', false);
    setBoolean(settings, 'hot-edge-overview-enabled', true);
    setBoolean(settings, 'workspace-scroll-enabled', true);
    setBoolean(settings, 'multi-monitor-panels', true);
    setBoolean(settings, 'show-desktop-button-visible', true);
    setBoolean(settings, 'tray-overflow-enabled', true);
    setBoolean(settings, 'folder-menu-enabled', false);
    setBoolean(settings, 'panel-menu-click-only', true);
    setBoolean(settings, 'notification-banner-bottom-end', true);
    setBoolean(settings, 'nautilus-places-enabled', true);
    setBoolean(settings, 'super-e-file-manager-enabled', true);
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
    setString(
        settings,
        'tray-overflow-position',
        WINDOWS_XP_SYSTEM_MENU_POSITION
    );
    setString(
        settings,
        'folder-menu-position',
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
    setBoolean(settings, 'hide-unpinned-taskbar-apps', false);
    setBoolean(settings, 'show-pinned-app-separator', false);
    setBoolean(settings, 'show-location-separator', false);
    setBoolean(settings, 'show-start-button-separator', false);
    setBoolean(settings, 'start-menu-running-indicators', false);
    setBoolean(settings, 'windows-start-menu-enabled', true);
    setBoolean(settings, 'transparency-enabled', false);
    setBoolean(settings, 'start-menu-follow-panel-transparency', false);
    setBoolean(settings, 'start-menu-super-key', true);
    setBoolean(settings, 'custom-indicator-colors-enabled', false);
    setBoolean(settings, 'match-icon-color', false);
    setBoolean(settings, 'custom-panel-color-enabled', false);
    setBoolean(settings, 'panel-border-enabled', false);
    setBoolean(settings, 'panel-border-light-enabled', false);
    setBoolean(settings, 'application-overflow-enabled', true);
    setBoolean(settings, 'hide-app-labels', false);
    if (settings.get_string('combine-app-buttons-mode') === 'always') {
        setString(
            settings,
            'combine-app-buttons-mode',
            WINDOWS_XP_COMBINE_MODE
        );
    }
}
