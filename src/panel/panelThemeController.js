// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {
    BLUR_MY_SHELL_UUID,
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from '../shared/blurMyShellUtils.js';
import {
    getPanelBlur,
    hidePanelBlur,
    panelBlurIsActive,
    refreshPanelBlurVisibility,
} from '../integration/blurMyShellRuntime.js';
import {extensionStateIsActive} from '../extensionState.js';
import {
    BLUR_MY_SHELL_ACTIVE_CLASS,
    BLUR_TINTED_CLASS,
    BLUR_TRANSPARENT_CLASS,
    LIGHT_BLUR_OVERLAY_CLASS,
    syncPanelBlurClasses,
} from './panelBlurClasses.js';
import {panelPosition} from './panelPosition.js';
import {panelBackgroundStyle} from './panelBackgroundStyle.js';
import {shellMenusUseLightTheme} from '../themeUtils.js';

const BLUR_MY_SHELL_PANEL_KEYS = [
    'blur',
    'override-background',
    'override-background-dynamically',
    'style-panel',
    'gradient-panel',
];
const BORDER_DISABLED_CLASS =
    'simple-taskbar-border-disabled';
const XP_PANEL_CLASS =
    'simple-taskbar-windows-xp-theme';

export class PanelThemeController {
    constructor(settings, oldPanelStyle) {
        this._settings = settings;
        this._oldPanelStyle = oldPanelStyle;
        this._signalHolder = new TransientSignalHolder();
        this._transparencyRepairId = 0;
        this._blurMyShellSyncId = 0;
        this._applyingTransparency = false;
        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stSettings = St.Settings.get();
    }

    connectSignals(onWindowsXpThemeChanged) {
        Main.panel.connectObject(
            'notify::style-class', () => this.applyTransparency(),
            'notify::style', () => {
                if (!this._applyingTransparency)
                    this._queueTransparencyRepair();
            },
            this._signalHolder
        );
        Main.extensionManager.connectObject(
            'extension-state-changed',
            (_manager, extension) => {
                if (extension.uuid === BLUR_MY_SHELL_UUID) {
                    if (extensionStateIsActive(extension))
                        hidePanelBlur();
                    this.queueBlurMyShellSync();
                }
            },
            this._signalHolder
        );
        const panelSettings = getBlurMyShellChildSettings(
            getBlurMyShellSettings(),
            'panel'
        );
        for (const key of BLUR_MY_SHELL_PANEL_KEYS) {
            if (!blurMyShellHasKey(panelSettings, key))
                continue;

            panelSettings.connectObject(
                `changed::${key}`, () => this.queueBlurMyShellSync(),
                this._signalHolder
            );
        }
        this._settings.connectObject(
            'changed::transparency-enabled', () => this.applyTransparency(),
            'changed::transparency-level', () => this.applyTransparency(),
            'changed::custom-panel-color-enabled',
            () => this.applyTransparency(),
            'changed::custom-panel-color', () => this.applyTransparency(),
            'changed::panel-border-enabled', () => {
                this.syncBorder();
                this.applyTransparency();
            },
            'changed::panel-border-light-enabled', () => {
                this.syncBorder();
                this.applyTransparency();
            },
            'changed::panel-theme-follow-system', () => this.applyTheme(),
            'changed::panel-theme', () => this.applyTheme(),
            'changed::windows-xp-theme-enabled', () => {
                this.applyTheme();
                onWindowsXpThemeChanged();
                this.queueBlurMyShellSync();
            },
            this._signalHolder
        );
        this._themeContext.connectObject(
            'changed', () => this._applySystemTheme(),
            this._signalHolder
        );
        this._stSettings.connectObject(
            'notify::color-scheme', () => this._applySystemTheme(),
            'notify::shell-color-scheme', () => this._applySystemTheme(),
            this._signalHolder
        );
    }

    syncEdgeClass() {
        const position = panelPosition(this._settings);
        for (const edge of ['top', 'bottom', 'left', 'right']) {
            Main.panel.remove_style_class_name(
                `simple-taskbar-panel-${edge}`
            );
        }
        Main.panel.add_style_class_name(
            `simple-taskbar-panel-${position}`
        );
    }

    syncBorder() {
        if (this._panelBorderEnabled())
            Main.panel.remove_style_class_name(BORDER_DISABLED_CLASS);
        else
            Main.panel.add_style_class_name(BORDER_DISABLED_CLASS);
    }

    applyTheme() {
        const light = this._usesLightTheme();
        Main.panel.remove_style_class_name(
            light ? 'simple-taskbar-theme-dark' : 'simple-taskbar-theme-light'
        );
        Main.panel.add_style_class_name(
            light ? 'simple-taskbar-theme-light' : 'simple-taskbar-theme-dark'
        );
        if (this._settings.get_boolean('windows-xp-theme-enabled'))
            Main.panel.add_style_class_name(XP_PANEL_CLASS);
        else
            Main.panel.remove_style_class_name(XP_PANEL_CLASS);
        this.syncBorder();
        this.applyTransparency();
    }

    applyTransparency() {
        if (this._applyingTransparency)
            return;

        const originalStyle = this._oldPanelStyle?.trim() ?? '';
        const windowsXpThemeEnabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const externalPanelStyle = !windowsXpThemeEnabled &&
            panelBlurIsActive(Main.panel);
        const light = this._usesLightTheme();
        syncPanelBlurClasses(Main.panel, externalPanelStyle, light);
        if (externalPanelStyle) {
            this._setPanelStyle(originalStyle);
            return;
        }

        this._setPanelStyle(panelBackgroundStyle(
            this._settings,
            light,
            this._panelBorderEnabled(),
            originalStyle
        ));
    }

    queueBlurMyShellSync() {
        if (this._blurMyShellSyncId)
            return;

        this._blurMyShellSyncId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._blurMyShellSyncId = 0;
                this._syncBlurMyShell();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    restore() {
        Main.panel.remove_style_class_name('simple-taskbar-panel');
        Main.panel.remove_style_class_name('simple-taskbar-theme-light');
        Main.panel.remove_style_class_name('simple-taskbar-theme-dark');
        Main.panel.remove_style_class_name('simple-taskbar-panel-top');
        Main.panel.remove_style_class_name('simple-taskbar-panel-bottom');
        Main.panel.remove_style_class_name('simple-taskbar-panel-left');
        Main.panel.remove_style_class_name('simple-taskbar-panel-right');
        Main.panel.remove_style_class_name(LIGHT_BLUR_OVERLAY_CLASS);
        Main.panel.remove_style_class_name(BORDER_DISABLED_CLASS);
        Main.panel.remove_style_class_name(BLUR_MY_SHELL_ACTIVE_CLASS);
        Main.panel.remove_style_class_name(BLUR_TRANSPARENT_CLASS);
        Main.panel.remove_style_class_name(BLUR_TINTED_CLASS);
        Main.panel.remove_style_class_name(XP_PANEL_CLASS);
        Main.panel.set_style(this._oldPanelStyle ?? '');
    }

    destroy() {
        if (this._transparencyRepairId) {
            GLib.Source.remove(this._transparencyRepairId);
            this._transparencyRepairId = 0;
        }
        if (this._blurMyShellSyncId) {
            GLib.Source.remove(this._blurMyShellSyncId);
            this._blurMyShellSyncId = 0;
        }
        this._signalHolder.destroy();
        this._signalHolder = null;
        this.restore();
        this._themeContext = null;
        this._stSettings = null;
        this._oldPanelStyle = null;
        this._settings = null;
    }

    _applySystemTheme() {
        if (this._settings.get_boolean('panel-theme-follow-system'))
            this.applyTheme();
    }

    _queueTransparencyRepair() {
        if (this._applyingTransparency || this._transparencyRepairId)
            return;

        this._transparencyRepairId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._transparencyRepairId = 0;
                this.applyTransparency();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _syncBlurMyShell() {
        const panelBlur = getPanelBlur();
        if (panelBlur && !Main.overview.visibleTarget)
            refreshPanelBlurVisibility(panelBlur);

        this.applyTransparency();
    }

    _usesLightTheme() {
        if (!this._settings.get_boolean('panel-theme-follow-system'))
            return this._settings.get_string('panel-theme') === 'light';

        return shellMenusUseLightTheme();
    }

    _panelBorderEnabled() {
        const key = this._usesLightTheme()
            ? 'panel-border-light-enabled'
            : 'panel-border-enabled';
        return this._settings.get_boolean(key);
    }

    _setPanelStyle(style) {
        this._applyingTransparency = true;
        try {
            Main.panel.set_style(style);
        } finally {
            this._applyingTransparency = false;
        }
    }
}
