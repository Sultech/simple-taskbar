// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    initializePanelModeProfiles,
    synchronizePanelMode,
} from '../shared/panelModeProfiles.js';
import {fitIconSizeToPanelHeight, fitPanelHeightToIconSize} from '../shared/panelSizing.js';

export class PanelModeController {
    constructor(settings, windowsXpThemeController, {onDefaultPanelChanged, onWindowsXpModeChanged}) {
        this._settings = settings;
        this._windowsXpThemeController = windowsXpThemeController;
        this._onDefaultPanelChanged = onDefaultPanelChanged;
        this._onWindowsXpModeChanged = onWindowsXpModeChanged;
        this._sizingCorrections = {
            'icon-size': () => this._correctIconSize(),
            'icon-spacing': () => this._correctIconSpacing(),
            'icon-edge-padding': () => this._correctIconEdgePadding(),
            'panel-height': () => this._correctPanelHeight(),
        };
    }

    applyInitialSettings() {
        initializePanelModeProfiles(this._settings);
        this._applyMode();
    }

    enable() {
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled', () => {
                synchronizePanelMode(this._settings);
                this._applyMode();
                this._onWindowsXpModeChanged();
            },
            'changed::default-gnome-panel', () => {
                synchronizePanelMode(this._settings);
                this._onDefaultPanelChanged();
            },
            'changed::windows-10-theme-enabled', () => synchronizePanelMode(this._settings),
            this
        );
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._sizingCorrections = null;
        this._onDefaultPanelChanged = null;
        this._onWindowsXpModeChanged = null;
        this._windowsXpThemeController = null;
        this._settings = null;
    }

    correctSizingSetting(key) {
        return this._sizingCorrections[key]();
    }

    _windowsXpEnabled() {
        return this._settings.get_boolean('windows-xp-theme-enabled');
    }

    _applyMode() {
        if (this._windowsXpEnabled())
            this._windowsXpThemeController.applySettings();
        else
            this._fitPanelHeightToIconSize();
    }

    _fitPanelHeightToIconSize() {
        if (!this._settings.get_boolean('default-gnome-panel') &&
            !this._settings.get_boolean('panel-height-follow-icon-size'))
            fitPanelHeightToIconSize(this._settings);
    }

    _correctIconSize() {
        if (this._windowsXpThemeController.enforceIntegerSetting('icon-size'))
            return true;

        if (!this._windowsXpEnabled())
            this._fitPanelHeightToIconSize();
        return false;
    }

    _correctIconSpacing() {
        if (this._windowsXpThemeController.enforceIntegerSetting('icon-spacing'))
            return true;

        if (this._windowsXpEnabled() || this._settings.get_int('icon-spacing') >= 0)
            return false;

        this._settings.set_int('icon-spacing', 0);
        return true;
    }

    _correctIconEdgePadding() {
        if (this._windowsXpEnabled())
            return true;

        this._fitPanelHeightToIconSize();
        return false;
    }

    _correctPanelHeight() {
        if (this._windowsXpThemeController.enforceIntegerSetting('panel-height'))
            return true;

        if (this._windowsXpEnabled() ||
            this._settings.get_boolean('default-gnome-panel') ||
            this._settings.get_boolean('panel-height-follow-icon-size'))
            return false;

        const panelHeight = this._settings.get_int('panel-height');
        fitIconSizeToPanelHeight(this._settings);
        return this._settings.get_int('panel-height') !== panelHeight;
    }
}
