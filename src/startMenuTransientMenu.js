// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MENU_STYLE_CLASS = 'simple-taskbar-windows-start-context';

export class StartMenuTransientMenu {
    constructor(applyTheme) {
        this._applyTheme = applyTheme;
        this._menu = null;
        this._menuManager = null;
    }

    get isOpen() {
        return Boolean(this._menu);
    }

    adopt(menu, menuManager, onClosed = () => {}) {
        menu.actor.add_style_class_name(MENU_STYLE_CLASS);
        this._applyTheme(menu.actor);
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        menuManager.addMenu(menu);
        this._menu = menu;
        this._menuManager = menuManager;
        menu.connect('menu-closed', () => {
            if (this._menu !== menu)
                return;
            this._menu = null;
            this._menuManager = null;
            menu.destroy();
            onClosed();
        });
    }

    syncTheme() {
        if (this._menu)
            this._applyTheme(this._menu.actor);
    }

    close() {
        const menu = this._menu;
        this._menu = null;
        this._menuManager = null;
        if (menu)
            menu.destroy();
    }

    destroy() {
        this.close();
        this._applyTheme = null;
    }
}
