// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

const ENTRY_SEPARATOR = '\u001f';
const MEDIA_KEYS_SCHEMA =
    'org.gnome.settings-daemon.plugins.media-keys';
const CUSTOM_KEYBINDING_SCHEMA =
    'org.gnome.settings-daemon.plugins.media-keys.custom-keybinding';
const CUSTOM_KEYBINDINGS_KEY = 'custom-keybindings';
const SYSTEM_KEYBINDING_SCHEMAS = [
    'org.gnome.desktop.wm.keybindings',
    'org.gnome.mutter.keybindings',
    'org.gnome.mutter.wayland.keybindings',
    'org.gnome.shell.keybindings',
    MEDIA_KEYS_SCHEMA,
];
const MODIFIER_ALIASES = new Map([
    ['primary', 'control'],
    ['ctrl', 'control'],
    ['ctl', 'control'],
    ['mod1', 'alt'],
]);

export const KEYBINDING_RELEASE_DELAY = 150;

export function normalizeAccelerator(accelerator) {
    const compact = accelerator.replaceAll(' ', '').toLowerCase();
    const modifiers = [...compact.matchAll(/<([^>]+)>/g)]
        .map(match => MODIFIER_ALIASES.get(match[1]) ?? match[1])
        .sort();
    const key = compact.replaceAll(/<[^>]+>/g, '');
    return modifiers.map(modifier => `<${modifier}>`).join('') + key;
}

export class SystemKeybindingClaim {
    constructor(settings, recoveryKey, onDisplaced = null) {
        this._settings = settings;
        this._recoveryKey = recoveryKey;
        this._onDisplaced = onDisplaced;
        this._accelerators = null;
        this._entries = [];
    }

    enable(accelerators) {
        const normalized = new Set(
            accelerators
                .map(normalizeAccelerator)
                .filter(accelerator => accelerator.length > 0)
        );
        if (normalized.size === 0) {
            this.disable();
            return false;
        }
        if (this._setsMatch(this._accelerators, normalized))
            return false;

        this.disable();
        this._accelerators = normalized;
        this._entries = SYSTEM_KEYBINDING_SCHEMAS.map(schemaId =>
            this._createEntry(schemaId, ''));
        this._rebuildCustomEntries();
        return this._displaceBindings();
    }

    disable() {
        this._accelerators = null;
        for (const entry of this._entries)
            entry.settings.disconnect(entry.changedId);
        this._entries = [];
        this._restoreBindings();
    }

    destroy() {
        this.disable();
        this._settings = null;
        this._recoveryKey = null;
        this._onDisplaced = null;
    }

    _createEntry(schemaId, path) {
        const settings = path
            ? new Gio.Settings({schema_id: schemaId, path})
            : new Gio.Settings({schema_id: schemaId});
        const entry = {
            schemaId,
            path,
            settings,
            changedId: 0,
        };
        entry.changedId = settings.connect('changed', (_settings, key) => {
            if (schemaId === MEDIA_KEYS_SCHEMA &&
                key === CUSTOM_KEYBINDINGS_KEY) {
                this._rebuildCustomEntries();
            }
            if (this._displaceBindings() && this._onDisplaced)
                this._onDisplaced();
        });
        return entry;
    }

    _rebuildCustomEntries() {
        const retained = [];
        for (const entry of this._entries) {
            if (entry.schemaId === CUSTOM_KEYBINDING_SCHEMA) {
                entry.settings.disconnect(entry.changedId);
            } else {
                retained.push(entry);
            }
        }
        this._entries = retained;

        const mediaKeys = this._entries.find(
            entry => entry.schemaId === MEDIA_KEYS_SCHEMA
        );
        const paths = new Set(mediaKeys.settings.get_strv(
            CUSTOM_KEYBINDINGS_KEY
        ));
        for (const path of paths) {
            this._entries.push(
                this._createEntry(CUSTOM_KEYBINDING_SCHEMA, path)
            );
        }
    }

    _displaceBindings() {
        if (!this._accelerators)
            return false;

        const displaced = new Set(
            this._settings.get_strv(this._recoveryKey)
        );
        let bindingChanged = false;
        for (const entry of this._entries) {
            for (const key of entry.settings.settings_schema.list_keys()) {
                if (entry.schemaId === CUSTOM_KEYBINDING_SCHEMA &&
                    key !== 'binding') {
                    continue;
                }
                const value = entry.settings.get_value(key);
                const valueType = value.get_type_string();
                let changed = false;
                if (valueType === 'as') {
                    changed = this._displaceArrayValue(
                        entry,
                        key,
                        value.deep_unpack(),
                        displaced
                    );
                } else if (valueType === 's') {
                    changed = this._displaceStringValue(
                        entry,
                        key,
                        value.deep_unpack(),
                        displaced
                    );
                }
                bindingChanged ||= changed;
            }
        }
        this._settings.set_strv(this._recoveryKey, [...displaced]);
        return bindingChanged;
    }

    _displaceArrayValue(entry, key, accelerators, displaced) {
        const retained = [];
        let changed = false;
        for (const accelerator of accelerators) {
            if (this._accelerators.has(
                normalizeAccelerator(accelerator)
            )) {
                changed = true;
                displaced.add(
                    this._encodeEntry(entry, key, 'as', accelerator)
                );
            } else {
                retained.push(accelerator);
            }
        }
        if (changed) {
            GObject.signal_handler_block(
                entry.settings,
                entry.changedId
            );
            entry.settings.set_strv(key, retained);
            GObject.signal_handler_unblock(
                entry.settings,
                entry.changedId
            );
        }
        return changed;
    }

    _displaceStringValue(entry, key, accelerator, displaced) {
        if (!this._accelerators.has(normalizeAccelerator(accelerator)))
            return false;

        displaced.add(this._encodeEntry(entry, key, 's', accelerator));
        GObject.signal_handler_block(entry.settings, entry.changedId);
        entry.settings.set_string(key, '');
        GObject.signal_handler_unblock(entry.settings, entry.changedId);
        return true;
    }

    _restoreBindings() {
        const displaced = this._settings.get_strv(this._recoveryKey);
        if (displaced.length === 0)
            return;

        const restoredSettings = new Map();
        const mediaKeys = new Gio.Settings({
            schema_id: MEDIA_KEYS_SCHEMA,
        });
        const customPaths = new Set(mediaKeys.get_strv(
            CUSTOM_KEYBINDINGS_KEY
        ));
        for (const encoded of displaced) {
            const parts = encoded.split(ENTRY_SEPARATOR);
            let [schemaId, path, key, valueType, accelerator] = parts;
            if (parts.length === 3) {
                [schemaId, key, accelerator] = parts;
                path = '';
                valueType = 'as';
            }
            if (!schemaId || !key || !valueType || !accelerator)
                continue;
            if (schemaId === CUSTOM_KEYBINDING_SCHEMA &&
                !customPaths.has(path)) {
                continue;
            }

            const identity = `${schemaId}${ENTRY_SEPARATOR}${path}`;
            let settings = restoredSettings.get(identity);
            if (!settings) {
                settings = path
                    ? new Gio.Settings({schema_id: schemaId, path})
                    : new Gio.Settings({schema_id: schemaId});
                restoredSettings.set(identity, settings);
            }
            if (!settings.settings_schema.has_key(key))
                continue;

            if (valueType === 'as') {
                const accelerators = settings.get_strv(key);
                if (!accelerators.includes(accelerator)) {
                    accelerators.push(accelerator);
                    settings.set_strv(key, accelerators);
                }
            } else if (valueType === 's' &&
                settings.get_string(key) === '') {
                settings.set_string(key, accelerator);
            }
        }
        this._settings.set_strv(this._recoveryKey, []);
    }

    _encodeEntry(entry, key, valueType, accelerator) {
        return [
            entry.schemaId,
            entry.path,
            key,
            valueType,
            accelerator,
        ].join(ENTRY_SEPARATOR);
    }

    _setsMatch(first, second) {
        return Boolean(first) && first.size === second.size &&
            [...first].every(value => second.has(value));
    }
}
