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
        this._panelCorner = null;
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
            'changed::show-desktop-button-invisible',
            () => this._syncStyle(),
            'changed::show-desktop-button-custom-line-color-enabled',
            () => this._syncStyle(),
            'changed::show-desktop-button-custom-line-color',
            () => this._syncStyle(),
            this
        );
    }

    setPanelCorner(corner) {
        this._panelCorner = corner;
        this._syncIcon();
        this._syncStyle();
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
        this._cornerFill = new St.Widget({
            style_class: 'simple-taskbar-show-desktop-fill',
        });
        this._cornerLine = new St.Widget({
            style_class: 'simple-taskbar-show-desktop-line',
        });
        this._cornerVisual = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            clip_to_allocation: true,
        });
        this._cornerVisual.add_child(this._cornerFill);
        this._cornerVisual.add_child(this._cornerLine);
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
        if (this._settings.get_boolean('windows-xp-theme-enabled'))
            this._button.child = this._visual;
        else
            this._button.child = this._panelCorner ? this._cornerVisual : null;
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
        const lineColor = this._settings.get_boolean(
            'show-desktop-button-invisible'
        )
            ? 'transparent'
            : customLineColor
                ? this._settings.get_string('show-desktop-button-custom-line-color')
                : null;
        this._button.x_expand = vertical;
        this._button.y_expand = !vertical;
        if (this._panelCorner) {
            this._button.set_style(`${dimension} border-width: 0; background-color: transparent;`);
            this._syncCornerVisual(width, vertical, lineColor);
            return;
        }

        this._button.set_style(`${dimension}${lineColor ? ` border-color: ${lineColor};` : ''}`);
    }

    _syncCornerVisual(width, vertical, lineColor) {
        const {edge, radius, border, thickness} = this._panelCorner;
        const cornerRadius = Math.max(0, Math.min(radius, thickness / 2) - border);
        const extent = thickness - border * 2;
        const start = edge === 'start';
        const fillLength = Math.max(width, cornerRadius);
        const lineInset = width >= cornerRadius ? 0
            : Math.ceil(cornerRadius - Math.sqrt(cornerRadius ** 2 - (cornerRadius - width) ** 2));
        const corners = vertical
            ? [start, start, !start, !start]
            : [start, !start, !start, start];
        const radii = corners.map(rounded => `${rounded ? cornerRadius : 0}px`).join(' ');
        const fillOffset = start ? 0 : width - fillLength;
        const lineOffset = start ? width - 1 : 0;
        if (vertical) {
            this._cornerFill.set_position(0, fillOffset);
            this._cornerFill.set_size(extent, fillLength);
            this._cornerLine.set_position(lineInset, lineOffset);
            this._cornerLine.set_size(extent - lineInset * 2, 1);
        } else {
            this._cornerFill.set_position(fillOffset, 0);
            this._cornerFill.set_size(fillLength, extent);
            this._cornerLine.set_position(lineOffset, lineInset);
            this._cornerLine.set_size(1, extent - lineInset * 2);
        }
        this._cornerFill.set_style(`border-radius: ${radii};`);
        this._cornerLine.set_style(lineColor ? `background-color: ${lineColor};` : null);
    }

    _destroyButton() {
        this._button.disconnectObject(this);
        this._button.child = null;
        this._visual.destroy();
        this._visual = null;
        this._cornerVisual.destroy();
        this._cornerVisual = null;
        this._cornerFill = null;
        this._cornerLine = null;
        this._button.destroy();
        this._button = null;
    }
}
