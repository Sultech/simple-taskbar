// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {dynamicTaskbarEnabled} from '../shared/panelModeSettings.js';
import {panelIsMinimumEdge, panelIsVertical} from '../shared/panelPositionUtils.js';
import {hasMaximizedWindowOnMonitor} from './panelWindowQueries.js';

export function panelGeometry(
    settings,
    monitor,
    thickness,
    revealSize = 0,
    lengthPercentage = null,
    lengthOverride = null,
    edgeGap = 0
) {
    const vertical = panelIsVertical(settings);
    const minimumEdge = panelIsMinimumEdge(settings);
    const inset = Math.max(0, Math.floor(edgeGap));
    const fullLength = vertical ? monitor.height : monitor.width;
    const length = lengthOverride === null
        ? lengthPercentage === null
            ? fullLength
            : Math.floor(fullLength * lengthPercentage / 100)
        : Math.max(1, Math.min(fullLength, Math.floor(lengthOverride)));
    const width = vertical ? thickness : length;
    const height = vertical ? length : thickness;
    const x = vertical && !minimumEdge
        ? monitor.x + monitor.width - thickness - inset
        : vertical
            ? monitor.x + inset
            : monitor.x + Math.floor((monitor.width - length) / 2);
    const y = !vertical && !minimumEdge
        ? monitor.y + monitor.height - thickness - inset
        : !vertical
            ? monitor.y + inset
            : monitor.y + Math.floor((monitor.height - length) / 2);
    const hiddenOffset = minimumEdge
        ? (vertical ? x : y) - thickness - inset + revealSize
        : (vertical ? x : y) + thickness + inset - revealSize;

    return {
        vertical,
        x,
        y,
        width,
        height,
        visibleOffset: vertical ? x : y,
        hiddenOffset,
    };
}

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
