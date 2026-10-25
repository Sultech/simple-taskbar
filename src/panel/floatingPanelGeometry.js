// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DOCK_EDGE_GAP} from '../shared/panelSizing.js';
import {dynamicTaskbarEnabled} from '../shared/taskbarPanelModes.js';
import {hasMaximizedWindowOnMonitor} from '../windowVisibility.js';

export function floatingPanelEdgeGap(settings, monitor) {
    if (Main.overview.visibleTarget)
        return DOCK_EDGE_GAP;

    if (!settings.get_boolean('panel-autohide-enabled') &&
        !settings.get_boolean('panel-dodge-windows-enabled') &&
        hasMaximizedWindowOnMonitor(monitor)) {
        return 0;
    }

    return DOCK_EDGE_GAP;
}

export function floatingPanelCornerRadius(settings, monitor) {
    if (!dynamicTaskbarEnabled(settings) && floatingPanelEdgeGap(settings, monitor) === 0)
        return 0;

    return settings.get_int('taskbar-corner-radius');
}
