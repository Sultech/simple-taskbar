// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const ALWAYS_CONFLICTING_UUIDS = [
    'dash-to-panel@jderose9.github.com',
];
const TASKBAR_DOCK_UUIDS = [
    'dash-to-dock@micxgx.gmail.com',
    'ubuntu-dock@ubuntu.com',
];

export class ExtensionConflictController {
    constructor(settings) {
        this._settings = settings;
        this._signals = [];
        this._pendingUuids = new Set();
        this._disableIdleId = 0;
    }

    enable() {
        this._connect(
            this._settings,
            'changed::default-gnome-panel',
            () => this._sync()
        );
        this._connect(
            Main.extensionManager,
            'extension-state-changed',
            (_manager, extension) => {
                const uuid = extension?.uuid;
                if (!this._shouldDisable(uuid) ||
                    !this._extensionIsActive(extension)) {
                    return;
                }

                this._queueDisable(uuid);
            }
        );
        this._sync();
    }

    destroy() {
        this._cancelPendingDisable();
        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];
        this._settings = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _sync() {
        this._cancelPendingDisable();
        const conflictingUuids = [...ALWAYS_CONFLICTING_UUIDS];
        if (this._taskbarModeActive())
            conflictingUuids.push(...TASKBAR_DOCK_UUIDS);

        for (const uuid of conflictingUuids) {
            const extension = Main.extensionManager.lookup(uuid);
            if (this._extensionIsActive(extension))
                Main.extensionManager.disableExtension(uuid);
        }
    }

    _taskbarModeActive() {
        return Boolean(
            this._settings &&
            !this._settings.get_boolean('default-gnome-panel')
        );
    }

    _shouldDisable(uuid) {
        return Boolean(
            ALWAYS_CONFLICTING_UUIDS.includes(uuid) ||
            this._taskbarModeActive() && TASKBAR_DOCK_UUIDS.includes(uuid)
        );
    }

    _extensionIsActive(extension) {
        return extension?.state === ExtensionUtils.ExtensionState.ACTIVE;
    }

    _queueDisable(uuid) {
        this._pendingUuids.add(uuid);
        if (this._disableIdleId)
            return;

        this._disableIdleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._disableIdleId = 0;
                const pendingUuids = [...this._pendingUuids];
                this._pendingUuids.clear();
                for (const pendingUuid of pendingUuids) {
                    if (!this._shouldDisable(pendingUuid))
                        continue;

                    const extension =
                        Main.extensionManager.lookup(pendingUuid);
                    if (this._extensionIsActive(extension)) {
                        Main.extensionManager.disableExtension(
                            pendingUuid
                        );
                    }
                }
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelPendingDisable() {
        if (this._disableIdleId) {
            GLib.Source.remove(this._disableIdleId);
            this._disableIdleId = 0;
        }
        this._pendingUuids.clear();
    }
}
