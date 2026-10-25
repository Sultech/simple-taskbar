// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';

const SETTINGS_ROUTES = Object.freeze([
    {schema: 'dock', prefix: 'dock-', keys: ['active-dock-axis', 'blur-my-shell-dock-mode']},
    {schema: 'default-panel', prefix: 'default-panel-', keys: []},
]);

function moveLegacyValues(mainSettings, childSettings) {
    const legacySettings = new Gio.Settings({
        settings_schema: childSettings.settings_schema,
        path: mainSettings.path,
    });
    for (const key of childSettings.settings_schema.list_keys()) {
        const value = legacySettings.get_user_value(key);
        if (!value)
            continue;

        if (childSettings.get_user_value(key) === null)
            childSettings.set_value(key, value);
        legacySettings.reset(key);
    }
}

export function createRoutedSettings(mainSettings) {
    const routes = SETTINGS_ROUTES.map(route => ({
        ...route,
        settings: mainSettings.get_child(route.schema),
    }));
    for (const route of routes)
        moveLegacyValues(mainSettings, route.settings);
    return new RoutedSettings(mainSettings, routes);
}

class RoutedSettings {
    constructor(mainSettings, routes) {
        this.mainSettings = mainSettings;
        this._routes = routes;
        this._allSettings = [mainSettings, ...routes.map(route => route.settings)];
        this._connections = new Map();
        this._nextConnectionId = 1;
        this.settings_schema = {
            list_keys: () => this._allSettings.flatMap(settings =>
                settings.settings_schema.list_keys()),
            has_key: key => this._target(key).settings_schema.has_key(key),
            get_key: key => this._target(key).settings_schema.get_key(key),
        };
    }

    get schema_id() {
        return this.mainSettings.schema_id;
    }

    _target(key) {
        const route = this._routes.find(candidate =>
            key.startsWith(candidate.prefix) || candidate.keys.includes(key));
        return route ? route.settings : this.mainSettings;
    }

    _signalTargets(signal) {
        return signal.startsWith('changed::')
            ? [this._target(signal.slice('changed::'.length))]
            : this._allSettings;
    }

    get_boolean(key) {
        return this._target(key).get_boolean(key);
    }

    get_string(key) {
        return this._target(key).get_string(key);
    }

    get_int(key) {
        return this._target(key).get_int(key);
    }

    get_strv(key) {
        return this._target(key).get_strv(key);
    }

    get_value(key) {
        return this._target(key).get_value(key);
    }

    get_default_value(key) {
        return this._target(key).get_default_value(key);
    }

    get_user_value(key) {
        return this._target(key).get_user_value(key);
    }

    set_boolean(key, value) {
        return this._target(key).set_boolean(key, value);
    }

    set_string(key, value) {
        return this._target(key).set_string(key, value);
    }

    set_int(key, value) {
        return this._target(key).set_int(key, value);
    }

    set_strv(key, value) {
        return this._target(key).set_strv(key, value);
    }

    set_value(key, value) {
        return this._target(key).set_value(key, value);
    }

    is_writable(key) {
        return this._target(key).is_writable(key);
    }

    reset(key) {
        this._target(key).reset(key);
    }

    bind(key, object, property, flags) {
        this._target(key).bind(key, object, property, flags);
    }

    delay() {
        for (const settings of this._allSettings)
            settings.delay();
    }

    apply() {
        for (const settings of this._allSettings)
            settings.apply();
    }

    connect(signal, handler) {
        const id = this._nextConnectionId++;
        this._connections.set(id, this._signalTargets(signal).map(settings =>
            [settings, settings.connect(signal, handler)]));
        return id;
    }

    disconnect(id) {
        for (const [settings, handlerId] of this._connections.get(id))
            settings.disconnect(handlerId);
        this._connections.delete(id);
    }

    connectObject(...args) {
        const owner = args.pop();
        for (let index = 0; index < args.length; index += 2) {
            const signal = args[index];
            const handler = args[index + 1];
            for (const settings of this._signalTargets(signal))
                settings.connectObject(signal, handler, owner);
        }
    }

    disconnectObject(owner) {
        for (const settings of this._allSettings)
            settings.disconnectObject(owner);
    }
}
