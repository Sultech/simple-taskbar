// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {appendStyle} from '../shared/styleUtils.js';
import {panelIsVertical} from '../shared/panelPositionUtils.js';

const BASE_HPADDING = 12;
const MAX_DOT_WIDTH = 25;

export class PanelActivitiesController {
    constructor(settings, activities, getPanelHeight) {
        this._settings = settings;
        this._activities = activities;
        this._getPanelHeight = getPanelHeight;
        this._indicators = activities.get_first_child();
        this._orientation = this._indicators.orientation;
        this._originalStyle = activities.get_style();
    }

    enable() {
        this.sync();
    }

    destroy() {
        this._activities.set_style(this._originalStyle);
        this._indicators.orientation = this._orientation;
        this._originalStyle = null;
        this._indicators = null;
        this._activities = null;
        this._getPanelHeight = null;
        this._settings = null;
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
                (this._getPanelHeight() - MAX_DOT_WIDTH) / 2
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
}

export class ActivitiesDotWidthOverride {
    constructor(activities) {
        const dot = activities.get_first_child().get_first_child();
        this._injectionManager = new InjectionManager();
        this._injectionManager.overrideMethod(
            Object.getPrototypeOf(dot),
            'vfunc_get_preferred_width',
            originalMethod => function (forHeight) {
                if (this.get_parent().orientation ===
                    Clutter.Orientation.VERTICAL)
                    return [0, forHeight];

                return originalMethod.call(this, forHeight);
            }
        );
    }

    destroy() {
        this._injectionManager.clear();
        this._injectionManager = null;
    }
}
