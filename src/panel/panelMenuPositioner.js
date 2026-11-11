// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import St from 'gi://St';

import {panelIsTop, panelPosition} from '../shared/panelPositionUtils.js';
import {dynamicTaskbarEnabled} from '../shared/panelModeSettings.js';
import {pinnedPopupSource} from '../popupMenuUtils.js';

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
    if (panelIsTop(settings))
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

export class PanelMenuPositioner {
    constructor(injectionManager, settings) {
        this._injectionManager = injectionManager;
        this._settings = settings;
        this._states = new Map();
        this._themeChangedId = 0;
    }

    enable() {
        const positioner = this;
        this._injectionManager.overrideMethod(
            Object.getPrototypeOf(Main.panel),
            'addToStatusArea',
            originalMethod => function (...args) {
                const indicator = originalMethod.call(this, ...args);
                if (this === Main.panel)
                    positioner._adjust(indicator);
                return indicator;
            }
        );

        this._themeChangedId = this._settings.connect(
            'changed::windows-xp-theme-enabled',
            () => this.refresh()
        );

        for (const indicator of Object.values(Main.panel.statusArea))
            this._adjust(indicator);
    }

    destroy() {
        for (const {
            indicator,
            menu,
            userArrowSide,
            arrowSide,
            arrowAlignment,
            removeTopPanelGap,
            destroyId,
        } of this._states.values()) {
            if (destroyId)
                indicator.disconnect(destroyId);
            this._injectionManager.restoreMethod(menu._boxPointer, 'setPosition');
            removeXpPopupOffset(menu);
            menu._boxPointer._userArrowSide = userArrowSide;
            menu._arrowSide = arrowSide;
            menu._arrowAlignment = arrowAlignment;
            if (removeTopPanelGap)
                menu.actor.remove_style_class_name('simple-taskbar-bottom-panel-menu');
        }

        if (this._themeChangedId)
            this._settings.disconnect(this._themeChangedId);
        this._themeChangedId = 0;
        this._states.clear();
        this._injectionManager.restoreMethod(
            Object.getPrototypeOf(Main.panel),
            'addToStatusArea'
        );
        this._injectionManager = null;
        this._settings = null;
    }

    refresh() {
        for (const {menu, removeTopPanelGap} of this._states.values()) {
            const side = panelArrowSide(this._settings);
            menu._boxPointer._userArrowSide = side;
            menu._arrowSide = side;
            if (removeTopPanelGap && !panelIsTop(this._settings)) {
                menu.actor.add_style_class_name(
                    'simple-taskbar-bottom-panel-menu'
                );
            } else if (removeTopPanelGap) {
                menu.actor.remove_style_class_name(
                    'simple-taskbar-bottom-panel-menu'
                );
            }
            syncXpPopupOffset(menu, this._settings);
        }
    }

    _adjust(indicator) {
        const menu = indicator.menu;
        const boxPointer = menu?._boxPointer;
        if (!boxPointer || this._states.has(indicator))
            return;

        // Quick Settings already accounts for its bottom-panel position.
        // Other menus retain GNOME's top-panel margin, including tray icons
        // registered after Simple Taskbar has been enabled.
        const removeTopPanelGap = indicator !== Main.panel.statusArea.quickSettings;
        const state = {
            indicator,
            menu,
            userArrowSide: boxPointer._userArrowSide,
            arrowSide: menu._arrowSide,
            arrowAlignment: menu._arrowAlignment,
            removeTopPanelGap,
            destroyId: 0,
        };
        state.destroyId = indicator.connect('destroy', () => {
            state.destroyId = 0;
            this._injectionManager.restoreMethod(boxPointer, 'setPosition');
            this._states.delete(indicator);
        });
        this._states.set(indicator, state);

        const side = panelArrowSide(this._settings);
        boxPointer._userArrowSide = side;
        menu._arrowSide = side;
        if (dynamicTaskbarEnabled(this._settings)) {
            menu._arrowAlignment = 0.5;
            this._injectionManager.overrideMethod(boxPointer, 'setPosition', original => function (sourceActor, alignment) {
                const pinned = sourceActor === menu.sourceActor && Main.panel.contains(sourceActor);
                original.call(this, pinned ? pinnedPopupSource(sourceActor) : sourceActor, alignment);
            });
        }
        if (removeTopPanelGap && !panelIsTop(this._settings)) {
            menu.actor.add_style_class_name('simple-taskbar-bottom-panel-menu');
        }
        syncXpPopupOffset(menu, this._settings);
    }
}
