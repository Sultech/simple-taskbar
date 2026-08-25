// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {extensionStateIsActive} from '../extensionState.js';

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
        this._signalHolder = new TransientSignalHolder();
        this._pendingUuids = new Set();
        this._disableIdleId = 0;
        this._selfDisableIdleId = 0;
    }

    enable() {
        this._settings.connectObject(
            'changed::default-gnome-panel',
            () => this._sync(),
            'changed::dock-mode',
            () => this._sync(),
            this._signalHolder
        );
        Main.extensionManager.connectObject(
            'extension-state-changed',
            (_manager, extension) => {
                const uuid = extension.uuid;
                if (ALWAYS_CONFLICTING_UUIDS.includes(uuid) &&
                    extension.enabled &&
                    extensionStateIsActive(extension)) {
                    this._queueSelfDisable();
                    return;
                }

                if (!this._shouldDisable(uuid) ||
                    !extensionStateIsActive(extension)) {
                    return;
                }

                this._queueDisable(uuid);
            },
            this._signalHolder
        );
        this._sync();
    }

    destroy() {
        this._cancelPendingDisable();
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._settings = null;
    }

    _sync() {
        this._cancelPendingDisable();
        const conflictingUuids = [...ALWAYS_CONFLICTING_UUIDS];
        if (this._dockExtensionConflictActive())
            conflictingUuids.push(...TASKBAR_DOCK_UUIDS);

        for (const uuid of conflictingUuids) {
            const extension = Main.extensionManager.lookup(uuid);
            if (extensionStateIsActive(extension))
                Main.extensionManager.disableExtension(uuid);
        }
    }

    _dockExtensionConflictActive() {
        return !this._settings.get_boolean('default-gnome-panel') ||
            this._settings.get_boolean('dock-mode');
    }

    _shouldDisable(uuid) {
        return Boolean(
            ALWAYS_CONFLICTING_UUIDS.includes(uuid) ||
            this._dockExtensionConflictActive() &&
                TASKBAR_DOCK_UUIDS.includes(uuid)
        );
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
                    if (extensionStateIsActive(extension)) {
                        Main.extensionManager.disableExtension(
                            pendingUuid
                        );
                    }
                }
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _queueSelfDisable() {
        if (this._selfDisableIdleId)
            return;

        this._selfDisableIdleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._selfDisableIdleId = 0;
                Main.extensionManager.disableExtension(
                    'simple-taskbar@sultech'
                );
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
        if (this._selfDisableIdleId) {
            GLib.Source.remove(this._selfDisableIdleId);
            this._selfDisableIdleId = 0;
        }
    }
}
