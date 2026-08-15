// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Cogl from 'gi://Cogl';
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
import {extensionIsActive} from '../extensionState.js';
import {panelIsTop} from './panelPosition.js';
import {shellMenusUseLightTheme} from '../themeUtils.js';
import {panelTransparencyOpacity} from '../transparencyUtils.js';

const EXTERNAL_PANEL_STYLES = [
    'transparent-panel',
    'light-panel',
    'dark-panel',
    'contrasted-panel',
];
const BLUR_MY_SHELL_ACTIVE_CLASS =
    'simple-taskbar-blur-my-shell-active';
const LIGHT_BLUR_OVERLAY_CLASS =
    'simple-taskbar-light-blur-overlay';
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

    connectSignals(onWindowsXpThemeChanged, onPanelPositionChanged) {
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
                if (extension.uuid === BLUR_MY_SHELL_UUID)
                    this.queueBlurMyShellSync();
            },
            this._signalHolder
        );
        const blurMyShellSettings = getBlurMyShellSettings();
        if (blurMyShellSettings) {
            const panelSettings = getBlurMyShellChildSettings(
                blurMyShellSettings,
                'panel'
            );
            if (panelSettings && blurMyShellHasKey(panelSettings, 'blur')) {
                panelSettings.connectObject(
                    'changed::blur', () => this.queueBlurMyShellSync(),
                    this._signalHolder
                );
            }
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
            'changed::panel-position', () => {
                this.syncEdgeClass();
                onPanelPositionChanged();
                this.applyTransparency();
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
        const top = panelIsTop(this._settings);
        Main.panel.remove_style_class_name(
            top ? 'simple-taskbar-panel-bottom' : 'simple-taskbar-panel-top'
        );
        Main.panel.add_style_class_name(
            top ? 'simple-taskbar-panel-top' : 'simple-taskbar-panel-bottom'
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
        const panelBlur = global.blur_my_shell?._panel_blur;
        const windowsXpThemeEnabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const externalPanelStyle = !windowsXpThemeEnabled &&
            panelBlur?.enabled &&
            Main.panel.has_style_class_name(BLUR_MY_SHELL_ACTIVE_CLASS) &&
            EXTERNAL_PANEL_STYLES.some(style =>
                Main.panel.has_style_class_name(style)
            );
        const light = this._usesLightTheme();
        if (externalPanelStyle) {
            if (light)
                Main.panel.add_style_class_name(LIGHT_BLUR_OVERLAY_CLASS);
            else
                Main.panel.remove_style_class_name(LIGHT_BLUR_OVERLAY_CLASS);
            this._setPanelStyle(originalStyle);
            return;
        }
        Main.panel.remove_style_class_name(LIGHT_BLUR_OVERLAY_CLASS);

        const opacity = panelTransparencyOpacity(this._settings);
        const background = this._panelBackground(light);
        const border = '255, 255, 255';
        const borderOpacity = 0.20;
        const top = panelIsTop(this._settings);
        const borderEnabled = this._panelBorderEnabled();
        let borderStyle = 'border-top: 0; border-bottom: 0; ';
        if (borderEnabled) {
            borderStyle = top
                ? `border-top: 0; border-bottom: 1px solid ` +
                    `rgba(${border}, ${borderOpacity.toFixed(3)}); `
                : `border-top: 1px solid ` +
                    `rgba(${border}, ${borderOpacity.toFixed(3)}); ` +
                    'border-bottom: 0; ';
        }
        const transparencyStyle =
            `background-color: rgba(${background}, ` +
            `${opacity.toFixed(2)}) !important; ` +
            borderStyle +
            'box-shadow: none;';
        const separator = originalStyle.endsWith(';') ? ' ' : '; ';
        this._setPanelStyle(
            originalStyle
                ? `${originalStyle}${separator}${transparencyStyle}`
                : transparencyStyle
        );
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
        Main.panel.remove_style_class_name(LIGHT_BLUR_OVERLAY_CLASS);
        Main.panel.remove_style_class_name(BORDER_DISABLED_CLASS);
        Main.panel.remove_style_class_name(BLUR_MY_SHELL_ACTIVE_CLASS);
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
        const active = extensionIsActive(BLUR_MY_SHELL_UUID);
        const panelBlur = global.blur_my_shell?._panel_blur;
        const windowsXpThemeEnabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        if (active && panelBlur?.enabled) {
            if (windowsXpThemeEnabled)
                Main.panel.remove_style_class_name(BLUR_MY_SHELL_ACTIVE_CLASS);
            else
                Main.panel.add_style_class_name(BLUR_MY_SHELL_ACTIVE_CLASS);
            if (!Main.overview.visibleTarget) {
                panelBlur.panel_hide_blur_dynamically();
                panelBlur.update_visibility();
            }
        } else {
            Main.panel.remove_style_class_name(
                BLUR_MY_SHELL_ACTIVE_CLASS
            );
        }
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

    _panelBackground(light) {
        if (!this._settings.get_boolean('custom-panel-color-enabled'))
            return light ? '224, 229, 238' : '24, 24, 27';

        const [, color] = Cogl.Color.from_string(
            this._settings.get_string('custom-panel-color')
        );
        return `${color.red}, ${color.green}, ${color.blue}`;
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
