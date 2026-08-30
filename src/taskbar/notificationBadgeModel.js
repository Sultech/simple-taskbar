// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

function normalizeAppId(appId) {
    return appId.replace(/(^\w+:|^)\/\//, '')
        .toLowerCase()
        .replace(/\.desktop$/, '');
}

function mapsEqual(left, right) {
    if (left.size !== right.size)
        return false;

    for (const [key, value] of left) {
        if (right.get(key) !== value)
            return false;
    }

    return true;
}

export class NotificationBadgeModel extends EventEmitter {
    constructor() {
        super();

        this._sourceSignals = new Map();
        this._messageCounts = new Map();
        this._launcherStates = new Map();
        this._effectiveCounts = new Map();
        this._launcherSerial = 0;
        this._launcherEntrySignalId = Gio.DBus.session.signal_subscribe(
            null,
            'com.canonical.Unity.LauncherEntry',
            'Update',
            null,
            null,
            Gio.DBusSignalFlags.NONE,
            (_connection, senderName, _objectPath, _interfaceName,
                _signalName, parameters) => {
                this._handleLauncherUpdate(senderName, parameters);
            }
        );
        this._nameOwnerChangedSignalId = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus',
            'org.freedesktop.DBus',
            'NameOwnerChanged',
            '/org/freedesktop/DBus',
            null,
            Gio.DBusSignalFlags.NONE,
            (_connection, _senderName, _objectPath, _interfaceName,
                _signalName, parameters) => {
                const [name, oldOwner, newOwner] = parameters.deep_unpack();
                if (oldOwner && !newOwner)
                    this._removeLauncherSender(name);
            }
        );
        this._unityBusId = Gio.DBus.session.own_name(
            'com.canonical.Unity',
            Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT,
            null,
            null
        );
        this._messageTraySourceAddedId = Main.messageTray.connect(
            'source-added', (_tray, source) => this._addSource(source)
        );
        this._messageTraySourceRemovedId = Main.messageTray.connect(
            'source-removed', (_tray, source) => this._removeSource(source)
        );

        for (const source of Main.messageTray.getSources())
            this._addSource(source, false);
        this._publishCounts();
    }

    getCount(appId) {
        return this._effectiveCounts.get(normalizeAppId(appId)) ?? 0;
    }

    destroy() {
        Main.messageTray.disconnect(this._messageTraySourceAddedId);
        Main.messageTray.disconnect(this._messageTraySourceRemovedId);
        for (const [source, {signalId}] of this._sourceSignals)
            source.disconnect(signalId);
        Gio.DBus.session.signal_unsubscribe(this._launcherEntrySignalId);
        Gio.DBus.session.signal_unsubscribe(this._nameOwnerChangedSignalId);
        Gio.DBus.session.unown_name(this._unityBusId);
        this.disconnectAll();
        this._sourceSignals.clear();
        this._launcherStates.clear();
        this._messageCounts.clear();
        this._effectiveCounts.clear();
        this._sourceSignals = null;
        this._launcherStates = null;
        this._messageCounts = null;
        this._effectiveCounts = null;
    }

    _addSource(source, publish = true) {
        const app = source.app ?? source._app;
        if (!app)
            return;

        const appId = normalizeAppId(app.get_id());
        const signalId = source.connect(
            'notify::count', () => this._syncMessageCounts()
        );
        this._sourceSignals.set(source, {signalId, appId});
        this._syncMessageCounts(publish);
    }

    _removeSource(source) {
        const state = this._sourceSignals.get(source);
        if (!state)
            return;

        source.disconnect(state.signalId);
        this._sourceSignals.delete(source);
        this._syncMessageCounts();
    }

    _syncMessageCounts(publish = true) {
        const counts = new Map();
        for (const [source, {appId}] of this._sourceSignals) {
            const count = counts.get(appId) ?? 0;
            const sourceCount = source.notifications.filter(notification =>
                !notification.resident || !notification.acknowledged
            ).length;
            counts.set(appId, count + sourceCount);
        }
        this._messageCounts = counts;
        if (publish)
            this._publishCounts();
    }

    _handleLauncherUpdate(senderName, parameters) {
        const [appUri, properties] = parameters.deep_unpack();
        const appId = normalizeAppId(appUri);
        let senderStates = this._launcherStates.get(senderName);
        if (!senderStates) {
            senderStates = new Map();
            this._launcherStates.set(senderName, senderStates);
        }
        let state = senderStates.get(appId);
        if (!state) {
            state = {count: 0, visible: false, serial: 0};
            senderStates.set(appId, state);
        }
        if ('count' in properties)
            state.count = Number(properties.count.unpack());
        if ('count-visible' in properties)
            state.visible = properties['count-visible'].unpack();
        state.serial = ++this._launcherSerial;
        this._publishCounts();
    }

    _removeLauncherSender(senderName) {
        if (!this._launcherStates.delete(senderName))
            return;

        this._publishCounts();
    }

    _publishCounts() {
        const launcherCounts = new Map();
        const launcherSerials = new Map();
        for (const senderStates of this._launcherStates.values()) {
            for (const [appId, state] of senderStates) {
                if ((launcherSerials.get(appId) ?? -1) >= state.serial)
                    continue;
                launcherSerials.set(appId, state.serial);
                launcherCounts.set(
                    appId,
                    state.visible ? Math.max(0, state.count) : 0
                );
            }
        }

        const counts = new Map(this._messageCounts);
        for (const [appId, count] of launcherCounts) {
            if (count > 0)
                counts.set(appId, count);
        }
        for (const [appId, count] of [...counts]) {
            if (count <= 0)
                counts.delete(appId);
        }

        if (mapsEqual(counts, this._effectiveCounts))
            return;

        this._effectiveCounts = counts;
        this.emit('changed');
    }
}
