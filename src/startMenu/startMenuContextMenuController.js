// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {panelArrowSide} from './panelPosition.js';
import {StartMenuAppMenu} from './startMenuAppMenu.js';
import {StartMenuTransientMenu} from './startMenuTransientMenu.js';

export class StartMenuContextMenuController {
    constructor(settings, {
        applyTheme,
        closeApp,
        closeMenu,
        getInterestingWindows,
        hideTooltip,
        refreshAfterPinChange,
    }) {
        this._settings = settings;
        this._closeApp = closeApp;
        this._closeMenu = closeMenu;
        this._getInterestingWindows = getInterestingWindows;
        this._hideTooltip = hideTooltip;
        this._refreshAfterPinChange = refreshAfterPinChange;
        this._transientMenu = new StartMenuTransientMenu(applyTheme);
        this._actionCloseIdleId = 0;
        this._cursor = new St.Widget({
            width: 1,
            height: 1,
            opacity: 0,
            reactive: false,
        });
        Main.uiGroup.add_child(this._cursor);
    }

    addHandler(button, app) {
        button.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_SECONDARY)
                return Clutter.EVENT_PROPAGATE;

            const [x, y] = event.get_coords();
            this.open(button, app, {x, y});
            return Clutter.EVENT_STOP;
        });
        button.connect('popup-menu', () => {
            this.open(button, app);
            return Clutter.EVENT_STOP;
        });
    }

    open(sourceButton, app, cursorPosition = null) {
        this._hideTooltip(true);
        this.close();

        let menuSource = sourceButton;
        if (cursorPosition) {
            this._cursor.set_position(
                Math.round(cursorPosition.x),
                Math.round(cursorPosition.y)
            );
            menuSource = this._cursor;
        }

        let refreshAfterClose = false;
        const menu = new StartMenuAppMenu(
            menuSource,
            panelArrowSide(this._settings),
            this._settings,
            {
                onStartPinsChanged: () => {
                    refreshAfterClose = true;
                },
                onAppAction: () => this._queueCloseAfterAction(),
                closeApp: (targetApp, timestamp) =>
                    this._closeApp(targetApp, timestamp),
                getInterestingWindows: targetApp =>
                    this._getInterestingWindows(targetApp),
            }
        );
        const menuManager = new PopupMenu.PopupMenuManager(sourceButton);
        this._transientMenu.adopt(menu, menuManager, () => {
            if (refreshAfterClose)
                this._refreshAfterPinChange();
        });

        menu.setApp(app);
        menu.open(BoxPointer.PopupAnimation.FULL);
    }

    syncTheme() {
        this._transientMenu.syncTheme();
    }

    close() {
        this._transientMenu.close();
    }

    destroy() {
        if (this._actionCloseIdleId) {
            GLib.Source.remove(this._actionCloseIdleId);
            this._actionCloseIdleId = 0;
        }
        this._transientMenu.destroy();
        this._transientMenu = null;
        this._cursor.destroy();
        this._cursor = null;
        this._refreshAfterPinChange = null;
        this._hideTooltip = null;
        this._getInterestingWindows = null;
        this._closeMenu = null;
        this._closeApp = null;
        this._settings = null;
    }

    _queueCloseAfterAction() {
        if (this._actionCloseIdleId)
            return;

        this._actionCloseIdleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._actionCloseIdleId = 0;
                this._closeMenu();
                return GLib.SOURCE_REMOVE;
            }
        );
    }
}
