// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import {
    MAGNIFY_SETTLE_TIME_CONSTANTS,
} from './taskbarHoverAnimationConstants.js';

export class TaskbarHoverAnimationSmoothing {
    constructor() {
        this._factor = 0;
        this._lastPassTime = 0;
    }

    getFactor() {
        return this._factor;
    }

    beginPass(settleDuration) {
        const now = GLib.get_monotonic_time();
        const previous = this._lastPassTime;
        this._lastPassTime = now;
        const timeConstant = settleDuration / MAGNIFY_SETTLE_TIME_CONSTANTS;
        if (!previous || timeConstant <= 0) {
            this._factor = previous ? 1 : 0;
            return;
        }

        this._factor = 1 - Math.exp(-(now - previous) / 1000 / timeConstant);
    }

    reset() {
        this._factor = 0;
        this._lastPassTime = 0;
    }
}
