// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';
import St from 'gi://St';

import {MaximumSizeClamp} from './maximumSizeClamp.js';

export const TaskbarViewport = GObject.registerClass(
class TaskbarViewport extends St.ScrollView {
    _init(params = {}) {
        super._init(params);
        this._clamp = new MaximumSizeClamp();
    }

    setMaximumSize(size, vertical) {
        if (this._clamp.set(size, vertical))
            this.queue_relayout();
    }

    vfunc_get_preferred_width(forHeight) {
        const [, naturalWidth] =
            super.vfunc_get_preferred_width(forHeight);
        return [0, this._clamp.width(naturalWidth)];
    }

    vfunc_get_preferred_height(forWidth) {
        const [, naturalHeight] =
            super.vfunc_get_preferred_height(forWidth);
        return [0, this._clamp.height(naturalHeight)];
    }
});
