// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    TaskbarLocation,
    TRASH_URI,
} from './taskbarLocation.js';

export class TaskbarLocationsController {
    constructor({settings, scope, onChanged}) {
        this._settings = settings;
        this._onChanged = onChanged;
        this._showLocationsKey = scope === 'dock'
            ? 'dock-show-locations'
            : 'taskbar-show-locations';
        this._showTrashKey = scope === 'dock'
            ? 'dock-show-trash'
            : 'taskbar-show-trash';
        this._showMountsKey = scope === 'dock'
            ? 'dock-show-mounts'
            : 'taskbar-show-mounts';
        this._showMountedOnlyKey = 'locations-show-mounted-only';
        this._showNetworkKey = 'locations-show-network';
        this._monitor = Gio.VolumeMonitor.get();
        this._monitorSignalIds = [];
        this._settingsSignalIds = [];
        this._volumeSyncId = 0;
        this._volumeApps = [];
        this._volumeAppSignalIds = [];
        this._volumeFallbackIds = new WeakMap();
        this._nextVolumeFallbackId = 0;
        this._trashApp = null;

        for (const [signal, callback] of [
            [`changed::${this._showLocationsKey}`, () => this._sync()],
            [`changed::${this._showTrashKey}`, () => this._sync()],
            [`changed::${this._showMountsKey}`, () => this._sync()],
            [`changed::${this._showMountedOnlyKey}`, () => this._sync()],
            [`changed::${this._showNetworkKey}`, () => this._sync()],
        ]) {
            this._settingsSignalIds.push(
                this._settings.connect(signal, callback)
            );
        }
        for (const signal of [
            'volume-added',
            'volume-removed',
            'volume-changed',
            'mount-added',
            'mount-removed',
            'mount-changed',
        ]) {
            this._monitorSignalIds.push(
                this._monitor.connect(signal, () => this._queueVolumeSync())
            );
        }
        this._sync(false);
    }

    getEntries() {
        if (!this._settings.get_boolean(this._showLocationsKey)) {
            return [];
        }

        const entries = this._volumeApps.map(app => this._createEntry(app));
        if (this._trashApp)
            entries.push(this._createEntry(this._trashApp));
        return entries;
    }

    _createEntry(app) {
        return {
            key: app.get_id(),
            app,
            window: null,
            isLauncher: false,
            isCombined: false,
            isPinnedPrimary: false,
        };
    }

    destroy() {
        if (this._volumeSyncId) {
            GLib.Source.remove(this._volumeSyncId);
            this._volumeSyncId = 0;
        }
        for (const id of this._settingsSignalIds)
            this._settings.disconnect(id);
        this._settingsSignalIds = [];
        for (const id of this._monitorSignalIds)
            this._monitor.disconnect(id);
        this._monitorSignalIds = [];
        this._destroyVolumeApps();
        this._destroyTrashApp();
        this._monitor = null;
        this._onChanged = null;
        this._settings = null;
    }

    _sync(notify = true) {
        const enabled = this._settings.get_boolean(this._showLocationsKey);
        if (!enabled) {
            this._destroyVolumeApps();
            this._destroyTrashApp();
        } else {
            if (this._settings.get_boolean(this._showMountsKey))
                this._syncVolumes();
            else
                this._destroyVolumeApps();

            if (this._settings.get_boolean(this._showTrashKey))
                this._ensureTrashApp();
            else
                this._destroyTrashApp();
        }
        if (notify)
            this._onChanged();
    }

    _queueVolumeSync() {
        if (this._volumeSyncId)
            return;
        this._volumeSyncId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._volumeSyncId = 0;
                this._sync();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _syncVolumes() {
        this._destroyVolumeApps();
        for (const volume of this._monitor.get_volumes()) {
            if (this._includeVolume(volume))
                this._addVolume(volume);
        }
    }

    _includeVolume(volume) {
        if (!this._settings.get_boolean(this._showNetworkKey) &&
            volume.get_identifier('class') === 'network') {
            return false;
        }

        const mount = volume.get_mount();
        if (mount) {
            if (mount.is_shadowed())
                return false;
            return mount.can_eject() || mount.can_unmount();
        }

        if (this._settings.get_boolean(this._showMountedOnlyKey))
            return false;
        return volume.can_mount() || volume.can_eject();
    }

    _getVolumeIdentifier(volume) {
        const mount = volume.get_mount();
        const uuid = (mount ? mount.get_uuid() : null) || volume.get_uuid();
        if (uuid)
            return `uuid:${uuid}`;

        const unixDevice = volume.get_identifier('unix-device');
        if (unixDevice)
            return `device:${unixDevice}`;

        const location = mount
            ? mount.get_default_location()
            : volume.get_activation_root();
        if (location)
            return `uri:${location.get_uri()}`;

        let identifier = this._volumeFallbackIds.get(volume);
        if (!identifier) {
            identifier = `object:${this._nextVolumeFallbackId++}`;
            this._volumeFallbackIds.set(volume, identifier);
        }
        return identifier;
    }

    _addVolume(volume) {
        const identifier = this._getVolumeIdentifier(volume);
        const app = new TaskbarLocation({
            id: `location:volume:${identifier}`,
            name: volume.get_name(),
            type: 'volume',
            volume,
        });
        this._volumeAppSignalIds.push([
            app,
            app.connect('mount-changed', () => {
                if (this._settings.get_boolean(this._showMountedOnlyKey))
                    this._queueVolumeSync();
            }),
        ]);
        this._volumeApps.push(app);
    }

    _ensureTrashApp() {
        if (this._trashApp)
            return;
        this._trashApp = new TaskbarLocation({
            id: `location:${TRASH_URI}`,
            name: _('Trash'),
            type: 'trash',
        });
    }

    _destroyVolumeApps() {
        for (const [app, id] of this._volumeAppSignalIds)
            app.disconnect(id);
        this._volumeAppSignalIds = [];
        for (const app of this._volumeApps)
            app.destroy();
        this._volumeApps = [];
    }

    _destroyTrashApp() {
        if (!this._trashApp)
            return;
        this._trashApp.destroy();
        this._trashApp = null;
    }
}
