// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    panelIsMinimumEdge,
    panelIsVertical,
} from './panelPosition.js';

export function panelGeometry(settings, monitor, thickness, revealSize = 0) {
    const vertical = panelIsVertical(settings);
    const minimumEdge = panelIsMinimumEdge(settings);
    const width = vertical ? thickness : monitor.width;
    const height = vertical ? monitor.height : thickness;
    const x = vertical && !minimumEdge
        ? monitor.x + monitor.width - thickness
        : monitor.x;
    const y = !vertical && !minimumEdge
        ? monitor.y + monitor.height - thickness
        : monitor.y;
    const hiddenOffset = minimumEdge
        ? (vertical ? x : y) - thickness + revealSize
        : (vertical ? x : y) + thickness - revealSize;

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
