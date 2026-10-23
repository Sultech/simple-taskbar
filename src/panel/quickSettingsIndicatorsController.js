// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {appendStyle} from '../shared/styleUtils.js';

const AUTOMATIC_ICON_SPACING = -1;

export function quickSettingsIconSpacing(settings) {
    if (settings.get_boolean('windows-xp-theme-enabled'))
        return AUTOMATIC_ICON_SPACING;

    return settings.get_int('quick-settings-icon-spacing');
}

export class QuickSettingsIndicatorsController {
    constructor(indicators) {
        this._indicators = indicators;
        this._orientation = indicators.orientation;
        this._xAlign = indicators.x_align;
        this._xExpand = indicators.x_expand;
        this._style = indicators.get_style();
        this._vertical = false;
        this._childOrientations = new Map();
        indicators.connectObject(
            'child-added', (_box, child) => this._syncChild(child),
            'child-removed', (_box, child) => this._childOrientations.delete(child),
            this
        );
    }

    _syncChild(child) {
        if (!(child instanceof St.BoxLayout))
            return;

        if (!this._childOrientations.has(child))
            this._childOrientations.set(child, child.orientation);
        child.orientation = this._vertical
            ? Clutter.Orientation.VERTICAL
            : this._childOrientations.get(child);
    }

    sync(vertical, padding, spacing) {
        this._vertical = vertical;
        for (const child of this._indicators.get_children())
            this._syncChild(child);
        this._indicators.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : this._orientation;
        this._indicators.x_align = vertical
            ? Clutter.ActorAlign.CENTER
            : this._xAlign;
        this._indicators.x_expand = vertical ? false : this._xExpand;
        let style = this._style;
        if (vertical && padding !== null) {
            style = appendStyle(
                style,
                `padding-top: ${padding}px; ` +
                    `padding-bottom: ${padding}px;`
            );
        }
        if (spacing !== AUTOMATIC_ICON_SPACING)
            style = appendStyle(style, `spacing: ${spacing}px;`);
        this._indicators.set_style(style);
    }

    destroy() {
        this._indicators.disconnectObject(this);
        for (const [child, orientation] of this._childOrientations)
            child.orientation = orientation;
        this._childOrientations.clear();
        this._indicators.orientation = this._orientation;
        this._indicators.x_align = this._xAlign;
        this._indicators.x_expand = this._xExpand;
        this._indicators.set_style(this._style);
        this._indicators = null;
    }
}
