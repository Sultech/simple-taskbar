// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';

const SHELL_VERSION = parseInt(Config.PACKAGE_VERSION);

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

export function dispatchItemButtonPress(event, {modifierClick, middleClick, secondaryClick}) {
    const mouseButton = event.get_button();
    const actionKey = modifierClickActionKey(event);
    if (mouseButton === Clutter.BUTTON_PRIMARY && actionKey) {
        modifierClick(actionKey);
        return Clutter.EVENT_STOP;
    }
    if (mouseButton === Clutter.BUTTON_MIDDLE) {
        middleClick(Boolean(event.get_state() & Clutter.ModifierType.SHIFT_MASK));
        return Clutter.EVENT_STOP;
    }
    if (mouseButton === Clutter.BUTTON_SECONDARY) {
        secondaryClick();
        return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
}

export class PanelScrollDirection {
    constructor(settings) {
        this._settings = settings;
        this._peripheralSettings = SHELL_VERSION < 49
            ? {
                touchpad: new Gio.Settings({schema_id: 'org.gnome.desktop.peripherals.touchpad'}),
                mouse: new Gio.Settings({schema_id: 'org.gnome.desktop.peripherals.mouse'}),
            }
            : null;
    }

    destroy() {
        this._peripheralSettings = null;
        this._settings = null;
    }

    get ignoresNaturalScroll() {
        return this._settings.get_boolean('panel-scroll-ignore-natural');
    }

    sign(event) {
        return this.ignoresNaturalScroll && this._isInverted(event) ? -1 : 1;
    }

    _isInverted(event) {
        if (SHELL_VERSION >= 49)
            return Boolean(event.get_scroll_flags() & Clutter.ScrollFlags.INVERTED);

        const touchpad = event.get_source_device().get_device_type() === Clutter.InputDeviceType.TOUCHPAD_DEVICE;
        const settings = touchpad ? this._peripheralSettings.touchpad : this._peripheralSettings.mouse;
        return settings.get_boolean('natural-scroll');
    }
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
