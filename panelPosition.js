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
