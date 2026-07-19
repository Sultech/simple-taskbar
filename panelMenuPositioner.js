// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {panelArrowSide, panelIsTop} from './panelPosition.js';

export class PanelMenuPositioner {
    constructor(injectionManager, settings) {
        this._injectionManager = injectionManager;
        this._settings = settings;
        this._states = new Map();
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

        for (const indicator of Object.values(Main.panel.statusArea))
            this._adjust(indicator);
    }

    refresh() {
        for (const {menu, removeTopPanelGap} of this._states.values()) {
            const side = panelArrowSide(this._settings);
            if (menu?._boxPointer)
                menu._boxPointer._userArrowSide = side;
            if ('_arrowSide' in menu)
                menu._arrowSide = side;
            if (removeTopPanelGap && !panelIsTop(this._settings)) {
                menu?.actor.add_style_class_name(
                    'simple-taskbar-bottom-panel-menu'
                );
            } else if (removeTopPanelGap) {
                menu?.actor.remove_style_class_name(
                    'simple-taskbar-bottom-panel-menu'
                );
            }
        }
    }

    destroy() {
        for (const {
            indicator,
            menu,
            userArrowSide,
            arrowSide,
            removeTopPanelGap,
            destroyId,
        } of this._states.values()) {
            if (destroyId)
                indicator.disconnect(destroyId);
            if (menu?._boxPointer)
                menu._boxPointer._userArrowSide = userArrowSide;
            if ('_arrowSide' in menu)
                menu._arrowSide = arrowSide;
            if (removeTopPanelGap)
                menu?.actor.remove_style_class_name('simple-taskbar-bottom-panel-menu');
        }

        this._states.clear();
        this._injectionManager?.restoreMethod(
            Object.getPrototypeOf(Main.panel),
            'addToStatusArea'
        );
        this._injectionManager = null;
        this._settings = null;
    }

    _adjust(indicator) {
        const menu = indicator?.menu;
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
            removeTopPanelGap,
            destroyId: 0,
        };
        state.destroyId = indicator.connect('destroy', () => {
            state.destroyId = 0;
            this._states.delete(indicator);
        });
        this._states.set(indicator, state);

        const side = panelArrowSide(this._settings);
        boxPointer._userArrowSide = side;
        if ('_arrowSide' in menu)
            menu._arrowSide = side;
        if (removeTopPanelGap && !panelIsTop(this._settings))
            menu.actor.add_style_class_name('simple-taskbar-bottom-panel-menu');
    }
}
