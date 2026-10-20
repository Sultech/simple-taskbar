// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {defaultPanelWindowsEnabled} from './defaultPanelWindows.js';
import {CachedSettings, RemappedSettings} from './remappedSettings.js';

export const DEFAULT_PANEL_WINDOW_SETTING_KEYS = Object.freeze([
    'app-alignment',
    'icon-size',
    'icon-spacing',
    'icon-edge-padding',
    'group-apps-label-font-size',
    'group-apps-label-font-weight',
    'group-apps-label-max-width',
    'group-apps-use-fixed-width',
    'combine-app-buttons-mode',
    'running-indicator-position',
    'running-indicator-style',
    'running-indicator-size',
    'running-indicator-full-length',
    'custom-indicator-colors-enabled',
    'match-icon-color',
    'focused-indicator-color',
    'unfocused-indicator-color',
    'running-indicator-reserve-enabled',
    'running-indicator-reserve-symmetrical',
    'running-indicator-reserve-size',
    'taskbar-highlight-style',
    'taskbar-highlight-size-enabled',
    'taskbar-highlight-size',
    'classic-highlight-appicon-hover',
    'classic-highlight-appicon-hover-background-color',
    'classic-highlight-appicon-pressed-background-color',
    'classic-highlight-appicon-hover-border-radius',
    'classic-focus-highlight',
    'classic-focus-highlight-dominant',
    'classic-focus-highlight-color',
    'classic-focus-highlight-opacity',
    'animate-appicon-hover-animation-type',
    'animate-appicon-hover-animation-duration',
    'animate-appicon-hover-animation-rotation',
    'animate-appicon-hover-animation-travel',
    'animate-appicon-hover-animation-zoom',
    'animate-appicon-hover-animation-convexity',
    'animate-appicon-hover-animation-extent',
    'application-click-animation',
    'application-click-action',
    'shift-click-action',
    'ctrl-click-action',
    'middle-click-action',
    'shift-middle-click-action',
    'scroll-icon-action',
    'scroll-icon-delay',
    'scroll-icon-follow-panel-delay',
    'application-hover-action',
    'show-window-previews-timeout',
    'leave-timeout',
    'peek-mode',
    'enter-peek-mode-timeout',
    'peek-mode-opacity',
    'preview-middle-click-close',
    'show-notification-badges',
    'show-progress-bars',
    'progress-bar-follow-indicator-colors',
    'progress-bar-color',
    'progress-bar-automatic-thickness',
    'progress-bar-thickness',
    'application-overflow-enabled',
    'application-overflow-style',
    'isolate-monitors',
    'isolate-workspaces',
]);

const WINDOW_SETTING_KEYS = new Set(DEFAULT_PANEL_WINDOW_SETTING_KEYS);

export function defaultPanelWindowSettingKey(key) {
    return WINDOW_SETTING_KEYS.has(key) ? `default-panel-window-${key}` : key;
}

export class DefaultPanelWindowSettings extends RemappedSettings {
    constructor(settings) {
        super(settings);
        this.isDefaultPanelWindows = true;
    }

    _settingKey(key) {
        return defaultPanelWindowSettingKey(key);
    }
}

class CachedDefaultPanelWindowSettings extends CachedSettings {
    constructor(settings) {
        super(settings);
        this.isDefaultPanelWindows = true;
    }

    _settingKey(key) {
        return defaultPanelWindowSettingKey(key);
    }
}

export function panelApplicationSettings(settings) {
    return !settings.isDock && defaultPanelWindowsEnabled(settings)
        ? new DefaultPanelWindowSettings(settings)
        : settings;
}

export function cachedPanelApplicationSettings(settings) {
    return defaultPanelWindowsEnabled(settings)
        ? new CachedDefaultPanelWindowSettings(settings)
        : new CachedSettings(settings);
}
