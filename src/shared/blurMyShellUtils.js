// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const BLUR_MY_SHELL_UUID = 'blur-my-shell@aunetx';
export const BLUR_MY_SHELL_PANEL_STYLES = [
    'transparent-panel',
    'light-panel',
    'dark-panel',
    'contrasted-panel',
    'gradient-panel',
    'gradient-panel-reverse',
];
const BLUR_MY_SHELL_SCHEMA =
    'org.gnome.shell.extensions.blur-my-shell';

export function getBlurMyShellSettings() {
    let schemaSource = Gio.SettingsSchemaSource.get_default();
    let schema = schemaSource.lookup(BLUR_MY_SHELL_SCHEMA, true);
    if (schema)
        return new Gio.Settings({settings_schema: schema});

    const dataDirectories = [
        GLib.get_user_data_dir(),
        ...GLib.get_system_data_dirs(),
    ];
    for (const dataDirectory of dataDirectories) {
        const schemaDirectory = GLib.build_filenamev([
            dataDirectory,
            'gnome-shell',
            'extensions',
            BLUR_MY_SHELL_UUID,
            'schemas',
        ]);
        const compiledSchema = Gio.File.new_for_path(
            GLib.build_filenamev([schemaDirectory, 'gschemas.compiled'])
        );
        if (!compiledSchema.query_exists(null))
            continue;

        // query_exists() only proves the file is there. new_from_directory()
        // validates the gvdb and throws GLib.FileError on a corrupt
        // gschemas.compiled, which would otherwise escape into enable().
        try {
            schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                schemaDirectory,
                schemaSource,
                false
            );
        } catch (error) {
            console.warn(
                `Simple Taskbar: ignoring unreadable Blur My Shell ` +
                `schema in ${schemaDirectory}: ${error.message}`
            );
            continue;
        }
        schema = schemaSource.lookup(BLUR_MY_SHELL_SCHEMA, true);
        if (schema)
            return new Gio.Settings({settings_schema: schema});
    }

    return null;
}

export function getBlurMyShellChildSettings(settings, childName) {
    if (!settings)
        return null;

    const children = settings.settings_schema.list_children();
    if (!children.includes(childName))
        return null;

    return settings.get_child(childName);
}

function blurMyShellPanelSettings() {
    return getBlurMyShellChildSettings(getBlurMyShellSettings(), 'panel');
}

export function blurMyShellOverridesPanelBackground() {
    const panelSettings = blurMyShellPanelSettings();
    if (!blurMyShellHasKey(panelSettings, 'override-background'))
        return false;

    return panelSettings.get_boolean('override-background');
}

export function blurMyShellPanelStyleIsTransparent() {
    const panelSettings = blurMyShellPanelSettings();
    if (blurMyShellHasKey(panelSettings, 'gradient-panel') &&
        panelSettings.get_boolean('gradient-panel'))
        return false;

    if (!blurMyShellHasKey(panelSettings, 'style-panel'))
        return true;

    return panelSettings.get_int('style-panel') === 0;
}

export function blurMyShellHasKey(settings, key) {
    return Boolean(
        settings && settings.settings_schema.list_keys().includes(key)
    );
}
