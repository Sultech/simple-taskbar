// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';

import {panelArrowSide} from '../panel/panelPosition.js';
import {openPopupMenu} from '../shared/popupMenuUtils.js';
import {StartMenuAppMenu} from './startMenuAppMenu.js';
import {StartMenuPinnedModel} from './startMenuPinnedModel.js';
import {StartMenuTransientMenu} from './startMenuTransientMenu.js';

export class StartMenuContextMenuController {
    constructor(settings, {
        applyTheme,
        closeApp,
        closeMenu,
        defaultFolderName,
        getInterestingWindows,
        hideTooltip,
        refreshAfterPinChange,
        removeFolderLabel,
    }) {
        this._settings = settings;
        this._closeApp = closeApp;
        this._closeMenu = closeMenu;
        this._getInterestingWindows = getInterestingWindows;
        this._hideTooltip = hideTooltip;
        this._refreshAfterPinChange = refreshAfterPinChange;
        this._defaultFolderName = defaultFolderName;
        this._removeFolderLabel = removeFolderLabel;
        this._pinnedModel = new StartMenuPinnedModel(settings);
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

    addHandler(button, app, folderId = null) {
        this._addHandler(button, cursorPosition =>
            this.open(button, app, {cursorPosition, folderId})
        );
    }

    addFolderHandler(button, folderId) {
        this._addHandler(button, cursorPosition =>
            this.openFolder(button, folderId, cursorPosition)
        );
    }

    _addHandler(button, open) {
        button.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_SECONDARY)
                return Clutter.EVENT_PROPAGATE;

            const [x, y] = event.get_coords();
            open({x, y});
            return Clutter.EVENT_STOP;
        });
        button.connect('popup-menu', () => {
            open(null);
            return Clutter.EVENT_STOP;
        });
    }

    open(sourceButton, app, {
        cursorPosition = null,
        folderId = null,
    } = {}) {
        this._hideTooltip(true);
        this.close();

        const menuSource = this._menuSource(sourceButton, cursorPosition);

        let pinChange = null;
        const menu = new StartMenuAppMenu(
            menuSource,
            panelArrowSide(this._settings),
            this._settings,
            {
                onStartPinsChanged: change => {
                    pinChange = {...change, sourceButton};
                },
                onAppAction: () => this._queueCloseAfterAction(),
                folderId,
                closeApp: (targetApp, timestamp) =>
                    this._closeApp(targetApp, timestamp),
                getInterestingWindows: targetApp =>
                    this._getInterestingWindows(targetApp),
            }
        );
        const menuManager = new PopupMenu.PopupMenuManager(sourceButton);
        this._transientMenu.adopt(menu, menuManager, () => {
            if (pinChange)
                this._refreshAfterPinChange(pinChange);
        });

        menu.setApp(app);
        openPopupMenu(menu);
    }

    openFolder(sourceButton, folderId, cursorPosition = null) {
        const folder = this._pinnedModel.getFolder(folderId);
        if (!folder)
            return;

        this._hideTooltip(true);
        this.close();
        const menuSource = this._menuSource(sourceButton, cursorPosition);
        const menu = new PopupMenu.PopupMenu(
            menuSource,
            0.5,
            panelArrowSide(this._settings)
        );
        const renameItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        const renameEntry = new St.Entry({
            style_class: 'simple-taskbar-windows-start-folder-name-entry',
            text: folder.name,
            can_focus: true,
            x_expand: true,
        });
        ShellEntry.addContextMenu(renameEntry);
        const saveButton = new St.Button({
            style_class: 'simple-taskbar-windows-start-folder-name-save',
            reactive: true,
            can_focus: true,
            child: new St.Icon({
                icon_name: 'object-select-symbolic',
                icon_size: 16,
            }),
        });
        renameItem.add_child(renameEntry);
        renameItem.add_child(saveButton);
        menu.addMenuItem(renameItem);
        const removeItem = new PopupMenu.PopupMenuItem(
            this._removeFolderLabel
        );
        menu.addMenuItem(removeItem);

        let refreshAfterClose = false;
        const saveName = () => {
            const name = renameEntry.get_text().trim() ||
                this._defaultFolderName;
            if (this._pinnedModel.renameFolder(folderId, name))
                refreshAfterClose = true;
            menu.close();
        };
        renameEntry.clutter_text.connect('activate', saveName);
        saveButton.connect('clicked', saveName);
        removeItem.connect('activate', () => {
            if (this._pinnedModel.removeFolder(folderId))
                refreshAfterClose = true;
        });

        const menuManager = new PopupMenu.PopupMenuManager(sourceButton);
        this._transientMenu.adopt(menu, menuManager, () => {
            if (refreshAfterClose)
                this._refreshAfterPinChange();
        });
        openPopupMenu(menu);
        renameEntry.grab_key_focus();
        renameEntry.clutter_text.set_selection(0, -1);
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
        this._pinnedModel = null;
        this._cursor.destroy();
        this._cursor = null;
        this._refreshAfterPinChange = null;
        this._removeFolderLabel = null;
        this._defaultFolderName = null;
        this._hideTooltip = null;
        this._getInterestingWindows = null;
        this._closeMenu = null;
        this._closeApp = null;
        this._settings = null;
    }

    _menuSource(sourceButton, cursorPosition) {
        if (!cursorPosition)
            return sourceButton;

        this._cursor.set_position(
            Math.round(cursorPosition.x),
            Math.round(cursorPosition.y)
        );
        return this._cursor;
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
