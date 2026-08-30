// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

export class TaskbarWidthUpdater {
    constructor(updateWidth) {
        this._updateWidth = updateWidth;
        this._updating = false;
        this._queuedId = 0;
    }

    update() {
        if (this._updating) {
            this.queue();
            return;
        }

        this._updating = true;
        this._updateWidth();
        this._updating = false;
    }

    queue() {
        if (this._queuedId)
            return;

        const laters = global.compositor.get_laters();
        this._queuedId = laters.add(
            Meta.LaterType.BEFORE_REDRAW,
            () => {
                this._queuedId = 0;
                this.update();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    destroy() {
        if (this._queuedId) {
            global.compositor.get_laters().remove(this._queuedId);
            this._queuedId = 0;
        }
        this._updating = false;
        this._updateWidth = null;
    }
}
