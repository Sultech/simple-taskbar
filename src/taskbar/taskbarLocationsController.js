// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    TaskbarLocation,
    TRASH_URI,
} from './taskbarLocation.js';

const COMMON_FOLDER_DEFINITIONS = [
    {
        key: 'locations-show-home',
        startMenuKey: 'start-menu-show-home',
        name: 'Home',
        iconName: 'user-home',
        startMenuIconName: 'user-home-symbolic',
        directory: null,
        fallback: 'Home',
    },
    {
        key: 'locations-show-desktop',
        startMenuKey: 'start-menu-show-desktop',
        name: 'Desktop',
        iconName: 'user-desktop',
        startMenuIconName: 'user-desktop-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_DESKTOP,
        fallback: 'Desktop',
    },
    {
        key: 'locations-show-documents',
        startMenuKey: 'start-menu-show-documents',
        name: 'Documents',
        iconName: 'folder-documents',
        startMenuIconName: 'folder-documents-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_DOCUMENTS,
        fallback: 'Documents',
    },
    {
        key: 'locations-show-downloads',
        startMenuKey: 'start-menu-show-downloads',
        name: 'Downloads',
        iconName: 'folder-download',
        startMenuIconName: 'folder-download-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_DOWNLOAD,
        fallback: 'Downloads',
    },
    {
        key: 'locations-show-music',
        startMenuKey: 'start-menu-show-music',
        name: 'Music',
        iconName: 'folder-music',
        startMenuIconName: 'folder-music-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_MUSIC,
        fallback: 'Music',
    },
    {
        key: 'locations-show-pictures',
        startMenuKey: 'start-menu-show-pictures',
        name: 'Pictures',
        iconName: 'folder-pictures',
        startMenuIconName: 'folder-pictures-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_PICTURES,
        fallback: 'Pictures',
    },
    {
        key: 'locations-show-videos',
        startMenuKey: 'start-menu-show-videos',
        name: 'Videos',
        iconName: 'folder-videos',
        startMenuIconName: 'folder-videos-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_VIDEOS,
        fallback: 'Videos',
    },
];

export class TaskbarLocationsController {
    constructor({settings, scope, onChanged}) {
        this._settings = settings;
        this._onChanged = onChanged;
        this._folderOnly = scope === 'start-menu';
        this._showLocationsKey = scope === 'dock'
            ? 'dock-show-locations'
            : scope === 'start-menu'
                ? 'start-menu-show-locations'
                : 'taskbar-show-locations';
        this._showTrashKey = scope === 'dock'
            ? 'dock-show-trash'
            : 'taskbar-show-trash';
        this._showMountsKey = scope === 'dock'
            ? 'dock-show-mounts'
            : 'taskbar-show-mounts';
        this._showMountedOnlyKey = 'locations-show-mounted-only';
        this._showNetworkKey = 'locations-show-network';
        this._folderApps = [];
        this._monitor = Gio.VolumeMonitor.get();
        this._monitorSignalIds = [];
        this._settingsSignalIds = [];
        this._volumeEventId = 0;
        this._volumeApps = [];
        this._volumeAppsByVolume = new Map();
        this._volumeAppSignalIds = new Map();
        this._volumeEvents = [];
        this._volumeFallbackIds = new WeakMap();
        this._nextVolumeFallbackId = 0;
        this._trashApp = null;

        for (const [signal, callback] of [
            [`changed::${this._showLocationsKey}`, () => this._sync()],
            [`changed::${this._showTrashKey}`, () => this._sync()],
            [`changed::${this._showMountsKey}`, () => this._sync()],
            [`changed::${this._showMountedOnlyKey}`, () => this._sync()],
            [`changed::${this._showNetworkKey}`, () => this._sync()],
            ...COMMON_FOLDER_DEFINITIONS.map(folder => [
                `changed::${this._folderOnly
                    ? folder.startMenuKey
                    : folder.key}`,
                () => this._sync(),
            ]),
        ]) {
            this._settingsSignalIds.push(
                this._settings.connect(signal, callback)
            );
        }
        if (!this._folderOnly) {
            for (const signal of [
                'volume-added',
                'volume-removed',
                'volume-changed',
                'mount-added',
                'mount-removed',
                'mount-changed',
            ]) {
                this._monitorSignalIds.push(
                    this._monitor.connect(signal, (_monitor, object) =>
                        this._queueVolumeEvent(signal, object)
                    )
                );
            }
        }
        this._sync(false);
    }

    getEntries() {
        const entries = this.getFolderEntries();
        if (this._folderOnly)
            return entries;

        entries.push(...this._volumeApps.map(app => this._createEntry(app)));
        if (this._trashApp)
            entries.push(this._createEntry(this._trashApp));
        return entries;
    }

    getFolderEntries() {
        if (!this._settings.get_boolean(this._showLocationsKey))
            return [];

        return this._folderApps.map(app => this._createEntry(app));
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
        if (this._volumeEventId) {
            GLib.Source.remove(this._volumeEventId);
            this._volumeEventId = 0;
        }
        this._volumeEvents = [];
        for (const id of this._settingsSignalIds)
            this._settings.disconnect(id);
        this._settingsSignalIds = [];
        for (const id of this._monitorSignalIds)
            this._monitor.disconnect(id);
        this._monitorSignalIds = [];
        this._destroyFolderApps();
        this._destroyVolumeApps();
        this._destroyTrashApp();
        this._monitor = null;
        this._onChanged = null;
        this._folderOnly = false;
        this._settings = null;
    }

    _sync(notify = true) {
        const enabled = this._settings.get_boolean(this._showLocationsKey);
        if (!enabled) {
            this._destroyFolderApps();
            this._destroyVolumeApps();
            this._destroyTrashApp();
        } else {
            this._syncFolderApps();
            if (!this._folderOnly &&
                this._settings.get_boolean(this._showMountsKey))
                this._syncVolumes();
            else
                this._destroyVolumeApps();

            if (!this._folderOnly &&
                this._settings.get_boolean(this._showTrashKey))
                this._ensureTrashApp();
            else
                this._destroyTrashApp();
        }
        if (notify)
            this._onChanged();
    }

    _syncFolderApps() {
        this._destroyFolderApps();
        for (const folder of COMMON_FOLDER_DEFINITIONS) {
            const settingsKey = this._folderOnly
                ? folder.startMenuKey
                : folder.key;
            if (!this._settings.get_boolean(settingsKey))
                continue;

            const path = folder.directory === null
                ? GLib.get_home_dir()
                : GLib.get_user_special_dir(folder.directory) ||
                    `${GLib.get_home_dir()}/${folder.fallback}`;
            this._folderApps.push(new TaskbarLocation({
                id: `location:folder:${folder.key}`,
                name: _(folder.name),
                type: 'folder',
                location: Gio.File.new_for_path(path),
                icon: Gio.ThemedIcon.new(
                    this._folderOnly
                        ? folder.startMenuIconName
                        : folder.iconName
                ),
            }));
        }
    }

    _queueVolumeEvent(signal, object) {
        this._volumeEvents.push([signal, object]);
        if (this._volumeEventId)
            return;
        this._volumeEventId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._volumeEventId = 0;
                const events = this._volumeEvents;
                this._volumeEvents = [];
                this._processVolumeEvents(events);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _processVolumeEvents(events) {
        const enabled = this._settings.get_boolean(this._showLocationsKey) &&
            this._settings.get_boolean(this._showMountsKey);
        if (enabled) {
            const currentVolumes = new Set(this._monitor.get_volumes());
            for (const [signal, object] of events) {
                switch (signal) {
                case 'volume-added':
                case 'volume-changed':
                    if (currentVolumes.has(object))
                        this._syncVolume(object);
                    break;
                case 'volume-removed':
                    this._removeVolume(object);
                    break;
                case 'mount-added':
                case 'mount-removed':
                case 'mount-changed': {
                    const volume = object.get_volume();
                    if (volume && currentVolumes.has(volume))
                        this._syncVolume(volume);
                    break;
                }
                }
            }
        }
        this._onChanged();
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

    _syncVolume(volume) {
        if (this._includeVolume(volume)) {
            if (!this._volumeAppsByVolume.has(volume))
                this._addVolume(volume);
            return;
        }
        this._removeVolume(volume);
    }

    _removeVolume(volume) {
        const app = this._volumeAppsByVolume.get(volume);
        if (!app)
            return;

        this._volumeAppsByVolume.delete(volume);
        this._volumeApps.splice(this._volumeApps.indexOf(app), 1);
        app.disconnect(this._volumeAppSignalIds.get(app));
        this._volumeAppSignalIds.delete(app);
        app.destroy();
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
        if (this._volumeAppsByVolume.has(volume))
            return;

        const identifier = this._getVolumeIdentifier(volume);
        const app = new TaskbarLocation({
            id: `location:volume:${identifier}`,
            name: volume.get_name(),
            type: 'volume',
            volume,
        });
        const signalId = app.connect('mount-changed', () =>
            this._queueVolumeEvent('volume-changed', volume)
        );
        this._volumeAppsByVolume.set(volume, app);
        this._volumeAppSignalIds.set(app, signalId);
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
        this._volumeAppSignalIds.clear();
        for (const app of this._volumeApps)
            app.destroy();
        this._volumeApps = [];
        this._volumeAppsByVolume.clear();
    }

    _destroyFolderApps() {
        for (const app of this._folderApps)
            app.destroy();
        this._folderApps = [];
    }

    _destroyTrashApp() {
        if (!this._trashApp)
            return;
        this._trashApp.destroy();
        this._trashApp = null;
    }
}
