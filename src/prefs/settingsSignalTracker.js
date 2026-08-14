// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export class SettingsSignalTracker {
    constructor() {
        this._connections = [];
    }

    connect(settings, signal, callback) {
        const id = settings.connect(signal, callback);
        this._connections.push({settings, id});
    }

    destroy() {
        for (const {settings, id} of this._connections)
            settings.disconnect(id);
        this._connections = null;
    }
}
