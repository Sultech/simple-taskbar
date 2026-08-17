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
