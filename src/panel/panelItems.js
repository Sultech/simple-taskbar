// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function createPanelItems({
    settings,
    windowsXpThemeEnabled,
    actors,
    includeTrayOverflow,
    includeShowDesktop,
}) {
    const startButtonPosition = settings.get_boolean(
        'start-button-follow-app-alignment'
    )
        ? settings.get_string('app-alignment')
        : settings.get_string('start-button-position');
    const startButtonVisible =
        !settings.get_boolean('default-gnome-panel') &&
        (settings.get_boolean('windows-start-menu-enabled') ||
            settings.get_boolean('gnome-start-button-visible'));
    const items = [
        {
            id: 'start-button',
            actor: actors.startButton,
            position: startButtonPosition,
            visible: startButtonVisible,
        },
        {
            id: 'activities',
            actor: actors.activities,
            position: settings.get_string('activities-button-position'),
            visible: true,
        },
        {
            id: 'applications',
            actor: actors.taskbar,
            position: settings.get_string('app-alignment'),
            visible: true,
        },
        {
            id: 'folder-menu',
            actor: actors.folderMenu,
            position: settings.get_string('folder-menu-position'),
            visible: settings.get_boolean('folder-menu-enabled'),
        },
    ];
    if (includeTrayOverflow) {
        items.push({
            id: 'tray-overflow',
            actor: actors.trayOverflow,
            position: settings.get_string('tray-overflow-position'),
            visible: true,
        });
    }
    if (windowsXpThemeEnabled) {
        items.push({
            id: 'clock',
            actor: actors.notificationArea,
            position: settings.get_string('clock-position'),
            visible: true,
        });
    } else {
        items.push(
            {
                id: 'system-menu',
                actor: actors.quickSettings,
                position: settings.get_string('system-menu-position'),
                visible: true,
            },
            {
                id: 'clock',
                actor: actors.dateMenu,
                position: settings.get_string('clock-position'),
                visible: true,
            }
        );
    }
    if (includeShowDesktop && !windowsXpThemeEnabled) {
        items.push({
            id: 'show-desktop',
            actor: actors.showDesktop,
            position: settings.get_string('show-desktop-button-position'),
            visible: settings.get_boolean('show-desktop-button-visible'),
        });
    }
    return items;
}
