// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {appendStyle} from '../shared/styleUtils.js';
import {panelIsVertical} from './panelPosition.js';

const BASE_HPADDING = 12;
const MAX_DOT_WIDTH = 25;

export class PanelActivitiesController {
    constructor(settings, activities) {
        this._settings = settings;
        this._activities = activities;
        this._indicators = activities.get_first_child();
        this._orientation = this._indicators.orientation;
        this._originalStyle = activities.get_style();
        this._signalHolder = new TransientSignalHolder();
    }

    enable() {
        this._settings.connectObject(
            'changed::panel-position', () => this.sync(),
            'changed::panel-height', () => this.sync(),
            this._signalHolder
        );
        this.sync();
    }

    sync() {
        const vertical = panelIsVertical(this._settings);
        this._indicators.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : this._orientation;
        this._syncWidthCap(vertical);
        for (const dot of this._indicators.get_children())
            dot.queue_relayout();
    }

    _syncWidthCap(vertical) {
        const hpadding = Math.max(
            BASE_HPADDING,
            Math.round(
                (this._settings.get_int('panel-height') - MAX_DOT_WIDTH) / 2
            )
        );
        const style = vertical && hpadding > BASE_HPADDING
            ? appendStyle(
                this._originalStyle,
                `-natural-hpadding: ${hpadding}px;`
            )
            : this._originalStyle;
        if (this._activities.get_style() === style)
            return;

        this._activities.set_style(style);
    }

    destroy() {
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._activities.set_style(this._originalStyle);
        this._indicators.orientation = this._orientation;
        this._originalStyle = null;
        this._indicators = null;
        this._activities = null;
        this._settings = null;
    }
}
