// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export class MaximumSizeClamp {
    constructor() {
        this.size = Number.MAX_SAFE_INTEGER;
        this._vertical = false;
    }

    set(size, vertical) {
        const clamped = Math.max(1, Math.floor(size));
        if (clamped === this.size && vertical === this._vertical)
            return false;

        this.size = clamped;
        this._vertical = vertical;
        return true;
    }

    width(naturalWidth) {
        return this._vertical
            ? naturalWidth
            : Math.min(naturalWidth, this.size);
    }

    height(naturalHeight) {
        return this._vertical
            ? Math.min(naturalHeight, this.size)
            : naturalHeight;
    }
}
