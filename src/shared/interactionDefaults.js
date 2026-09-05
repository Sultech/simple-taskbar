// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {CLICK_ACTION} from './applicationClickActions.js';
import {HOVER_ACTION} from './applicationHoverActions.js';
import {SCROLL_ACTION} from './applicationScrollActions.js';
import {PANEL_SCROLL_ACTION} from './panelScrollActions.js';
import {
    setBoolean,
    setInteger,
    setString,
} from './settingsUtils.js';

export function applySharedInteractionDefaults(settings) {
    setString(
        settings,
        'application-click-action',
        CLICK_ACTION.TOGGLE_SPREAD
    );
    setString(settings, 'shift-click-action', CLICK_ACTION.MINIMIZE);
    setString(settings, 'middle-click-action', CLICK_ACTION.LAUNCH);
    setString(
        settings,
        'shift-middle-click-action',
        CLICK_ACTION.LAUNCH
    );
    setString(
        settings,
        'scroll-icon-action',
        SCROLL_ACTION.SWITCH_WORKSPACE
    );
    setString(
        settings,
        'workspace-scroll-action',
        PANEL_SCROLL_ACTION.SWITCH_WORKSPACE
    );
    setInteger(settings, 'scroll-icon-delay', 5);
    setBoolean(settings, 'scroll-icon-follow-panel-delay', true);
    setString(
        settings,
        'application-hover-action',
        HOVER_ACTION.SHOW_PREVIEWS
    );
    setBoolean(settings, 'panel-autohide-enabled', false);
    setBoolean(settings, 'show-desktop-button-visible', true);
    setBoolean(settings, 'nautilus-places-enabled', true);
    setBoolean(settings, 'super-e-file-manager-enabled', true);
}
