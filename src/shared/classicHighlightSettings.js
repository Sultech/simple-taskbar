// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const TASKBAR_HIGHLIGHT_STYLE = Object.freeze({
    GLASS: 'glass',
    CLASSIC: 'classic',
});

export const CLASSIC_HIGHLIGHT_SETTINGS = Object.freeze({
    hoverEnabled: 'classic-highlight-appicon-hover',
    hoverColor: 'classic-highlight-appicon-hover-background-color',
    pressedColor: 'classic-highlight-appicon-pressed-background-color',
    borderRadius: 'classic-highlight-appicon-hover-border-radius',
    focusEnabled: 'classic-focus-highlight',
    focusDominant: 'classic-focus-highlight-dominant',
    focusColor: 'classic-focus-highlight-color',
    focusOpacity: 'classic-focus-highlight-opacity',
});

export const CLASSIC_HIGHLIGHT_SETTING_KEYS = Object.freeze(
    Object.values(CLASSIC_HIGHLIGHT_SETTINGS)
);

export const TASKBAR_HIGHLIGHT_SETTING_KEYS = Object.freeze([
    'taskbar-highlight-style',
    ...CLASSIC_HIGHLIGHT_SETTING_KEYS,
]);
