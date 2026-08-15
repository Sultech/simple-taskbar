// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    panelArrowSide,
    panelIsTop,
    removeXpPopupOffset,
    syncXpPopupOffset,
} from '../panel/panelPosition.js';

const INDICATOR_ROLES = ['activities', 'quickSettings', 'dateMenu'];

// Shell's QuickSettings builds its own system-status children (network,
// bluetooth and power among them) and defines no teardown for any of them,
// so destroying one leaves its D-Bus handlers live against a dead actor.
// Retired indicators are unparented and kept here for the next panel to
// claim. The pool outlives disable() because Shell imports an extension
// module once per session; that is the cost of reusing real Shell
// indicators rather than destroying them.
const INDICATOR_POOL = new Map(
    INDICATOR_ROLES.map(role => [role, []])
);

export class SecondaryPanelIndicatorController {
    constructor(settings, menuManager) {
        this._settings = settings;
        this._menuManager = menuManager;
        this._originalChangeMenu = null;
        this._indicators = new Map();
    }

    acquire() {
        for (const role of INDICATOR_ROLES) {
            const IndicatorConstructor =
                Main.panel.statusArea[role].constructor;
            const pool = INDICATOR_POOL.get(role);
            const indicator = pool.pop() ?? new IndicatorConstructor();
            this._indicators.set(role, indicator);
            const menu = indicator.menu;
            if (!menu)
                continue;
            this._menuManager.addMenu(menu);
            const side = panelArrowSide(this._settings);
            const boxPointer = menu._boxPointer;
            if (boxPointer)
                boxPointer._userArrowSide = side;
            if ('_arrowSide' in menu)
                menu._arrowSide = side;
            if (role !== 'quickSettings' && !panelIsTop(this._settings)) {
                menu.actor.add_style_class_name(
                    'simple-taskbar-bottom-panel-menu'
                );
            }
        }

        this._originalChangeMenu = this._menuManager._changeMenu;
        const originalChangeMenu = this._originalChangeMenu;
        const settings = this._settings;
        this._menuManager._changeMenu = function (menu) {
            if (!settings.get_boolean('panel-menu-click-only'))
                originalChangeMenu.call(this, menu);
        };
    }

    get(role) {
        return this._indicators.get(role);
    }

    syncPopupOffsets() {
        for (const indicator of this._indicators.values()) {
            const menu = indicator.menu;
            if (menu && menu._boxPointer)
                syncXpPopupOffset(menu, this._settings);
        }
    }

    syncActivitiesVisibility() {
        this._indicators.get('activities').container.visible =
            this._settings.get_boolean('activities-button-visible');
    }

    destroy() {
        this._menuManager._changeMenu = this._originalChangeMenu;
        this._originalChangeMenu = null;
        for (const [role, indicator] of this._indicators) {
            const menu = indicator.menu;
            if (menu) {
                menu.close();
                if (menu._boxPointer)
                    removeXpPopupOffset(menu);
                menu.actor.remove_style_class_name(
                    'simple-taskbar-bottom-panel-menu'
                );
                this._menuManager.removeMenu(menu);
            }
            const parent = indicator.container.get_parent();
            if (parent)
                parent.remove_child(indicator.container);
            INDICATOR_POOL.get(role).push(indicator);
        }
        this._indicators.clear();
        this._indicators = null;
        this._menuManager = null;
        this._settings = null;
    }
}
