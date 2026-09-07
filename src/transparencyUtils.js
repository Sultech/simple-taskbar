// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function panelTransparencyOpacity(settings) {
    const transparency = settings.get_boolean('transparency-enabled')
        ? settings.get_int('transparency-level')
        : 0;
    return 1 - transparency / 100;
}

export function panelDynamicTransparencyOpacity(settings) {
    const transparency = settings.get_int('transparency-dynamic-level');
    return 1 - transparency / 100;
}
