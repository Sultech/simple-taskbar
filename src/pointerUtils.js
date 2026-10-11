// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

const POINTER_BUTTON_MASK = Clutter.ModifierType.BUTTON1_MASK |
    Clutter.ModifierType.BUTTON2_MASK |
    Clutter.ModifierType.BUTTON3_MASK;
const CLICK_REPLAY_POLL_INTERVAL = 10;
const CLICK_REPLAY_TIMEOUT = 1000;

export function pointerButtonIsPressed() {
    const [, , modifiers] = global.get_pointer();
    return Boolean(modifiers & POINTER_BUTTON_MASK);
}

export class PointerClickReplay {
    constructor() {
        this._device = null;
        this._timeoutId = 0;
    }

    replay(actor, button) {
        this.cancel();
        this._device ??= global.stage.context.get_backend()
            .get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        let waited = 0;
        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            CLICK_REPLAY_POLL_INTERVAL,
            () => {
                if (pointerButtonIsPressed()) {
                    waited += CLICK_REPLAY_POLL_INTERVAL;
                    if (waited < CLICK_REPLAY_TIMEOUT)
                        return GLib.SOURCE_CONTINUE;
                    this._timeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }

                this._timeoutId = 0;
                const [x, y] = global.get_pointer();
                const target = global.stage.get_actor_at_pos(
                    Clutter.PickMode.REACTIVE,
                    x,
                    y
                );
                if (actor.mapped && target && actor.contains(target))
                    this._click(button);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    cancel() {
        if (this._timeoutId)
            GLib.Source.remove(this._timeoutId);
        this._timeoutId = 0;
    }

    destroy() {
        this.cancel();
        this._device = null;
    }

    _click(button) {
        this._device.notify_button(
            Clutter.CURRENT_TIME,
            button,
            Clutter.ButtonState.PRESSED
        );
        this._device.notify_button(
            Clutter.CURRENT_TIME,
            button,
            Clutter.ButtonState.RELEASED
        );
    }
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
