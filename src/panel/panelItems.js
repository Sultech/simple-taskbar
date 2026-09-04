// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    shouldHidePinnedApplications,
} from '../shared/taskbarPinnedVisibility.js';

export function createPanelItems({
    settings,
    windowsXpThemeEnabled,
    actors,
    includeTrayOverflow,
    includeShowDesktop,
    isSecondary,
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
    const hidePinned = shouldHidePinnedApplications(settings, isSecondary);
    const applicationsVisible =
        !settings.get_boolean('default-gnome-panel') &&
        !(hidePinned &&
            settings.get_boolean('hide-unpinned-taskbar-apps'));
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
            visible: applicationsVisible,
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
            visible: settings.get_boolean('clock-visible'),
        });
    } else {
        items.push(
            {
                id: 'system-menu',
                actor: actors.quickSettings,
                position: settings.get_string('system-menu-position'),
                visible: settings.get_boolean('system-menu-visible'),
            },
            {
                id: 'clock',
                actor: actors.dateMenu,
                position: settings.get_string('clock-position'),
                visible: settings.get_boolean('clock-visible'),
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
