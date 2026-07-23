// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

export function panelIsTop(settings) {
    return settings.get_string('panel-position') === 'top';
}

export function panelArrowSide(settings) {
    return panelIsTop(settings) ? St.Side.TOP : St.Side.BOTTOM;
}

export function syncMenuArrowSide(menu, settings) {
    const side = panelArrowSide(settings);
    if (menu?._boxPointer)
        menu._boxPointer._userArrowSide = side;
    if (menu && '_arrowSide' in menu)
        menu._arrowSide = side;
}

export function orderActivitiesInRightPanel(
    items,
    activities,
    systemMenu,
    clock,
    placement
) {
    const ordered = [...items];
    if (!activities)
        return ordered;

    const systemIndex = ordered.indexOf(systemMenu);
    const clockIndex = ordered.indexOf(clock);
    let index;
    if (placement === 'before-system') {
        index = systemIndex >= 0 ? systemIndex : 0;
    } else if (placement === 'after-clock') {
        index = clockIndex >= 0
            ? clockIndex + 1
            : systemIndex >= 0
                ? systemIndex + 1
                : ordered.length;
    } else {
        index = systemIndex >= 0
            ? systemIndex + 1
            : clockIndex >= 0
                ? clockIndex
                : ordered.length;
    }

    ordered.splice(index, 0, activities);
    return ordered;
}
