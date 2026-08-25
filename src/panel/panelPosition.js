// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import {
    panelIsTop,
    panelIsVertical,
    panelPosition,
} from '../shared/panelPositionUtils.js';

export {
    panelIsMinimumEdge,
    panelIsTop,
    panelIsVertical,
    panelPosition,
} from '../shared/panelPositionUtils.js';

const XP_POPUP_OFFSET_CLASS = 'simple-taskbar-xp-popup-offset';
const BOTTOM_PANEL_MENU_CLASS = 'simple-taskbar-bottom-panel-menu';

export function panelArrowSide(settings) {
    switch (panelPosition(settings)) {
    case 'top':
        return St.Side.TOP;
    case 'left':
        return St.Side.LEFT;
    case 'right':
        return St.Side.RIGHT;
    default:
        return St.Side.BOTTOM;
    }
}

export function syncMenuArrowSide(menu, settings) {
    const side = panelArrowSide(settings);
    menu._boxPointer.updateArrowSide(side);
    menu._arrowSide = side;
}

export function syncPanelMenuPosition(menu, settings) {
    syncMenuArrowSide(menu, settings);
    if (panelIsTop(settings) || panelIsVertical(settings))
        menu.actor.remove_style_class_name(BOTTOM_PANEL_MENU_CLASS);
    else
        menu.actor.add_style_class_name(BOTTOM_PANEL_MENU_CLASS);
}

export function syncXpPopupOffset(menu, settings) {
    const enabled = settings.get_boolean(
        'windows-xp-theme-enabled'
    ) && panelPosition(settings) === 'bottom';
    if (enabled) {
        menu.actor.add_style_class_name(XP_POPUP_OFFSET_CLASS);
        menu._boxPointer.add_style_class_name(XP_POPUP_OFFSET_CLASS);
    } else {
        removeXpPopupOffset(menu);
    }
}

export function removeXpPopupOffset(menu) {
    menu.actor.remove_style_class_name(XP_POPUP_OFFSET_CLASS);
    menu._boxPointer.remove_style_class_name(XP_POPUP_OFFSET_CLASS);
}
