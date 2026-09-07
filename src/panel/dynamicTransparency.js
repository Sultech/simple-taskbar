// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {hasWindowAffectingPanel} from '../windowVisibility.js';
import {panelDynamicTransparencyOpacity} from '../transparencyUtils.js';

export function hasDynamicTransparencyWindow(settings, monitor, geometry) {
    return hasWindowAffectingPanel(
        monitor,
        geometry,
        settings.get_string('transparency-dynamic-behavior'),
        settings.get_int('transparency-dynamic-distance')
    );
}

export function dynamicTransparencyStyle(
    settings,
    enabled,
    monitor,
    getGeometry
) {
    if (!enabled)
        return {dynamicOpacity: null, transitionDuration: 0};

    const hasTransparencyWindow = Boolean(monitor) &&
        hasDynamicTransparencyWindow(settings, monitor, getGeometry());
    return {
        dynamicOpacity: hasTransparencyWindow
            ? null
            : panelDynamicTransparencyOpacity(settings),
        transitionDuration: settings.get_int(
            'transparency-dynamic-animation-time'
        ),
    };
}
