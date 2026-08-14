// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export function extensionStateIsActive(extension) {
    return extension?.state === ExtensionUtils.ExtensionState.ACTIVE;
}

export function extensionIsActive(uuid) {
    return extensionStateIsActive(Main.extensionManager.lookup(uuid));
}

export function extensionWillBeActive(uuid) {
    const extension = Main.extensionManager.lookup(uuid);
    return Boolean(extension?.enabled || extensionStateIsActive(extension));
}
