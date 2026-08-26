// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(
    Gio.File.prototype,
    'replace_contents_bytes_async',
    'replace_contents_finish'
);

const PROFILE_FORMAT_VERSION = 1;
const EXCLUDED_KEYS = new Set([
    'panel-profile-transition',
    'target-prefs-page',
]);

function isCancelled(error) {
    return error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

function showToast(window, title) {
    window.add_toast(new Adw.Toast({title, timeout: 3}));
}

function createProfile(settings) {
    const values = {};
    for (const key of settings.settings_schema.list_keys()) {
        if (EXCLUDED_KEYS.has(key))
            continue;

        const value = settings.get_value(key);
        values[key] = {
            type: value.get_type_string(),
            value: value.print(true),
        };
    }

    return {
        format: PROFILE_FORMAT_VERSION,
        schema: settings.schema_id,
        settings: values,
    };
}

function parseProfile(contents, settings) {
    const profile = JSON.parse(new TextDecoder('utf-8').decode(contents));
    if (profile.format !== PROFILE_FORMAT_VERSION ||
        profile.schema !== settings.schema_id ||
        !profile.settings ||
        typeof profile.settings !== 'object' ||
        Array.isArray(profile.settings)) {
        throw new Error(_('The selected file is not a valid Simple Taskbar profile.'));
    }

    const values = [];
    for (const [key, serialized] of Object.entries(profile.settings)) {
        if (EXCLUDED_KEYS.has(key) ||
            !settings.settings_schema.has_key(key)) {
            continue;
        }
        if (!serialized ||
            typeof serialized.type !== 'string' ||
            typeof serialized.value !== 'string') {
            throw new Error(_('The selected profile is invalid.'));
        }

        const expectedType = settings.get_value(key).get_type_string();
        if (serialized.type !== expectedType)
            throw new Error(_('The selected profile is incompatible with this version.'));

        values.push([
            key,
            GLib.Variant.parse(
                new GLib.VariantType(expectedType),
                serialized.value,
                null,
                null
            ),
        ]);
    }
    return values;
}

function applyProfile(settings, values) {
    settings.set_boolean('panel-profile-transition', true);
    settings.delay();
    try {
        for (const [key, value] of values)
            settings.set_value(key, value);
        settings.apply();
    } catch (error) {
        settings.revert();
        settings.set_boolean('panel-profile-transition', false);
        throw error;
    }
    settings.set_boolean('panel-profile-transition', false);
}

async function exportProfile(file, settings) {
    const contents = JSON.stringify(createProfile(settings), null, 2) + '\n';
    const bytes = new GLib.Bytes(new TextEncoder().encode(contents));
    const [success] = await file.replace_contents_bytes_async(
        bytes,
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
    );
    if (!success)
        throw new Error(_('The profile could not be exported.'));
}

async function importProfile(file, settings) {
    const [contents] = await file.load_contents_async(null);
    const values = parseProfile(contents, settings);
    applyProfile(settings, values);
}

export function addProfileTransferGroup(
    page,
    window,
    settings,
    createSettings
) {
    const group = new Adw.PreferencesGroup({
        title: _('Profiles'),
    });
    page.add(group);

    const row = new Adw.ActionRow({
        title: _('Export and Import Profiles'),
        subtitle: _('Save panel settings, Dock settings, and Start Menu pins to a file'),
    });
    const exportButton = new Gtk.Button({
        label: _('Export…'),
        valign: Gtk.Align.CENTER,
    });
    const importButton = new Gtk.Button({
        label: _('Import…'),
        valign: Gtk.Align.CENTER,
    });
    row.add_suffix(exportButton);
    row.add_suffix(importButton);
    group.add(row);

    const setButtonsSensitive = sensitive => {
        exportButton.sensitive = sensitive;
        importButton.sensitive = sensitive;
    };
    const showOperationError = error => {
        showToast(window, _('The profile operation failed: %s').replace(
            '%s',
            error.message
        ));
    };

    exportButton.connect('clicked', () => {
        const dialog = new Gtk.FileDialog({
            title: _('Export Profiles'),
        });
        dialog.save(window, null, async (source, result) => {
            let file;
            try {
                file = source.save_finish(result);
            } catch (error) {
                if (!isCancelled(error))
                    showOperationError(error);
                return;
            }
            if (!file)
                return;

            setButtonsSensitive(false);
            try {
                await exportProfile(file, settings);
                showToast(window, _('Profile exported.'));
            } catch (error) {
                showOperationError(error);
            } finally {
                setButtonsSensitive(true);
            }
        });
    });

    importButton.connect('clicked', () => {
        const dialog = new Gtk.FileDialog({
            title: _('Import Profiles'),
        });
        dialog.open(window, null, async (source, result) => {
            let file;
            try {
                file = source.open_finish(result);
            } catch (error) {
                if (!isCancelled(error))
                    showOperationError(error);
                return;
            }
            if (!file)
                return;

            setButtonsSensitive(false);
            try {
                await importProfile(file, createSettings());
                showToast(window, _('Profile imported.'));
            } catch (error) {
                showOperationError(error);
            } finally {
                setButtonsSensitive(true);
            }
        });
    });
}
