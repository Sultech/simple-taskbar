// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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

function restingStagePosition(actor) {
    let [x, y] = actor.get_transformed_position();
    for (let ancestor = actor; ancestor.get_parent() !== Main.layoutManager.uiGroup; ancestor = ancestor.get_parent()) {
        x -= ancestor.translation_x;
        y -= ancestor.translation_y;
    }
    return [x, y];
}

export function pinnedPopupSource(actor) {
    const [x, y] = restingStagePosition(actor);
    const [width, height] = actor.get_transformed_size();
    Main.layoutManager.setDummyCursorGeometry(
        Math.round(x), Math.round(y), Math.round(width), Math.round(height)
    );
    return Main.layoutManager.dummyCursor;
}

export function openPopupMenuAtRestingPosition(menu, actor) {
    openPopupMenu(menu);
    menu._boxPointer.setPosition(pinnedPopupSource(actor), 0.5);
}

export function togglePopupMenu(menu, actor, pinned) {
    if (pinned && !menu.isOpen)
        openPopupMenuAtRestingPosition(menu, actor);
    else
        menu.toggle();
}

export function closePopupMenu(menu, animate = true) {
    return menu.close(popupAnimation(animate));
}
