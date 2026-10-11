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
export const BLUR_MY_SHELL_PANEL_TRANSPARENT = 0;
export const BLUR_MY_SHELL_PANEL_LIGHT = 1;
export const BLUR_MY_SHELL_PANEL_DARK = 2;
export const BLUR_MY_SHELL_PANEL_CONTRASTED = 3;
export const BLUR_MY_SHELL_DOCK_TRANSPARENT = 0;
export const BLUR_MY_SHELL_DOCK_LIGHT = 1;
export const BLUR_MY_SHELL_DOCK_DARK = 2;
export const BLUR_MY_SHELL_DOCK_STYLES = [
    'transparent-dash',
    'light-dash',
    'dark-dash',
];

export function getBlurMyShellSettings() {
    const defaultSource = Gio.SettingsSchemaSource.get_default();
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

        let schemaSource;
        // query_exists() only proves the file is there. new_from_directory()
        // validates the gvdb and throws GLib.FileError on a corrupt
        // gschemas.compiled, which would otherwise escape into enable().
        try {
            schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                schemaDirectory,
                defaultSource,
                false
            );
        } catch (error) {
            console.warn(
                `Simple Taskbar: ignoring unreadable Blur My Shell ` +
                `schema in ${schemaDirectory}: ${error.message}`
            );
            continue;
        }
        const schema = schemaSource.lookup(BLUR_MY_SHELL_SCHEMA, false);
        if (schema)
            return new Gio.Settings({settings_schema: schema});
    }

    const schema = defaultSource.lookup(BLUR_MY_SHELL_SCHEMA, true);
    return schema ? new Gio.Settings({settings_schema: schema}) : null;
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

export function blurMyShellBackgroundOnProximity() {
    const panelSettings = blurMyShellPanelSettings();
    return blurMyShellHasKey(panelSettings, 'override-background-dynamically-mode') &&
        panelSettings.get_boolean('override-background-dynamically') &&
        panelSettings.get_int('override-background-dynamically-mode') === 1;
}

export function blurMyShellPanelStyleIsTransparent() {
    const panelSettings = blurMyShellPanelSettings();
    if (blurMyShellHasKey(panelSettings, 'gradient-panel') &&
        panelSettings.get_boolean('gradient-panel'))
        return false;

    return blurMyShellPanelStyle() === BLUR_MY_SHELL_PANEL_TRANSPARENT;
}

export function blurMyShellPanelStyle() {
    const panelSettings = blurMyShellPanelSettings();
    if (!blurMyShellHasKey(panelSettings, 'style-panel'))
        return BLUR_MY_SHELL_PANEL_TRANSPARENT;

    return panelSettings.get_int('style-panel');
}

function blurMyShellDockSettings() {
    return getBlurMyShellChildSettings(getBlurMyShellSettings(), 'dash-to-dock');
}

export function blurMyShellOverridesDockBackground() {
    const dockSettings = blurMyShellDockSettings();
    if (!blurMyShellHasKey(dockSettings, 'override-background'))
        return false;

    return dockSettings.get_boolean('override-background');
}

export function blurMyShellDockStyle() {
    const dockSettings = blurMyShellDockSettings();
    if (!blurMyShellHasKey(dockSettings, 'style-dash-to-dock'))
        return null;

    return dockSettings.get_int('style-dash-to-dock');
}

export function blurMyShellDockRoundedCorners() {
    const dockSettings = blurMyShellDockSettings();
    const corners = blurMyShellHasKey(dockSettings, 'rounded-corners')
        ? dockSettings.get_int('rounded-corners')
        : 0;
    return {
        top: corners === 0 || corners === 1,
        bottom: corners === 0 || corners === 2,
    };
}

export function blurMyShellDockCornerRadius() {
    const dockSettings = blurMyShellDockSettings();
    if (!blurMyShellHasKey(dockSettings, 'corner-radius'))
        return null;

    return dockSettings.get_int('corner-radius');
}

export function blurMyShellHasKey(settings, key) {
    return Boolean(
        settings && settings.settings_schema.list_keys().includes(key)
    );
}
