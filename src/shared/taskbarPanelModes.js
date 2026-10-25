// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const START_BUTTON_LOCATION_KEY = 'default-panel-start-button-location';

export const TASKBAR_GEOMETRY_KEYS = Object.freeze([
    'taskbar-dynamic',
    'taskbar-floating',
    'taskbar-dynamic-floating',
    'windows-xp-theme-enabled',
]);

export const DOCK_FLOATING_KEYS = Object.freeze([
    'dock-panel-mode',
    'dock-floating',
    'dock-panel-mode-floating',
]);

function panelGeometryModesAvailable(settings) {
    return !settings.isDock &&
        !settings.get_boolean('windows-xp-theme-enabled');
}

export function dynamicTaskbarEnabled(settings) {
    return panelGeometryModesAvailable(settings) &&
        settings.get_boolean('taskbar-dynamic');
}

export function floatingTaskbarEnabled(settings) {
    return panelGeometryModesAvailable(settings) &&
        settings.get_boolean(settings.get_boolean('taskbar-dynamic')
            ? 'taskbar-dynamic-floating'
            : 'taskbar-floating');
}

export function taskbarGeometryEnabled(settings) {
    return dynamicTaskbarEnabled(settings) || floatingTaskbarEnabled(settings);
}

export function panelApplicationAlignment(settings) {
    return dynamicTaskbarEnabled(settings)
        ? 'center' : settings.get_string('app-alignment');
}

export function startButtonInPanel(settings) {
    return settings.get_boolean('default-gnome-panel') &&
        settings.get_string(START_BUTTON_LOCATION_KEY) === 'panel';
}

export function startButtonAlignmentKey(settings, key) {
    return !settings.isDock && startButtonInPanel(settings)
        ? `default-panel-${key}` : key;
}

export function panelStartButtonPosition(settings) {
    if (dynamicTaskbarEnabled(settings))
        return 'center';

    return settings.get_boolean(startButtonAlignmentKey(settings, 'start-button-follow-app-alignment'))
        ? settings.get_string('app-alignment')
        : settings.get_string(startButtonAlignmentKey(settings, 'start-button-position'));
}

export function dockFloatingEnabled(settings) {
    return settings.get_boolean(settings.get_boolean('dock-panel-mode')
        ? 'dock-panel-mode-floating'
        : 'dock-floating');
}
