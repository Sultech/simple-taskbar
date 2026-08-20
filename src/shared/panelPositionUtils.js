// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function panelPosition(settings) {
    return settings.get_string('panel-position');
}

export function panelIsTop(settings) {
    return panelPosition(settings) === 'top';
}

export function panelIsVertical(settings) {
    const position = panelPosition(settings);
    return position === 'left' || position === 'right';
}

export function panelIsMinimumEdge(settings) {
    const position = panelPosition(settings);
    return position === 'top' || position === 'left';
}
