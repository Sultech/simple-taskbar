// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

import {
    InjectionManager,
} from 'resource:///org/gnome/shell/extensions/extension.js';

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
