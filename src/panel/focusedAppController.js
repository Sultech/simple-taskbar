// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as ShellAppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {closePopupMenu} from '../popupMenuUtils.js';
import {panelArrowSide, syncPanelMenuPosition} from './panelMenuPositioner.js';

export class FocusedAppController {
    constructor(settings) {
        this._settings = settings;
        this._tracker = Shell.WindowTracker.get_default();
        this._menuManager = null;
        this._menu = null;
        this._app = null;
        this._window = null;

        this._button = new PanelMenu.Button(0.5, _('Focused application'), true);
        this._button.add_style_class_name('simple-taskbar-focused-app-button');
        const box = new St.BoxLayout({style_class: 'simple-taskbar-focused-app'});
        this._icon = new St.Icon({style_class: 'simple-taskbar-focused-app-icon'});
        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._icon);
        box.add_child(this._label);
        this._button.add_child(box);
        this.actor = this._button.container;
    }

    enable(menuManager = Main.panel.menuManager) {
        this._menuManager = menuManager;
        this._menu = new ShellAppMenu.AppMenu(this._button, panelArrowSide(this._settings), {
            favoritesSection: true,
        });
        this._button.setMenu(this._menu);
        this._menuManager.addMenu(this._menu);
        syncPanelMenuPosition(this._menu, this._settings);

        this._tracker.connectObject('notify::focus-app', () => this._syncApp(), this);
        global.display.connectObject('notify::focus-window', () => this._syncApp(), this);
        Main.overview.connectObject('hidden', () => this._syncApp(), this);
        this._settings.connectObject(
            'changed::focused-app-visible', () => this._syncVisibility(),
            'changed::focused-app-label', () => this._syncLabel(),
            'changed::focused-app-max-width', () => this._syncLabel(),
            this
        );
        this._syncApp();
    }

    destroy() {
        this._tracker.disconnectObject(this);
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._settings.disconnectObject(this);
        if (this._window)
            this._window.disconnectObject(this);

        this._menuManager.removeMenu(this._menu);
        this._button.setMenu(null);
        this._menu = null;
        this._menuManager = null;
        this._button.destroy();
        this._button = null;
        this._icon = null;
        this._label = null;
        this.actor = null;
        this._window = null;
        this._app = null;
        this._tracker = null;
        this._settings = null;
    }

    _syncApp() {
        const app = this._tracker.focus_app;
        if (!app && (Main.overview.visible || this._menu.isOpen))
            return;

        const window = app ? global.display.focus_window : null;
        if (window !== this._window) {
            if (this._window)
                this._window.disconnectObject(this);
            this._window = window;
            if (window)
                window.connectObject('notify::title', () => this._syncLabel(), this);
        }
        if (app !== this._app) {
            this._app = app;
            this._menu.setApp(app);
            this._icon.gicon = app ? app.icon : null;
        }
        this._syncLabel();
        this._syncVisibility();
    }

    _syncLabel() {
        if (!this._app)
            return;

        const name = this._app.get_name();
        const title = this._window ? this._window.get_title() : '';
        const mode = this._settings.get_string('focused-app-label');
        if (mode === 'window-title') {
            this._label.text = title || name;
        } else if (mode === 'app-name-and-title' && title) {
            const separatorIndex = Math.max(title.lastIndexOf(' - '), title.lastIndexOf(' — '));
            const windowTitle = separatorIndex > 0 ? title.slice(0, separatorIndex) : title;
            this._label.text = windowTitle === name ? name : `${name} — ${windowTitle}`;
        } else {
            this._label.text = name;
        }
        this._label.set_style(`max-width: ${this._settings.get_int('focused-app-max-width')}px;`);
        this._button.accessible_name = this._label.text;
    }

    _syncVisibility() {
        const visible = this._settings.get_boolean('focused-app-visible') &&
            !panelIsVertical(this._settings) && Boolean(this._app);
        this.actor.visible = visible;
        if (!visible)
            closePopupMenu(this._menu, false);
    }
}
