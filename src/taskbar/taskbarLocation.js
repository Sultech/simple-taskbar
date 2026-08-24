// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ShellMountOperation} from 'resource:///org/gnome/shell/ui/shellMountOperation.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

export const TRASH_URI = 'trash://';
const TRASH_UPDATE_DELAY = 1000;
const FALLBACK_VOLUME_ICON = 'drive-removable-media';
const FALLBACK_TRASH_ICON = 'user-trash';

const LOCATION_ACTIONS = Object.freeze({
    MOUNT: 'mount',
    UNMOUNT: 'unmount',
    EJECT: 'eject',
    EMPTY_TRASH: 'empty-trash',
});

function isCancelled(error) {
    return error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

function mountVolume(volume, operation, cancellable) {
    return new Promise((resolve, reject) => {
        volume.mount(
            Gio.MountMountFlags.NONE,
            operation.mountOp,
            cancellable,
            (_volume, result) => {
                try {
                    volume.mount_finish(result);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function unmountMount(mount, operation, cancellable) {
    return new Promise((resolve, reject) => {
        mount.unmount_with_operation(
            Gio.MountUnmountFlags.FORCE,
            operation.mountOp,
            cancellable,
            (_mount, result) => {
                try {
                    mount.unmount_with_operation_finish(result);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function ejectRemovable(removable, operation, cancellable) {
    return new Promise((resolve, reject) => {
        removable.eject_with_operation(
            Gio.MountUnmountFlags.FORCE,
            operation.mountOp,
            cancellable,
            (_removable, result) => {
                try {
                    removable.eject_with_operation_finish(result);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function queryInfo(file, attributes, cancellable) {
    return new Promise((resolve, reject) => {
        file.query_info_async(
            attributes,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_LOW,
            cancellable,
            (_file, result) => {
                try {
                    resolve(file.query_info_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function enumerateChildren(file, cancellable) {
    return new Promise((resolve, reject) => {
        file.enumerate_children_async(
            Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_LOW,
            cancellable,
            (_file, result) => {
                try {
                    resolve(file.enumerate_children_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function nextFiles(enumerator, cancellable) {
    return new Promise((resolve, reject) => {
        enumerator.next_files_async(
            1,
            GLib.PRIORITY_LOW,
            cancellable,
            (_enumerator, result) => {
                try {
                    resolve(enumerator.next_files_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function closeEnumerator(enumerator, cancellable) {
    return new Promise((resolve, reject) => {
        enumerator.close_async(
            GLib.PRIORITY_LOW,
            cancellable,
            (_enumerator, result) => {
                try {
                    enumerator.close_finish(result);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

export const TaskbarLocation = GObject.registerClass({
    Signals: {
        changed: {},
        'mount-changed': {},
    },
}, class TaskbarLocation extends GObject.Object {
    _init({id, name, type, volume = null, location = null, icon = null}) {
        super._init();
        this._id = id;
        this._type = type;
        this._volume = volume;
        this._location = location;
        this._mount = null;
        this._volumeSignalId = 0;
        this._mountSignalIds = [];
        this._fallbackIconName = type === 'trash'
            ? FALLBACK_TRASH_ICON
            : FALLBACK_VOLUME_ICON;
        this.name = name;
        this.icon = icon;
        this.empty = true;
        this._currentAction = null;
        this._actionCancellable = null;
        this._trashMonitor = null;
        this._trashMonitorChangedId = 0;
        this._trashUpdateId = 0;
        this._trashQueryCancellable = null;
        this._simpleTaskbarLocation = true;

        if (type === 'trash')
            this._initializeTrash();
        else
            this._initializeVolume();
    }

    get_id() {
        return this._id;
    }

    get_name() {
        return this.name;
    }

    get_windows() {
        return [];
    }

    create_icon_texture(iconSize) {
        const params = {
            icon_size: iconSize,
            fallback_icon_name: this._fallbackIconName,
        };
        if (this.icon)
            params.gicon = this.icon;
        return new St.Icon(params);
    }

    can_open_new_window() {
        return true;
    }

    open_new_window() {
        return this.open();
    }

    activate() {
        return this.open();
    }

    get_actions() {
        if (this._type === 'trash') {
            return this.empty
                ? []
                : [{id: LOCATION_ACTIONS.EMPTY_TRASH, label: _('Empty Trash')}];
        }

        if (this._currentAction)
            return [];

        const actions = [];
        if (this._mount) {
            if (this._mount.can_unmount())
                actions.push({id: LOCATION_ACTIONS.UNMOUNT, label: _('Unmount')});
            if (this._mount.can_eject())
                actions.push({id: LOCATION_ACTIONS.EJECT, label: _('Eject')});
            return actions;
        }

        if (this._volume.can_mount())
            actions.push({id: LOCATION_ACTIONS.MOUNT, label: _('Mount')});
        if (this._volume.can_eject())
            actions.push({id: LOCATION_ACTIONS.EJECT, label: _('Eject')});
        return actions;
    }

    launchAction(action) {
        if (this._type === 'trash') {
            if (action === LOCATION_ACTIONS.EMPTY_TRASH)
                this._emptyTrash();
            return;
        }

        this._runVolumeAction(action);
    }

    async open() {
        if (this._type === 'volume' && !this._mount) {
            const mounted = await this._runVolumeAction(LOCATION_ACTIONS.MOUNT);
            if (!mounted)
                return;
            this._syncFromVolume();
        }

        if (!this._location)
            return;

        try {
            Gio.AppInfo.launch_default_for_uri(
                this._location.get_uri(),
                global.create_app_launch_context(global.get_current_time(), -1)
            );
        } catch (error) {
            global.notify_error(_('Unable to open location'), error.message);
            logError(error, `Unable to open ${this.get_name()}`);
        }
    }

    destroy() {
        if (this._trashUpdateId) {
            GLib.Source.remove(this._trashUpdateId);
            this._trashUpdateId = 0;
        }
        if (this._trashQueryCancellable) {
            this._trashQueryCancellable.cancel();
            this._trashQueryCancellable = null;
        }
        if (this._actionCancellable) {
            this._actionCancellable.cancel();
            this._actionCancellable = null;
        }
        if (this._trashMonitor) {
            this._trashMonitor.disconnect(this._trashMonitorChangedId);
            this._trashMonitor.cancel();
            this._trashMonitor = null;
            this._trashMonitorChangedId = 0;
        }
        if (this._volumeSignalId) {
            this._volume.disconnect(this._volumeSignalId);
            this._volumeSignalId = 0;
        }
        this._disconnectMountSignals();
        this._volume = null;
        this._location = null;
        this._mount = null;
        this.icon = null;
        this.name = null;
    }

    _initializeVolume() {
        this._volumeSignalId = this._volume.connect(
            'changed',
            () => this._syncFromVolume()
        );
        this._syncFromVolume();
    }

    _initializeTrash() {
        this._location = Gio.File.new_for_uri(TRASH_URI);
        this.icon = Gio.ThemedIcon.new(FALLBACK_TRASH_ICON);
        try {
            this._trashMonitor = this._location.monitor_directory(
                Gio.FileMonitorFlags.NONE,
                null
            );
            this._trashMonitorChangedId = this._trashMonitor.connect(
                'changed',
                () => this._scheduleTrashUpdate()
            );
        } catch (error) {
            logError(error, 'Unable to monitor Trash');
        }
        this._updateTrash();
    }

    _syncFromVolume() {
        const mount = this._volume.get_mount();
        const mountChanged = mount !== this._mount;
        if (mountChanged) {
            this._disconnectMountSignals();
            this._mount = mount;
            this._connectMountSignals();
        }

        const source = mount || this._volume;
        const name = source.get_name();
        const icon = source.get_icon();
        const location = mount
            ? mount.get_default_location()
            : this._volume.get_activation_root();
        const nameChanged = name !== this.name;
        const iconChanged = icon !== this.icon &&
            !(icon && this.icon && icon.equal(this.icon));
        const locationChanged = location !== this._location &&
            !(location && this._location && location.equal(this._location));

        this.name = name;
        this.icon = icon;
        this._location = location;
        if (mountChanged)
            this.emit('mount-changed');
        if (mountChanged || nameChanged || iconChanged || locationChanged)
            this.emit('changed');
    }

    _connectMountSignals() {
        if (!this._mount)
            return;

        for (const signal of ['changed', 'pre-unmount', 'unmounted']) {
            const id = this._mount.connect(signal, () => {
                this._syncFromVolume();
            });
            this._mountSignalIds.push([this._mount, id]);
        }
    }

    _disconnectMountSignals() {
        for (const [mount, id] of this._mountSignalIds)
            mount.disconnect(id);
        this._mountSignalIds = [];
    }

    async _runVolumeAction(action) {
        if (this._currentAction || !this.get_actions().some(item =>
            item.id === action)) {
            return false;
        }

        const actionItem = this.get_actions().find(item => item.id === action);
        const actionName = actionItem.label;
        this._currentAction = action;
        const cancellable = new Gio.Cancellable();
        this._actionCancellable = cancellable;
        const removable = this._mount || this._volume;
        const operation = new ShellMountOperation.ShellMountOperation(removable);
        let success = false;
        try {
            switch (action) {
            case LOCATION_ACTIONS.MOUNT:
                await mountVolume(
                    this._volume,
                    operation,
                    cancellable
                );
                break;
            case LOCATION_ACTIONS.UNMOUNT:
                await unmountMount(
                    this._mount,
                    operation,
                    cancellable
                );
                break;
            case LOCATION_ACTIONS.EJECT:
                await ejectRemovable(
                    removable,
                    operation,
                    cancellable
                );
                break;
            default:
                return false;
            }
            success = true;
        } catch (error) {
            if (!isCancelled(error)) {
                global.notify_error(
                    `${actionName} ${_('failed')}`,
                    error.message
                );
                logError(error, `${actionName} ${this.get_name()}`);
            }
        } finally {
            operation.close();
            if (this._actionCancellable !== cancellable) {
                success = false;
                return;
            }
            this._currentAction = null;
            cancellable.cancel();
            this._actionCancellable = null;
            this._syncFromVolume();
        }
        return success;
    }

    _scheduleTrashUpdate() {
        if (!this._trashMonitor || this._trashMonitor.is_cancelled())
            return;
        if (this._trashUpdateId)
            GLib.Source.remove(this._trashUpdateId);
        this._trashUpdateId = GLib.timeout_add(
            GLib.PRIORITY_LOW,
            TRASH_UPDATE_DELAY,
            () => {
                this._trashUpdateId = 0;
                this._updateTrash();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    async _updateTrash() {
        if (this._trashQueryCancellable)
            this._trashQueryCancellable.cancel();
        const cancellable = new Gio.Cancellable();
        this._trashQueryCancellable = cancellable;

        try {
            const info = await queryInfo(
                this._location,
                Gio.FILE_ATTRIBUTE_TRASH_ITEM_COUNT,
                cancellable
            );
            if (this._trashQueryCancellable !== cancellable)
                return;
            if (info.has_attribute(Gio.FILE_ATTRIBUTE_TRASH_ITEM_COUNT)) {
                this._setTrashEmpty(
                    info.get_attribute_uint32(
                        Gio.FILE_ATTRIBUTE_TRASH_ITEM_COUNT
                    ) === 0
                );
                this._finishTrashQuery(cancellable);
                return;
            }
        } catch (error) {
            if (isCancelled(error)) {
                this._finishTrashQuery(cancellable);
                return;
            }
        }

        try {
            const enumerator = await enumerateChildren(
                this._location,
                cancellable
            );
            const children = await nextFiles(enumerator, cancellable);
            if (this._trashQueryCancellable !== cancellable)
                return;
            this._setTrashEmpty(children.length === 0);
            await closeEnumerator(enumerator, cancellable);
        } catch (error) {
            if (!isCancelled(error))
                logError(error, 'Unable to update Trash');
        } finally {
            this._finishTrashQuery(cancellable);
        }
    }

    _finishTrashQuery(cancellable) {
        cancellable.cancel();
        if (this._trashQueryCancellable === cancellable)
            this._trashQueryCancellable = null;
    }

    _setTrashEmpty(empty) {
        if (this.empty === empty)
            return;

        this.empty = empty;
        this.icon = Gio.ThemedIcon.new(empty
            ? 'user-trash'
            : 'user-trash-full');
        this.emit('changed');
    }

    _emptyTrash() {
        const platformData = {
            'parent-handle': new GLib.Variant('s', ''),
            timestamp: new GLib.Variant('u', global.get_current_time()),
            'window-position': new GLib.Variant('s', 'center'),
        };
        const parameters = new GLib.Variant('(ba{sv})', [
            true,
            platformData,
        ]);
        Gio.DBus.session.call(
            'org.gnome.Nautilus',
            '/org/gnome/Nautilus/FileOperations2',
            'org.gnome.Nautilus.FileOperations2',
            'EmptyTrash',
            parameters,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (connection, result) => {
                try {
                    connection.call_finish(result);
                } catch (error) {
                    logError(error, 'Unable to empty Trash');
                }
            }
        );
    }
});
