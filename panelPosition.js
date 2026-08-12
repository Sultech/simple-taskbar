// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

const XP_POPUP_OFFSET_CLASS = 'simple-taskbar-xp-popup-offset';
const BOTTOM_PANEL_MENU_CLASS = 'simple-taskbar-bottom-panel-menu';

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

export function syncPanelMenuPosition(menu, settings) {
    syncMenuArrowSide(menu, settings);
    if (panelIsTop(settings))
        menu.actor.remove_style_class_name(BOTTOM_PANEL_MENU_CLASS);
    else
        menu.actor.add_style_class_name(BOTTOM_PANEL_MENU_CLASS);
}

export function syncXpPopupOffset(menu, settings) {
    const enabled = settings.get_boolean(
        'windows-xp-theme-enabled'
    ) && !panelIsTop(settings);
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
