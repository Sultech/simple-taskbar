// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {dynamicTaskbarEnabled} from '../shared/taskbarPanelModes.js';
import {hasMaximizedWindowOnMonitor} from '../windowVisibility.js';

export function floatingPanelEdgeGap(settings, monitor) {
    if (Main.overview.visibleTarget)
        return settings.get_int('taskbar-floating-gap');

    if (settings.get_boolean('taskbar-floating-snap-to-edge') &&
        !settings.get_boolean('panel-autohide-enabled') &&
        !settings.get_boolean('panel-dodge-windows-enabled') &&
        hasMaximizedWindowOnMonitor(monitor)) {
        return 0;
    }

    return settings.get_int('taskbar-floating-gap');
}

export function floatingPanelCornerRadius(settings, monitor) {
    if (!dynamicTaskbarEnabled(settings) && floatingPanelEdgeGap(settings, monitor) === 0)
        return 0;

    return settings.get_int('taskbar-corner-radius');
}
