// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

export class SourcePressGuard {
    constructor() {
        this._pressedWhileOpen = false;
        this._resetId = 0;
    }

    mark() {
        this._pressedWhileOpen = true;
        if (this._resetId)
            GLib.Source.remove(this._resetId);
        this._resetId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._resetId = 0;
                this._pressedWhileOpen = false;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    consume() {
        const pressedWhileOpen = this._pressedWhileOpen;
        this._pressedWhileOpen = false;
        return pressedWhileOpen;
    }

    clear() {
        this._pressedWhileOpen = false;
    }

    destroy() {
        if (this._resetId) {
            GLib.Source.remove(this._resetId);
            this._resetId = 0;
        }
        this._pressedWhileOpen = false;
    }
}
