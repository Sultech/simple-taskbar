// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {PANEL_BUTTON_PADDING_KEYS, START_BUTTON_LOCATION_KEY} from '../shared/panelModeSettings.js';

const PANEL_LAYOUT_KEYS = [
    'start-button-position',
    'start-button-follow-app-alignment',
    'default-panel-start-button-position',
    'default-panel-start-button-follow-app-alignment',
    'windows-start-menu-enabled',
    'gnome-start-button-visible',
    START_BUTTON_LOCATION_KEY,
    'system-menu-visible',
    'clock-visible',
    'hide-pinned-taskbar-apps',
    'hide-unpinned-taskbar-apps',
    'activities-button-position',
    'clock-position',
    'system-menu-position',
    'folder-menu-enabled',
    'folder-menu-position',
    'panel-item-order',
];

const PANEL_BACKGROUND_KEYS = [
    'transparency-enabled',
    'transparency-level',
    'transparency-on-unmaximized',
    'transparency-dynamic-behavior',
    'transparency-dynamic-distance',
    'transparency-dynamic-level',
    'transparency-dynamic-animation-time',
    'custom-panel-color-enabled',
    'custom-panel-color',
    'custom-panel-gradient-enabled',
    'custom-panel-gradient-color',
    'custom-panel-gradient-direction',
];

const PANEL_BORDER_KEYS = [
    'panel-border-enabled',
    'panel-border-light-enabled',
];

const PANEL_THEME_KEYS = [
    'panel-theme-follow-system',
    'panel-theme',
];

export function connectPanelAppearanceSignals({
    settings,
    owner,
    cornerRadiusKey,
    onBackgroundChanged,
    onBorderChanged = onBackgroundChanged,
    onThemeChanged = onBackgroundChanged,
}) {
    for (const [keys, reaction] of [
        [[...PANEL_BACKGROUND_KEYS, cornerRadiusKey], onBackgroundChanged],
        [PANEL_BORDER_KEYS, onBorderChanged],
        [PANEL_THEME_KEYS, onThemeChanged],
    ]) {
        for (const key of keys)
            settings.connectObject(`changed::${key}`, () => reaction(), owner);
    }
}

export function connectPanelSizingSignals({
    settings,
    owner,
    core,
    isDock = false,
    correctSetting = () => false,
    applyAppearance,
    applyPanelHeight,
    syncPanelHeight,
    updateWidth,
    afterPanelHeight = () => {},
}) {
    const resetForDefaultPanel = () => {
        if (settings.get_boolean('default-gnome-panel'))
            core.iconSizer.reset();
    };
    const syncIconMetrics = () => {
        resetForDefaultPanel();
        applyAppearance();
        syncPanelHeight();
        updateWidth();
    };
    const reactions = {
        'icon-spacing': syncIconMetrics,
        'icon-edge-padding': syncIconMetrics,
        'panel-height': () => {
            applyPanelHeight();
            resetForDefaultPanel();
            afterPanelHeight();
        },
    };
    if (!isDock) {
        reactions['icon-size'] = () => {
            core.iconSizer.syncMaximum();
            updateWidth();
        };
    }
    for (const [key, reaction] of Object.entries(reactions)) {
        settings.connectObject(`changed::${key}`, () => {
            if (!correctSetting(key))
                reaction();
        }, owner);
    }

    const uncorrectedReactions = {
        'show-location-separator': updateWidth,
    };
    if (!isDock) {
        uncorrectedReactions['dock-min-icon-size'] = updateWidth;
        uncorrectedReactions['panel-height-follow-icon-size'] = syncPanelHeight;
        uncorrectedReactions['taskbar-highlight-edge-gap'] = syncPanelHeight;
    }
    for (const [key, reaction] of Object.entries(uncorrectedReactions))
        settings.connectObject(`changed::${key}`, () => reaction(), owner);
}

export function connectPanelSettingsSignals({
    settings,
    owner,
    core,
    boxes,
    extraLayoutKeys,
    applyLayout,
    updateWidth,
    queueWidth,
    syncQuickSettings,
    onButtonPaddingChanged = null,
    onAppAlignmentChanged,
    syncActivitiesVisibility,
    syncVerticalItems,
}) {
    for (const box of boxes)
        box.connectObject('notify::width', queueWidth, 'notify::height', queueWidth, owner);
    core.taskbarController.actor.connectObject('child-added', updateWidth, 'child-removed', updateWidth, owner);
    settings.connectObject('changed::hide-app-labels', updateWidth, owner);
    if (onButtonPaddingChanged) {
        for (const key of PANEL_BUTTON_PADDING_KEYS) {
            settings.connectObject(`changed::${key}`, () => {
                onButtonPaddingChanged();
                updateWidth();
            }, owner);
        }
    }
    settings.connectObject(
        'changed::quick-settings-icon-spacing', syncQuickSettings,
        'changed::windows-xp-theme-enabled', syncQuickSettings,
        owner
    );
    settings.connectObject('changed::app-alignment', () => {
        onAppAlignmentChanged();
        applyLayout();
    }, owner);
    for (const key of [...PANEL_LAYOUT_KEYS, ...extraLayoutKeys])
        settings.connectObject(`changed::${key}`, applyLayout, owner);
    settings.connectObject('changed::activities-button-visible', () => {
        syncActivitiesVisibility();
        updateWidth();
    }, owner);
    settings.connectObject('changed::start-button-padding', () => {
        core.startButtonController.applyAppearance(core.iconSizer.iconSize, settings.get_int('start-button-padding'));
        syncVerticalItems();
        updateWidth();
    }, owner);
}
