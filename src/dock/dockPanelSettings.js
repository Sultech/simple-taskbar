// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {ICON_VERTICAL_RESERVE} from '../shared/panelSizing.js';

const DOCK_SETTING_KEYS = new Map([
    ['transparency-enabled', 'dock-transparency-enabled'],
    ['transparency-level', 'dock-transparency-level'],
    ['custom-panel-color-enabled', 'dock-custom-panel-color-enabled'],
    ['custom-panel-color', 'dock-custom-panel-color'],
    ['panel-theme-follow-system', 'dock-panel-theme-follow-system'],
    ['panel-theme', 'dock-panel-theme'],
    ['panel-border-enabled', 'dock-panel-border-enabled'],
    ['panel-border-light-enabled', 'dock-panel-border-light-enabled'],
    ['panel-autohide-enabled', 'dock-autohide-enabled'],
    ['multi-monitor-panels', 'dock-multi-monitor-panels'],
    ['workspace-scroll-enabled', 'dock-workspace-scroll-enabled'],
    ['workspace-scroll-delay', 'dock-workspace-scroll-delay'],
]);

function dockSettingKey(key) {
    return DOCK_SETTING_KEYS.get(key) ?? key;
}

function remapSettingSignal(signal) {
    if (!signal.startsWith('changed::'))
        return signal;

    const key = signal.slice('changed::'.length);
    return `changed::${dockSettingKey(key)}`;
}

function remapSettingArguments(args) {
    return args.map(arg => typeof arg === 'string'
        ? remapSettingSignal(arg)
        : arg);
}

export class DockPanelSettings {
    constructor(settings) {
        this._settings = settings;
        this.isDock = true;
    }

    get_boolean(key) {
        if (key === 'default-gnome-panel') {
            return false;
        }
        return this._settings.get_boolean(dockSettingKey(key));
    }

    get_string(key) {
        if (key === 'panel-position')
            return this._settings.get_string('dock-position');
        if (key === 'app-alignment' &&
            !this._settings.get_boolean('dock-panel-mode')) {
            return 'center';
        }

        return this._settings.get_string(dockSettingKey(key));
    }

    get_int(...args) {
        if (args[0] === 'panel-height') {
            return this._settings.get_int('icon-size') +
                ICON_VERTICAL_RESERVE;
        }

        return this._settings.get_int(
            dockSettingKey(args[0]),
            ...args.slice(1)
        );
    }

    get_strv(...args) {
        if (args[0] === 'panel-item-order')
            return this._settings.get_strv('dock-item-order');

        return this._settings.get_strv(
            dockSettingKey(args[0]),
            ...args.slice(1)
        );
    }

    set_boolean(...args) {
        return this._settings.set_boolean(
            dockSettingKey(args[0]),
            ...args.slice(1)
        );
    }

    set_int(...args) {
        return this._settings.set_int(
            dockSettingKey(args[0]),
            ...args.slice(1)
        );
    }

    set_string(...args) {
        return this._settings.set_string(
            dockSettingKey(args[0]),
            ...args.slice(1)
        );
    }

    set_strv(...args) {
        return this._settings.set_strv(
            dockSettingKey(args[0]),
            ...args.slice(1)
        );
    }

    is_writable(...args) {
        return this._settings.is_writable(
            dockSettingKey(args[0]),
            ...args.slice(1)
        );
    }

    connect(...args) {
        return this._settings.connect(
            remapSettingSignal(args[0]),
            ...args.slice(1)
        );
    }

    disconnect(...args) {
        return this._settings.disconnect(...args);
    }

    connectObject(...args) {
        return this._settings.connectObject(
            ...remapSettingArguments(args)
        );
    }

    disconnectObject(...args) {
        return this._settings.disconnectObject(...args);
    }
}
