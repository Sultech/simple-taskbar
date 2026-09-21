// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    dockFloatingPanelReserve,
    panelHeightForIconSize,
} from '../shared/panelSizing.js';

const DOCK_SETTING_KEYS = new Map([
    ['panel-position', 'dock-position'],
    ['panel-height', 'dock-panel-height'],
    [
        'panel-height-follow-icon-size',
        'dock-panel-height-follow-icon-size',
    ],
    ['transparency-enabled', 'dock-transparency-enabled'],
    ['transparency-level', 'dock-transparency-level'],
    [
        'transparency-on-unmaximized',
        'dock-transparency-on-unmaximized',
    ],
    [
        'transparency-dynamic-behavior',
        'dock-transparency-dynamic-behavior',
    ],
    [
        'transparency-dynamic-distance',
        'dock-transparency-dynamic-distance',
    ],
    [
        'transparency-dynamic-level',
        'dock-transparency-dynamic-level',
    ],
    [
        'transparency-dynamic-animation-time',
        'dock-transparency-dynamic-animation-time',
    ],
    ['custom-panel-color-enabled', 'dock-custom-panel-color-enabled'],
    ['custom-panel-color', 'dock-custom-panel-color'],
    ['panel-theme-follow-system', 'dock-panel-theme-follow-system'],
    ['panel-theme', 'dock-panel-theme'],
    ['panel-border-enabled', 'dock-panel-border-enabled'],
    ['panel-border-light-enabled', 'dock-panel-border-light-enabled'],
    ['panel-autohide-enabled', 'dock-autohide-enabled'],
    ['edge-reveal-enabled', 'dock-edge-reveal-enabled'],
    ['multi-monitor-panels', 'dock-multi-monitor-panels'],
    ['workspace-scroll-action', 'dock-workspace-scroll-action'],
    ['workspace-scroll-delay', 'dock-workspace-scroll-delay'],
    ['panel-item-order', 'dock-item-order'],
    ['panel-dodge-windows-enabled', 'dock-dodge-windows-enabled'],
    ['panel-dodge-windows-mode', 'dock-dodge-windows-mode'],
    [
        'custom-panel-gradient-enabled',
        'dock-custom-panel-gradient-enabled',
    ],
    [
        'custom-panel-gradient-color',
        'dock-custom-panel-gradient-color',
    ],
    [
        'custom-panel-gradient-direction',
        'dock-custom-panel-gradient-direction',
    ],
    [
        'panel-dodge-pointer-reveal-enabled',
        'dock-dodge-pointer-reveal-enabled',
    ],
]);

const DOCK_COMPUTED_SETTING_KEYS = new Map([
    [
        'panel-height',
        [
            'dock-panel-height',
            'dock-panel-height-follow-icon-size',
            'icon-edge-padding',
        ],
    ],
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

function remapSettingSignals(signal) {
    if (!signal.startsWith('changed::'))
        return [signal];

    const sourceKeys = DOCK_COMPUTED_SETTING_KEYS.get(
        signal.slice('changed::'.length)
    );
    if (!sourceKeys)
        return [remapSettingSignal(signal)];

    return sourceKeys.map(sourceKey => `changed::${sourceKey}`);
}

function remapSettingArguments(args) {
    const remapped = [];
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (typeof arg !== 'string') {
            remapped.push(arg);
            continue;
        }

        const handler = args[++index];
        for (const signal of remapSettingSignals(arg))
            remapped.push(signal, handler);
    }
    return remapped;
}

export class DockPanelSettings {
    constructor(settings) {
        this._settings = settings;
        this._runtimeIconSize = null;
        this._cache = new Map();
        this._changedId = settings.connect(
            'changed',
            () => this._cache.clear()
        );
        this.isDock = true;
    }

    destroy() {
        this._settings.disconnect(this._changedId);
        this._changedId = 0;
        this._cache.clear();
    }

    _cached(type, key, compute) {
        const cacheKey = `${type}:${key}`;
        if (this._cache.has(cacheKey))
            return this._cache.get(cacheKey);

        const value = compute();
        this._cache.set(cacheKey, value);
        return value;
    }

    getConfiguredIconSize() {
        return this._settings.get_int('icon-size');
    }

    setRuntimeIconSize(iconSize) {
        this._runtimeIconSize = iconSize;
        this._cache.clear();
    }

    get_boolean(key) {
        if (key === 'default-gnome-panel') {
            return false;
        }
        return this._cached('boolean', key, () =>
            this._settings.get_boolean(dockSettingKey(key))
        );
    }

    get_string(key) {
        if ((key === 'app-alignment' ||
            key === 'start-button-position') &&
            !this.get_boolean('dock-panel-mode')) {
            return 'center';
        }

        return this._cached('string', key, () =>
            this._settings.get_string(dockSettingKey(key))
        );
    }

    get_int(...args) {
        if (args[0] === 'icon-size' && this._runtimeIconSize !== null)
            return this._runtimeIconSize;

        if (args.length === 1) {
            return this._cached('int', args[0], () =>
                this._computeInt(args[0])
            );
        }

        return this._computeInt(...args);
    }

    _computeInt(...args) {
        if (args[0] === 'panel-height') {
            const iconSize = this.get_int('icon-size');
            if (!this._settings.get_boolean('dock-panel-mode'))
                return iconSize + dockFloatingPanelReserve(this._settings);

            const derivedHeight = panelHeightForIconSize(
                this._settings,
                iconSize
            );
            if (this._settings.get_boolean(
                'dock-panel-height-follow-icon-size'
            )) {
                return derivedHeight;
            }

            return Math.max(
                this._settings.get_int('dock-panel-height'),
                derivedHeight
            );
        }

        return this._settings.get_int(
            dockSettingKey(args[0]),
            ...args.slice(1)
        );
    }

    get_value(key) {
        return this._settings.get_value(dockSettingKey(key));
    }

    get_default_value(key) {
        return this._settings.get_default_value(dockSettingKey(key));
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
