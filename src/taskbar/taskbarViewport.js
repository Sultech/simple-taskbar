// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';
import St from 'gi://St';

export const TaskbarViewport = GObject.registerClass(
class TaskbarViewport extends St.ScrollView {
    _init(params = {}) {
        super._init(params);
        this._maximumWidth = Number.MAX_SAFE_INTEGER;
    }

    setMaximumWidth(width) {
        const maximumWidth = Math.max(1, Math.floor(width));
        if (maximumWidth === this._maximumWidth)
            return;

        this._maximumWidth = maximumWidth;
        this.queue_relayout();
    }

    vfunc_get_preferred_width(forHeight) {
        const [, naturalWidth] =
            super.vfunc_get_preferred_width(forHeight);
        return [0, Math.min(naturalWidth, this._maximumWidth)];
    }
});
