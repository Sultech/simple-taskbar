// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    ICON_VERTICAL_RESERVE,
    STANDARD_MIN_PANEL_HEIGHT,
} from './shared/panelSizing.js';
import {
    initializePanelModeProfiles,
    synchronizePanelMode,
} from './shared/panelModeProfiles.js';
import {
    applyWindowsXpThemeAppearance,
    applyWindowsXpThemeSettings,
    WINDOWS_XP_ICON_SPACING,
    WINDOWS_XP_ICON_SIZE,
    WINDOWS_XP_PANEL_HEIGHT,
} from './shared/windowsXpTheme.js';

const LOCKED_SETTING_KEYS = [
    'panel-button-padding',
    'app-alignment',
    'start-button-position',
    'use-pinned-apps-as-launchers',
    'hide-unpinned-taskbar-apps',
    'show-pinned-app-separator',
    'show-location-separator',
    'combine-app-buttons-mode',
    'application-overflow-enabled',
    'hide-app-labels',
    'custom-indicator-colors-enabled',
    'match-icon-color',
    'custom-panel-color-enabled',
    'activities-button-position',
    'panel-border-enabled',
    'panel-border-light-enabled',
    'panel-position',
    'clock-position',
    'system-menu-position',
    'transparency-enabled',
    'start-menu-follow-panel-transparency',
    'start-menu-super-key',
    'show-desktop-button-position',
    'windows-start-menu-enabled',
    'folder-menu-position',
    'panel-item-order',
];

export class WindowsXpModeController {
    constructor(settings, {
        onDefaultPanelChanged,
        onIconSizeChanged,
        onIconSpacingChanged,
        onModeChanged,
        onPanelHeightChanged,
    }) {
        this._settings = settings;
        this._onDefaultPanelChanged = onDefaultPanelChanged;
        this._onIconSizeChanged = onIconSizeChanged;
        this._onIconSpacingChanged = onIconSpacingChanged;
        this._onModeChanged = onModeChanged;
        this._onPanelHeightChanged = onPanelHeightChanged;
    }

    applyInitialSettings() {
        initializePanelModeProfiles(this._settings);
        this._syncMode();
    }

    enable() {
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => {
                synchronizePanelMode(this._settings);
                this._syncMode();
                this._onModeChanged();
            },
            'changed::default-gnome-panel',
            () => {
                synchronizePanelMode(this._settings);
                this._onDefaultPanelChanged();
            },
            'changed::icon-size',
            () => this._syncIconSize(),
            'changed::icon-spacing',
            () => this._syncIconSpacing(),
            'changed::panel-height',
            () => this._syncPanelHeight(),
            this
        );
        for (const key of LOCKED_SETTING_KEYS) {
            this._settings.connectObject(`changed::${key}`, () => {
                if (this._windowsXpModeEnabled())
                    applyWindowsXpThemeSettings(this._settings);
            }, this);
        }
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._onPanelHeightChanged = null;
        this._onModeChanged = null;
        this._onIconSpacingChanged = null;
        this._onIconSizeChanged = null;
        this._onDefaultPanelChanged = null;
        this._settings = null;
    }

    _windowsXpModeEnabled() {
        return this._settings.get_boolean('windows-xp-theme-enabled');
    }

    _syncMode() {
        if (!this._windowsXpModeEnabled()) {
            if (!this._settings.get_boolean('default-gnome-panel')) {
                const minimumPanelHeight =
                    this._settings.get_int('icon-size') +
                    ICON_VERTICAL_RESERVE;
                if (this._settings.get_int('panel-height') <
                    minimumPanelHeight) {
                    this._settings.set_int(
                        'panel-height',
                        minimumPanelHeight
                    );
                }
            }
            return;
        }

        applyWindowsXpThemeAppearance(this._settings);
        applyWindowsXpThemeSettings(this._settings);
    }

    _syncIconSize() {
        const iconSize = this._settings.get_int('icon-size');
        if (this._windowsXpModeEnabled() &&
            iconSize !== WINDOWS_XP_ICON_SIZE) {
            this._settings.set_int('icon-size', WINDOWS_XP_ICON_SIZE);
            return;
        }
        const minimumPanelHeight = iconSize + ICON_VERTICAL_RESERVE;
        if (!this._settings.get_boolean('default-gnome-panel') &&
            !this._windowsXpModeEnabled() &&
            this._settings.get_int('panel-height') < minimumPanelHeight) {
            this._settings.set_int('panel-height', minimumPanelHeight);
        }
        this._onIconSizeChanged(iconSize);
    }

    _syncIconSpacing() {
        const iconSpacing = this._settings.get_int('icon-spacing');
        if (this._windowsXpModeEnabled() &&
            iconSpacing !== WINDOWS_XP_ICON_SPACING) {
            this._settings.set_int('icon-spacing', WINDOWS_XP_ICON_SPACING);
            return;
        }
        if (!this._windowsXpModeEnabled() && iconSpacing < 0) {
            this._settings.set_int('icon-spacing', 0);
            return;
        }
        this._onIconSpacingChanged();
    }

    _syncPanelHeight() {
        const panelHeight = this._settings.get_int('panel-height');
        if (this._windowsXpModeEnabled() &&
            panelHeight !== WINDOWS_XP_PANEL_HEIGHT) {
            this._settings.set_int('panel-height', WINDOWS_XP_PANEL_HEIGHT);
            return;
        }
        if (!this._windowsXpModeEnabled() &&
            !this._settings.get_boolean('default-gnome-panel') &&
            panelHeight < STANDARD_MIN_PANEL_HEIGHT) {
            this._settings.set_int('panel-height', STANDARD_MIN_PANEL_HEIGHT);
            return;
        }
        const maximumIconSize = panelHeight - ICON_VERTICAL_RESERVE;
        if (!this._windowsXpModeEnabled() &&
            !this._settings.get_boolean('default-gnome-panel') &&
            this._settings.get_int('icon-size') > maximumIconSize) {
            this._settings.set_int('icon-size', maximumIconSize);
        }
        this._onPanelHeightChanged(panelHeight);
    }
}
