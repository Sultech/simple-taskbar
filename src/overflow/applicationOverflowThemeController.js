// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {getPopupBlur} from '../integration/blurMyShellRuntime.js';
import {panelTransparencyOpacity} from '../transparencyUtils.js';

const LIGHT_MENU_CLASS = 'simple-taskbar-application-overflow-light';
const DARK_MENU_CLASS = 'simple-taskbar-application-overflow-dark';
const XP_MENU_CLASS = 'simple-taskbar-application-overflow-xp';
const LIGHT_GRADIENT_START_MAX_OPACITY = 0.62;
const LIGHT_GRADIENT_END_MAX_OPACITY = 0.54;

export class ApplicationOverflowThemeController {
    constructor(settings, menu, getStyle) {
        this._settings = settings;
        this._menu = menu;
        this._getStyle = getStyle;
    }

    sync() {
        const light = Main.panel.has_style_class_name(
            'simple-taskbar-theme-light'
        );
        const windowsXpThemeEnabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        this._menu.actor.remove_style_class_name(LIGHT_MENU_CLASS);
        this._menu.actor.remove_style_class_name(DARK_MENU_CLASS);
        this._menu.actor.remove_style_class_name(XP_MENU_CLASS);
        this._menu.actor.add_style_class_name(
            light ? LIGHT_MENU_CLASS : DARK_MENU_CLASS
        );

        const boxStyle = this._menu.box.get_style();
        const radiusMatch = (boxStyle || '').match(
            /(?:^|;)\s*(border-radius:\s*[^;]+)/
        );
        const radiusDeclaration = radiusMatch ? radiusMatch[1] : '';
        if (windowsXpThemeEnabled && this._getStyle() === 'taskbar') {
            this._menu.actor.add_style_class_name(XP_MENU_CLASS);
            this._menu.box.set_style(null);
            return;
        }

        const popupBlurEnabled = Boolean(getPopupBlur());
        if (popupBlurEnabled && !light) {
            this._menu.box.set_style(
                'background: transparent !important; ' + radiusDeclaration
            );
            return;
        }

        const panelOpacity = popupBlurEnabled
            ? 1
            : panelTransparencyOpacity(this._settings);
        const gradientStart = light ? '249, 250, 253' : '42, 42, 47';
        const gradientEnd = light ? '230, 234, 242' : '30, 30, 34';
        const startOpacity = light
            ? Math.min(panelOpacity, LIGHT_GRADIENT_START_MAX_OPACITY)
            : panelOpacity;
        const endOpacity = light
            ? Math.min(panelOpacity, LIGHT_GRADIENT_END_MAX_OPACITY)
            : panelOpacity;
        this._menu.box.set_style(
            'background: transparent !important; ' +
            'background-gradient-direction: vertical !important; ' +
            `background-gradient-start: rgba(${gradientStart}, ` +
                `${startOpacity.toFixed(2)}) !important; ` +
            `background-gradient-end: rgba(${gradientEnd}, ` +
                `${endOpacity.toFixed(2)}) !important; ` +
            radiusDeclaration
        );
    }

    destroy() {
        this._getStyle = null;
        this._menu = null;
        this._settings = null;
    }
}
