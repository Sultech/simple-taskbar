// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

const POINTER_BUTTON_MASK = Clutter.ModifierType.BUTTON1_MASK |
    Clutter.ModifierType.BUTTON2_MASK |
    Clutter.ModifierType.BUTTON3_MASK;

export function pointerButtonIsPressed() {
    const [, , modifiers] = global.get_pointer();
    return Boolean(modifiers & POINTER_BUTTON_MASK);
}

export function modifierClickActionKey(event) {
    const state = event.get_state();
    if (state & Clutter.ModifierType.SHIFT_MASK)
        return 'shift-click-action';
    if (state & Clutter.ModifierType.CONTROL_MASK)
        return 'ctrl-click-action';
    return null;
}

export function destroyPressureBarrier(pressureBarrier, barrier) {
    if (pressureBarrier && barrier)
        pressureBarrier.removeBarrier(barrier);
    barrier?.destroy();
    pressureBarrier?.destroy();
}

export function getScrollDelta(event, increment) {
    switch (event.get_scroll_direction()) {
    case Clutter.ScrollDirection.UP:
    case Clutter.ScrollDirection.LEFT:
        return -increment;
    case Clutter.ScrollDirection.DOWN:
    case Clutter.ScrollDirection.RIGHT:
        return increment;
    case Clutter.ScrollDirection.SMOOTH: {
        const [dx, dy] = event.get_scroll_delta();
        return (Math.abs(dx) > Math.abs(dy) ? dx : dy) * increment;
    }
    }

    return 0;
}

export function isPrimaryPressOrTouch(event) {
    const type = event.type();
    return type === Clutter.EventType.TOUCH_BEGIN ||
        (type === Clutter.EventType.BUTTON_PRESS &&
            event.get_button() === Clutter.BUTTON_PRIMARY);
}

export function clickCameFromKeyboard() {
    return Clutter.get_current_event().type() === Clutter.EventType.KEY_RELEASE;
}
