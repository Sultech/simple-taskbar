// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    dockFloatingPanelReserve,
    dockPanelModeHeight,
} from '../shared/panelSizing.js';
import {AUTO_HIDE_SETTINGS, DOCK_AUTO_HIDE_SETTINGS} from '../shared/autoHideSettings.js';
import {CachedSettings} from '../shared/remappedSettings.js';

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
    ['taskbar-floating-gap', 'dock-floating-gap'],
    ['taskbar-side-padding', 'dock-side-padding'],
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
    ...Object.keys(AUTO_HIDE_SETTINGS).map(name =>
        [AUTO_HIDE_SETTINGS[name], DOCK_AUTO_HIDE_SETTINGS[name]]),
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

export class DockPanelSettings extends CachedSettings {
    constructor(settings) {
        super(settings);
        this._runtimeIconSize = null;
        this.isDock = true;
    }

    _settingKey(key) {
        return DOCK_SETTING_KEYS.get(key) ?? key;
    }

    _settingSignals(signal) {
        if (!signal.startsWith('changed::'))
            return [signal];

        const sourceKeys = DOCK_COMPUTED_SETTING_KEYS.get(
            signal.slice('changed::'.length)
        );
        if (!sourceKeys)
            return [this._settingSignal(signal)];

        return sourceKeys.map(sourceKey => `changed::${sourceKey}`);
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
        return super.get_boolean(key);
    }

    get_string(key) {
        if ((key === 'app-alignment' ||
            key === 'start-button-position') &&
            !this.get_boolean('dock-panel-mode')) {
            return 'center';
        }

        return super.get_string(key);
    }

    get_int(key) {
        if (key === 'icon-size' && this._runtimeIconSize !== null)
            return this._runtimeIconSize;

        return super.get_int(key);
    }

    _computeInt(key) {
        if (key === 'panel-height') {
            const iconSize = this.get_int('icon-size');
            if (!this._settings.get_boolean('dock-panel-mode'))
                return iconSize + dockFloatingPanelReserve(this);

            return dockPanelModeHeight(this._settings, iconSize);
        }

        return super._computeInt(key);
    }
}
