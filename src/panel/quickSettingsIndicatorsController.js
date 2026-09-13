// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

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
    }

    sync(vertical, padding, spacing) {
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
        this._indicators.orientation = this._orientation;
        this._indicators.x_align = this._xAlign;
        this._indicators.x_expand = this._xExpand;
        this._indicators.set_style(this._style);
        this._indicators = null;
    }
}
