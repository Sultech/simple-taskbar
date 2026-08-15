// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

const XP_START_BUTTON_WIDTH = 100;
const XP_START_BUTTON_HEIGHT = 32;

export class WindowsXpStartButton {
    constructor() {
        this.actor = new St.Widget({
            style_class: 'simple-taskbar-xp-start-content',
            reactive: false,
            y_expand: true,
        });
        this.actor.set_width(XP_START_BUTTON_WIDTH);
        this.actor.set_height(XP_START_BUTTON_HEIGHT);
    }

    get width() {
        return XP_START_BUTTON_WIDTH;
    }

    destroy() {
        this.actor.destroy();
        this.actor = null;
    }
}
