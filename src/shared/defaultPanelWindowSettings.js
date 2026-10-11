// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {defaultPanelWindowsEnabled} from './defaultPanelWindows.js';

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

export class DefaultPanelWindowSettings {
    constructor(settings) {
        this._settings = settings;
        this.isDefaultPanelWindows = true;
    }

    _signal(signal) {
        if (!signal.startsWith('changed::'))
            return signal;
        return `changed::${defaultPanelWindowSettingKey(signal.slice('changed::'.length))}`;
    }

    connect(signal, callback) {
        return this._settings.connect(this._signal(signal), callback);
    }

    disconnect(id) {
        this._settings.disconnect(id);
    }

    connectObject(...args) {
        const owner = args.pop();
        for (let index = 0; index < args.length; index += 2)
            args[index] = this._signal(args[index]);
        this._settings.connectObject(...args, owner);
    }

    disconnectObject(owner) {
        this._settings.disconnectObject(owner);
    }

    bind(key, object, property, flags) {
        this._settings.bind(defaultPanelWindowSettingKey(key), object, property, flags);
    }

    reset(key) {
        this._settings.reset(defaultPanelWindowSettingKey(key));
    }

    is_writable(key) {
        return this._settings.is_writable(defaultPanelWindowSettingKey(key));
    }

    get_default_value(key) {
        return this._settings.get_default_value(defaultPanelWindowSettingKey(key));
    }

    get_user_value(key) {
        return this._settings.get_user_value(defaultPanelWindowSettingKey(key));
    }

    get_boolean(key) {
        return this._settings.get_boolean(defaultPanelWindowSettingKey(key));
    }

    set_boolean(key, value) {
        this._settings.set_boolean(defaultPanelWindowSettingKey(key), value);
    }

    get_string(key) {
        return this._settings.get_string(defaultPanelWindowSettingKey(key));
    }

    set_string(key, value) {
        this._settings.set_string(defaultPanelWindowSettingKey(key), value);
    }

    get_int(key) {
        return this._settings.get_int(defaultPanelWindowSettingKey(key));
    }

    set_int(key, value) {
        this._settings.set_int(defaultPanelWindowSettingKey(key), value);
    }

    get_strv(key) {
        return this._settings.get_strv(defaultPanelWindowSettingKey(key));
    }

    set_strv(key, value) {
        this._settings.set_strv(defaultPanelWindowSettingKey(key), value);
    }

    get_value(key) {
        return this._settings.get_value(defaultPanelWindowSettingKey(key));
    }

    set_value(key, value) {
        this._settings.set_value(defaultPanelWindowSettingKey(key), value);
    }
}

export function panelApplicationSettings(settings) {
    return !settings.isDock && defaultPanelWindowsEnabled(settings)
        ? new DefaultPanelWindowSettings(settings)
        : settings;
}
