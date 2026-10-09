// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    CLASSIC_HIGHLIGHT_SETTING_KEYS,
    CLASSIC_HIGHLIGHT_SETTINGS,
    HIGHLIGHT_LENGTH_SETTINGS,
    HIGHLIGHT_SIZE_SETTINGS,
    TASKBAR_HIGHLIGHT_STYLE,
} from './classicHighlightSettings.js';
import {MAX_HIGHLIGHT_SIZE} from './panelSizing.js';
import {
    setBoolean,
    setInteger,
    setString,
} from './settingsUtils.js';
import {applyDefaultTaskbarSettings} from './taskbarDefaults.js';

export const WINDOWS_10_PANEL_HEIGHT = 40;
export const WINDOWS_10_ICON_SIZE = 24;
export const WINDOWS_10_ICON_SPACING = 1;
export const WINDOWS_10_ICON_EDGE_PADDING = 5;
export const WINDOWS_10_ALIGNMENT = 'left';
export const WINDOWS_10_BUTTON_LENGTH = 48;
export const WINDOWS_10_INDICATOR_SIZE = 2;
export const WINDOWS_10_UNFOCUSED_INDICATOR_INSET = 4;

const LOCKED_SETTINGS = [
    ['taskbar-highlight-style', 's', TASKBAR_HIGHLIGHT_STYLE.CLASSIC],
    [CLASSIC_HIGHLIGHT_SETTINGS.borderRadius, 'i', 0],
    [HIGHLIGHT_SIZE_SETTINGS.enabled, 'b', true],
    [HIGHLIGHT_SIZE_SETTINGS.size, 'i', MAX_HIGHLIGHT_SIZE],
    [HIGHLIGHT_LENGTH_SETTINGS.enabled, 'b', true],
    [HIGHLIGHT_LENGTH_SETTINGS.size, 'i', WINDOWS_10_BUTTON_LENGTH],
    ['running-indicator-style', 's', 'metro'],
    ['running-indicator-size', 'i', WINDOWS_10_INDICATOR_SIZE],
    ['running-indicator-full-length', 'b', true],
];

const RESET_APPEARANCE_KEYS = [
    ...CLASSIC_HIGHLIGHT_SETTING_KEYS,
    'custom-indicator-colors-enabled',
    'match-icon-color',
    'focused-indicator-color',
    'unfocused-indicator-color',
    'running-indicator-reserve-enabled',
    'running-indicator-reserve-symmetrical',
    'running-indicator-reserve-size',
    'animate-appicon-hover-animation-type',
    'custom-panel-color-enabled',
    'custom-panel-color',
    'custom-panel-gradient-enabled',
    'custom-panel-gradient-color',
    'custom-panel-gradient-direction',
    'transparency-level',
    'panel-theme',
    'progress-bar-follow-indicator-colors',
    'progress-bar-color',
    'progress-bar-automatic-thickness',
    'progress-bar-thickness',
    'show-desktop-button-width',
    'show-desktop-button-invisible',
    'show-desktop-button-custom-line-color-enabled',
    'show-desktop-button-custom-line-color',
];

const SETTERS = {
    s: setString,
    i: setInteger,
    b: setBoolean,
};

export const WINDOWS_10_LOCKED_SETTING_KEYS = Object.freeze(
    LOCKED_SETTINGS.map(([key]) => key)
);

export function windows10IndicatorInset(buttonLength) {
    return Math.round(
        buttonLength * WINDOWS_10_UNFOCUSED_INDICATOR_INSET /
            WINDOWS_10_BUTTON_LENGTH
    );
}

export function applyWindows10ThemeSettings(settings) {
    for (const [key, type, value] of LOCKED_SETTINGS)
        SETTERS[type](settings, key, value);
}

export function applyWindows10ThemeDefaults(settings) {
    for (const key of RESET_APPEARANCE_KEYS)
        settings.reset(key);
    applyDefaultTaskbarSettings(settings);
    setInteger(settings, 'icon-edge-padding', WINDOWS_10_ICON_EDGE_PADDING);
    setInteger(settings, 'icon-size', WINDOWS_10_ICON_SIZE);
    setInteger(settings, 'panel-height', WINDOWS_10_PANEL_HEIGHT);
    setInteger(settings, 'icon-spacing', WINDOWS_10_ICON_SPACING);
    setString(settings, 'app-alignment', WINDOWS_10_ALIGNMENT);
    setString(settings, 'start-button-position', WINDOWS_10_ALIGNMENT);
    setString(settings, 'running-indicator-position', 'bottom');
    setString(settings, 'start-button-custom-icon', 'builtin:ten');
    setInteger(settings, 'start-button-padding', 0);
    setBoolean(settings, 'transparency-enabled', false);
    setBoolean(settings, 'activities-button-visible', false);
    applyWindows10ThemeSettings(settings);
}
