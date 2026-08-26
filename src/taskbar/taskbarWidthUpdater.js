// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

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

        this._queuedId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._queuedId = 0;
                this.update();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    destroy() {
        if (this._queuedId) {
            GLib.Source.remove(this._queuedId);
            this._queuedId = 0;
        }
        this._updating = false;
        this._updateWidth = null;
    }
}
