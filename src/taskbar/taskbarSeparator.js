// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

export const TASKBAR_SEPARATOR_EXTENT = 13;
export const TASKBAR_SEPARATOR_LINE_SIZE = 1;

const SEPARATOR_ANIMATION_TIME = 150;

export function createTaskbarSeparator() {
    const separator = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        reactive: false,
        clip_to_allocation: true,
    });
    const line = new St.Widget({
        style_class: 'simple-taskbar-separator',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        reactive: false,
    });
    separator.add_child(line);
    return {separator, line};
}

export function syncSeparatorGeometry(separator, line, vertical, iconSize) {
    if (vertical) {
        separator.set_width(iconSize);
        line.set_size(iconSize, TASKBAR_SEPARATOR_LINE_SIZE);
    } else {
        separator.set_height(iconSize);
        line.set_size(TASKBAR_SEPARATOR_LINE_SIZE, iconSize);
    }
}

export function animateSeparatorIn(separator, vertical, animate = true) {
    const property = vertical ? 'height' : 'width';
    const reversing = separator.get_transition(property) !== null;
    separator.remove_all_transitions();
    if (!animate || !St.Settings.get().enable_animations)
        return false;

    if (!reversing) {
        separator[property] = 0;
        separator.opacity = 0;
    }
    separator.ease({
        [property]: TASKBAR_SEPARATOR_EXTENT,
        opacity: 255,
        duration: SEPARATOR_ANIMATION_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    });
    return true;
}

export function animateSeparatorOut(
    separator,
    vertical,
    onStopped,
    animate = true
) {
    const property = vertical ? 'height' : 'width';
    separator.remove_all_transitions();
    if (!animate || !St.Settings.get().enable_animations)
        return false;

    separator.ease({
        [property]: 0,
        opacity: 0,
        duration: SEPARATOR_ANIMATION_TIME,
        mode: Clutter.AnimationMode.EASE_IN_CUBIC,
        onStopped: finished => {
            if (finished)
                onStopped();
        },
    });
    return true;
}
