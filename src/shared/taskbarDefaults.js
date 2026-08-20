// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {DEFAULT_PANEL_ITEM_ORDER} from './panelItemOrder.js';
import {
    setBoolean,
    setInteger,
    setString,
    setStringArray,
} from './settingsUtils.js';

export const DEFAULT_TASKBAR_PANEL_HEIGHT = 49;
export const DEFAULT_TASKBAR_ICON_SIZE = 32;
export const DEFAULT_TASKBAR_ICON_SPACING = 3;
export const DEFAULT_TASKBAR_ALIGNMENT = 'center';
export const DEFAULT_TASKBAR_COMBINE_MODE = 'always';

export function applyDefaultTaskbarSettings(settings) {
    setInteger(settings, 'panel-height', DEFAULT_TASKBAR_PANEL_HEIGHT);
    setInteger(settings, 'panel-button-padding', -1);
    setInteger(settings, 'icon-size', DEFAULT_TASKBAR_ICON_SIZE);
    setInteger(settings, 'icon-spacing', DEFAULT_TASKBAR_ICON_SPACING);
    setInteger(settings, 'start-button-padding', 3);
    setString(settings, 'app-alignment', DEFAULT_TASKBAR_ALIGNMENT);
    setString(settings, 'activities-button-position', 'left');
    setString(settings, 'panel-position', 'bottom');
    setString(settings, 'clock-position', 'right');
    setString(settings, 'system-menu-position', 'right');
    setString(settings, 'folder-menu-position', 'right');
    setString(settings, 'tray-overflow-position', 'right');
    setString(settings, 'show-desktop-button-position', 'right');
    setStringArray(
        settings,
        'panel-item-order',
        DEFAULT_PANEL_ITEM_ORDER
    );
    setString(
        settings,
        'start-button-position',
        DEFAULT_TASKBAR_ALIGNMENT
    );
    setBoolean(settings, 'activities-button-visible', true);
    setBoolean(settings, 'multi-monitor-panels', true);
    setBoolean(settings, 'use-pinned-apps-as-launchers', false);
    setBoolean(settings, 'windows-start-menu-enabled', true);
    setBoolean(settings, 'start-button-follow-app-alignment', true);
    setBoolean(settings, 'gnome-start-button-visible', true);
    setBoolean(settings, 'show-desktop-button-visible', true);
    setBoolean(settings, 'panel-theme-follow-system', true);
    setBoolean(settings, 'transparency-enabled', true);
    setBoolean(settings, 'panel-border-enabled', false);
    setBoolean(settings, 'panel-border-light-enabled', false);
    setBoolean(settings, 'application-overflow-enabled', true);
    setBoolean(settings, 'hide-app-labels', false);
    setBoolean(settings, 'hide-pinned-taskbar-apps', false);
    setBoolean(settings, 'multi-window-click-spread', true);
    setBoolean(settings, 'window-previews-enabled', true);
    setBoolean(settings, 'panel-autohide-enabled', false);
    setBoolean(settings, 'nautilus-places-enabled', true);
    setBoolean(settings, 'start-menu-follow-panel-theme', true);
    setBoolean(settings, 'start-menu-follow-panel-transparency', false);
    setBoolean(settings, 'super-e-file-manager-enabled', true);
    setString(
        settings,
        'combine-app-buttons-mode',
        DEFAULT_TASKBAR_COMBINE_MODE
    );
}
