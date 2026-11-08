// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';

const PRESSURE_TIMEOUT = 1000;
const BARRIER_CORNER_INSET = 1;
const BARRIER_DIRECTIONS = {
    top: Meta.BarrierDirection.POSITIVE_Y,
    bottom: Meta.BarrierDirection.NEGATIVE_Y,
    left: Meta.BarrierDirection.POSITIVE_X,
    right: Meta.BarrierDirection.NEGATIVE_X,
};

export function pressureBarriersSupported() {
    return Boolean(global.backend.capabilities & Meta.BackendCapabilities.BARRIERS);
}

export class EdgePressureBarrier {
    constructor({edge, position, threshold, onTrigger}) {
        this._barrier = new Meta.Barrier({
            backend: global.backend,
            ...edge,
            directions: BARRIER_DIRECTIONS[position],
        });
        this._pressureBarrier = new Layout.PressureBarrier(
            threshold,
            PRESSURE_TIMEOUT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW
        );
        this._pressureBarrier.addBarrier(this._barrier);
        this._triggerId = this._pressureBarrier.connect('trigger', onTrigger);
    }

    destroy() {
        this._pressureBarrier.disconnect(this._triggerId);
        this._pressureBarrier.removeBarrier(this._barrier);
        this._barrier.destroy();
        this._pressureBarrier.destroy();
        this._triggerId = 0;
        this._barrier = null;
        this._pressureBarrier = null;
    }
}

export function panelPressureBarrierEdge({monitor, workArea, geometry, limit, position}) {
    if (geometry.vertical) {
        const y1 = limit
            ? geometry.y
            : workArea.y + BARRIER_CORNER_INSET;
        const y2 = limit
            ? geometry.y + geometry.height
            : workArea.y + workArea.height - BARRIER_CORNER_INSET;
        const x = position === 'left'
            ? monitor.x
            : monitor.x + monitor.width;
        return {x1: x, x2: x, y1, y2};
    }

    const x1 = limit
        ? geometry.x
        : workArea.x + BARRIER_CORNER_INSET;
    const x2 = limit
        ? geometry.x + geometry.width
        : workArea.x + workArea.width - BARRIER_CORNER_INSET;
    const y = position === 'top'
        ? monitor.y
        : monitor.y + monitor.height;
    return {x1, x2, y1: y, y2: y};
}
