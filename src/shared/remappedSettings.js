// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export class RemappedSettings {
    constructor(settings) {
        this._settings = settings;
    }

    _settingKey(key) {
        return key;
    }

    _settingSignal(signal) {
        if (!signal.startsWith('changed::'))
            return signal;

        return `changed::${this._settingKey(signal.slice('changed::'.length))}`;
    }

    _settingSignals(signal) {
        return [this._settingSignal(signal)];
    }

    _settingArguments(args) {
        const remapped = [];
        for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (typeof arg !== 'string') {
                remapped.push(arg);
                continue;
            }

            const handler = args[++index];
            for (const signal of this._settingSignals(arg))
                remapped.push(signal, handler);
        }
        return remapped;
    }

    get_boolean(key) {
        return this._settings.get_boolean(this._settingKey(key));
    }

    get_string(key) {
        return this._settings.get_string(this._settingKey(key));
    }

    get_int(key) {
        return this._settings.get_int(this._settingKey(key));
    }

    get_strv(key) {
        return this._settings.get_strv(this._settingKey(key));
    }

    get_value(key) {
        return this._settings.get_value(this._settingKey(key));
    }

    get_default_value(key) {
        return this._settings.get_default_value(this._settingKey(key));
    }

    get_user_value(key) {
        return this._settings.get_user_value(this._settingKey(key));
    }

    set_boolean(key, value) {
        return this._settings.set_boolean(this._settingKey(key), value);
    }

    set_string(key, value) {
        return this._settings.set_string(this._settingKey(key), value);
    }

    set_int(key, value) {
        return this._settings.set_int(this._settingKey(key), value);
    }

    set_strv(key, value) {
        return this._settings.set_strv(this._settingKey(key), value);
    }

    set_value(key, value) {
        return this._settings.set_value(this._settingKey(key), value);
    }

    is_writable(key) {
        return this._settings.is_writable(this._settingKey(key));
    }

    reset(key) {
        this._settings.reset(this._settingKey(key));
    }

    bind(key, object, property, flags) {
        this._settings.bind(this._settingKey(key), object, property, flags);
    }

    connect(signal, handler) {
        return this._settings.connect(this._settingSignal(signal), handler);
    }

    disconnect(id) {
        this._settings.disconnect(id);
    }

    connectObject(...args) {
        this._settings.connectObject(...this._settingArguments(args));
    }

    disconnectObject(owner) {
        this._settings.disconnectObject(owner);
    }
}
