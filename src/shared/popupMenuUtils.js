// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';

const SHELL_VERSION = parseInt(Config.PACKAGE_VERSION);
const popupMenus = new Map();
let workareasChangedId = 0;
let popupSyncId = 0;

function unregisterPopupMenu(menu) {
    popupMenus.delete(menu);
    if (popupMenus.size !== 0)
        return;

    if (workareasChangedId) {
        global.display.disconnect(workareasChangedId);
        workareasChangedId = 0;
    }
    if (popupSyncId) {
        global.stage.disconnect(popupSyncId);
        popupSyncId = 0;
    }
}

function syncPopupMenus() {
    for (const [menu, syncSource] of popupMenus) {
        if (syncSource)
            syncSource();
        menu._boxPointer.setPosition(
            menu.sourceActor,
            menu._arrowAlignment
        );
    }
}

function queuePopupMenuSync() {
    if (popupSyncId)
        return;

    popupSyncId = global.stage.connect('after-update', () => {
        global.stage.disconnect(popupSyncId);
        popupSyncId = 0;
        syncPopupMenus();
    });
}

export function registerPopupMenu(menu, syncSource) {
    if (!popupMenus.has(menu)) {
        popupMenus.set(menu, syncSource);
        menu.actor.connect(
            'destroy',
            () => unregisterPopupMenu(menu)
        );
    } else if (syncSource) {
        popupMenus.set(menu, syncSource);
    }

    if (!workareasChangedId) {
        workareasChangedId = global.display.connect(
            'workareas-changed',
            queuePopupMenuSync
        );
    }
}

function popupAnimation(animate) {
    if (SHELL_VERSION === 51)
        return {animate};

    return animate
        ? BoxPointer.PopupAnimation.FULL
        : BoxPointer.PopupAnimation.NONE;
}

export function openPopupMenu(menu, syncSource = null) {
    registerPopupMenu(menu, syncSource);
    return menu.open(popupAnimation(true));
}

export function closePopupMenu(menu, animate = true) {
    return menu.close(popupAnimation(animate));
}
