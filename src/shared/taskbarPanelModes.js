export const TASKBAR_GEOMETRY_KEYS = Object.freeze([
    'taskbar-dynamic',
    'taskbar-floating',
    'taskbar-dynamic-floating',
    'windows-xp-theme-enabled',
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

export function panelStartButtonPosition(settings) {
    if (dynamicTaskbarEnabled(settings))
        return 'center';

    return settings.get_boolean('start-button-follow-app-alignment')
        ? settings.get_string('app-alignment')
        : settings.get_string('start-button-position');
}
