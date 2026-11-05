// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {APP_ICON_HOVER_ANIMATION} from './applicationHoverAnimation.js';
import {HOVER_ACTION} from './applicationHoverActions.js';
import {CLASSIC_HIGHLIGHT_SETTINGS, TASKBAR_HIGHLIGHT_STYLE} from './classicHighlightSettings.js';
import {WINDOW_MINIMIZE_EFFECT} from './windowMinimizeEffect.js';

export function applyMacosDockDefaults(settings) {
    settings.set_int('icon-size', 48);
    settings.set_int('icon-spacing', 6);
    settings.set_int('start-button-padding', 2);
    settings.set_boolean('windows-start-menu-enabled', false);
    settings.set_boolean('gnome-start-button-visible', true);
    settings.set_boolean('use-pinned-apps-as-launchers', false);
    settings.set_boolean('show-pinned-app-separator', true);
    settings.set_string('window-minimize-effect', WINDOW_MINIMIZE_EFFECT.MAGIC_LAMP);
    settings.set_string('animate-appicon-hover-animation-type', APP_ICON_HOVER_ANIMATION.MAGNIFY);
    settings.set_string('application-hover-action', HOVER_ACTION.SHOW_TOOLTIP);
    settings.set_string('combine-app-buttons-mode', 'always');
    settings.set_string('running-indicator-style', 'dots');
    settings.set_string('running-indicator-position', 'bottom');
    settings.set_int('running-indicator-size', 5);
    settings.set_boolean('custom-indicator-colors-enabled', true);
    settings.set_boolean('match-icon-color', false);
    settings.set_string('focused-indicator-color', '#000000');
    settings.set_string('unfocused-indicator-color', '#000000');
    settings.set_string('taskbar-highlight-style', TASKBAR_HIGHLIGHT_STYLE.GLASS);
    settings.set_boolean(CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled, false);
    settings.set_boolean(CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled, false);
    settings.set_boolean('dock-panel-theme-follow-system', false);
    settings.set_string('dock-panel-theme', 'light');
    settings.set_boolean('dock-transparency-enabled', true);
    settings.set_int('dock-transparency-level', 30);
    settings.set_boolean('dock-custom-panel-color-enabled', false);
    settings.set_boolean('dock-custom-panel-gradient-enabled', false);
    settings.set_boolean('dock-panel-mode', false);
    settings.set_boolean('dock-floating', true);
    settings.set_string('dock-position', 'bottom');
    settings.set_boolean('dock-show-locations', true);
    settings.set_boolean('dock-show-minimized-windows', true);
}
