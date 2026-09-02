// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {WINDOWS_XP_PANEL_HEIGHT} from '../shared/windowsXpTheme.js';

export class ShowDesktopButtonController {
    constructor(settings, extensionDir, onClicked, onReplaced) {
        this._settings = settings;
        this._extensionDir = extensionDir;
        this._onClicked = onClicked;
        this._onReplaced = onReplaced;
        this._button = null;
        this._visual = null;
        this._createButton();
    }

    get actor() {
        return this._button;
    }

    enable() {
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => {
                this._syncIcon();
                this._syncStyle();
            },
            'changed::show-desktop-button-width',
            () => this._syncStyle(),
            'changed::show-desktop-button-custom-line-color-enabled',
            () => this._syncStyle(),
            'changed::show-desktop-button-custom-line-color',
            () => this._syncStyle(),
            this
        );
    }

    replace(button) {
        const checked = button.checked;
        this._destroyButton();
        this._createButton();
        this._button.checked = checked;
        this._onReplaced(this._button);
        return this._button;
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._destroyButton();
        this._onReplaced = null;
        this._onClicked = null;
        this._extensionDir = null;
        this._settings = null;
    }

    _createButton() {
        const icon = new St.Icon({
            gicon: new Gio.FileIcon({
                file: this._extensionDir
                    .get_child('icons')
                    .get_child('taskbar')
                    .get_child('xp')
                    .get_child('desktop.png'),
            }),
            icon_size: 16,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        icon.translation_y = 1;
        const glass = new St.Widget({
            style_class: 'simple-taskbar-show-desktop-glass',
            x: 2,
            y: 5,
            width: 26,
            height: 21,
        });
        const texture = new St.Widget({
            style_class: 'simple-taskbar-show-desktop-texture',
            x: 2,
            y: 5,
            width: 26,
            height: 21,
        });
        texture.set_style('background-size: 26px 21px;');
        const border = new St.Widget({
            style_class: 'simple-taskbar-show-desktop-border',
            x: 0,
            y: 3,
            width: 30,
            height: 25,
        });
        const iconHost = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x: 0,
            y: 0,
            width: 30,
            height: WINDOWS_XP_PANEL_HEIGHT,
        });
        iconHost.add_child(icon);
        this._visual = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: 30,
            height: WINDOWS_XP_PANEL_HEIGHT,
            clip_to_allocation: false,
        });
        this._visual.add_child(glass);
        this._visual.add_child(texture);
        this._visual.add_child(border);
        this._visual.add_child(iconHost);
        this._button = new St.Button({
            style_class: 'panel-button simple-taskbar-show-desktop',
            reactive: true,
            can_focus: true,
            track_hover: true,
            toggle_mode: true,
            accessible_name: _('Show desktop'),
        });
        this._button.connectObject(
            'clicked',
            () => this._onClicked(),
            this
        );
        this._syncIcon();
        this._syncStyle();
    }

    _syncIcon() {
        this._button.child =
            this._settings.get_boolean('windows-xp-theme-enabled')
                ? this._visual
                : null;
    }

    _syncStyle() {
        const vertical = panelIsVertical(this._settings);
        if (this._settings.get_boolean('windows-xp-theme-enabled')) {
            this._button.set_style(null);
            this._button.x_expand = false;
            this._button.y_expand = false;
            return;
        }

        const width = this._settings.get_int('show-desktop-button-width');
        const dimension = vertical
            ? `height: ${width}px; min-height: ${width}px;`
            : `width: ${width}px; min-width: ${width}px;`;
        const customLineColor = this._settings.get_boolean(
            'show-desktop-button-custom-line-color-enabled'
        );
        const lineColor = customLineColor
            ? ` border-color: ${this._settings.get_string(
                'show-desktop-button-custom-line-color'
            )};`
            : '';
        this._button.set_style(`${dimension}${lineColor}`);
        this._button.x_expand = vertical;
        this._button.y_expand = !vertical;
    }

    _destroyButton() {
        this._button.disconnectObject(this);
        this._button.child = null;
        this._visual.destroy();
        this._visual = null;
        this._button.destroy();
        this._button = null;
    }
}
