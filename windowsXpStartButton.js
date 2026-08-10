// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

const XP_START_BUTTON_WIDTH = 99;
const XP_START_FLAG_SIZE = 20;

export class WindowsXpStartButton {
    constructor(extensionDir) {
        const assetDir = extensionDir
            .get_child('icons')
            .get_child('start')
            .get_child('xp');
        this._flag = new St.Icon({
            style_class: 'simple-taskbar-xp-start-flag',
            gicon: new Gio.FileIcon({
                file: assetDir.get_child('start_flag.png'),
            }),
            icon_size: XP_START_FLAG_SIZE,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
        });
        this._label = new St.Label({
            style_class: 'simple-taskbar-xp-start-label',
            text: 'start',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._body = new St.Widget({
            style_class: 'simple-taskbar-xp-start-body',
            reactive: false,
            x_expand: true,
            y_expand: true,
        });
        this._content = new St.BoxLayout({
            style_class: 'simple-taskbar-xp-start-row',
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        this._content.add_child(this._flag);
        this._content.add_child(this._label);
        this._border = new St.Widget({
            style_class: 'simple-taskbar-xp-start-border',
            reactive: false,
            x_expand: true,
            y_expand: true,
        });
        this.actor = new St.Widget({
            style_class: 'simple-taskbar-xp-start-content',
            layout_manager: new Clutter.BinLayout(),
            y_expand: true,
        });
        this.actor.add_child(this._body);
        this.actor.add_child(this._border);
        this.actor.add_child(this._content);
        this.actor.set_width(XP_START_BUTTON_WIDTH);
        this.actor.set_height(31);
    }

    get width() {
        return XP_START_BUTTON_WIDTH;
    }

    destroy() {
        this.actor.destroy();
        this.actor = null;
        this._body = null;
        this._content = null;
        this._border = null;
        this._flag = null;
        this._label = null;
    }
}
