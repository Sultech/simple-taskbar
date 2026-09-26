// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';

const SHELL_VERSION = parseInt(Config.PACKAGE_VERSION);

function popupAnimation(animate) {
    if (SHELL_VERSION >= 51)
        return {animate};

    return animate
        ? BoxPointer.PopupAnimation.FULL
        : BoxPointer.PopupAnimation.NONE;
}

export function openPopupMenu(menu) {
    return menu.open(popupAnimation(true));
}

export function closePopupMenu(menu, animate = true) {
    return menu.close(popupAnimation(animate));
}
