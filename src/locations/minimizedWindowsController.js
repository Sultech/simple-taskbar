// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {MinimizedWindowLocation} from './minimizedWindowLocation.js';

export class MinimizedWindowsController {
    constructor({settings, key, locationsKey, tracker, getInterestingWindows, onChanged, onRemoving}) {
        this._settings = settings;
        this._key = key;
        this._locationsKey = locationsKey;
        this._tracker = tracker;
        this._getInterestingWindows = getInterestingWindows;
        this._onChanged = onChanged;
        this._onRemoving = onRemoving;
        this._windows = new Map();
        this._windowCreatedId = 0;
        this._settingsIds = [
            key,
            locationsKey,
            'default-gnome-panel',
            'windows-xp-theme-enabled',
        ].map(setting => settings.connect(`changed::${setting}`, () => {
            this._sync();
            this._onChanged();
        }));
        this._sync();
    }

    getLocations() {
        const locations = [];
        for (const [window, record] of this._windows) {
            if (!window.minimized || window.skip_taskbar)
                continue;

            const app = this._tracker.get_window_app(window);
            if (!app || !this._getInterestingWindows(app).includes(window))
                continue;

            if (!record.location)
                record.location = new MinimizedWindowLocation(window, app);
            locations.push(record.location);
        }
        return locations;
    }

    _sync() {
        const enabled = this._settings.get_boolean(this._key) &&
            this._settings.get_boolean(this._locationsKey) &&
            !this._settings.get_boolean('default-gnome-panel') &&
            !this._settings.get_boolean('windows-xp-theme-enabled');
        if (!enabled) {
            this._clearWindows();
            return;
        }
        if (this._windowCreatedId)
            return;

        this._windowCreatedId = global.display.connect('window-created',
            (_display, window) => {
                this._trackWindow(window);
                if (window.minimized)
                    this._onChanged();
            });
        for (const actor of global.get_window_actors())
            this._trackWindow(actor.meta_window);
    }

    _trackWindow(window) {
        const ids = [
            window.connect('notify::minimized', () => this._onChanged()),
            window.connect('notify::skip-taskbar', () => this._onChanged()),
            window.connect('unmanaged', () => {
                this._removeWindow(window);
                this._onChanged();
            }),
        ];
        this._windows.set(window, {ids, location: null});
    }

    _removeWindow(window) {
        const record = this._windows.get(window);
        for (const id of record.ids)
            window.disconnect(id);
        this._windows.delete(window);
        if (record.location) {
            this._onRemoving(record.location, () => {
                record.location.destroy();
                record.location = null;
            });
        }
    }

    _clearWindows() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
        }
        for (const window of this._windows.keys())
            this._removeWindow(window);
    }

    destroy() {
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
        this._clearWindows();
        this._settings = null;
        this._tracker = null;
        this._getInterestingWindows = null;
        this._onChanged = null;
        this._onRemoving = null;
    }
}
