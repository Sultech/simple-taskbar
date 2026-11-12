// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {panelApplicationAlignment, panelStartButtonPosition} from '../shared/panelModeSettings.js';
import {panelApplicationsVisible} from '../shared/panelApplicationVisibility.js';
import {startButtonVisible} from '../shared/startButtonLocation.js';
import {panelIsVertical} from '../shared/panelPositionUtils.js';

export function refreshPanelBoxSizes(boxes) {
    for (const box of boxes) {
        for (const child of box.get_children())
            child.queue_relayout();
        box.queue_relayout();
    }
}

export function createPanelItems({
    settings,
    windowsXpThemeEnabled,
    actors,
    includeTrayOverflow,
    includeShowDesktop,
    isSecondary,
}) {
    const startButtonPosition = panelStartButtonPosition(settings);
    const applicationsVisible = panelApplicationsVisible(settings, isSecondary);
    const items = [
        {
            id: 'start-button',
            actor: actors.startButton,
            position: startButtonPosition,
            visible: startButtonVisible(settings),
        },
        {
            id: 'activities',
            actor: actors.activities,
            position: settings.get_string('activities-button-position'),
            visible: true,
        },
        {
            id: 'focused-app',
            actor: actors.focusedApp,
            position: settings.get_string('focused-app-position'),
            visible: settings.get_boolean('focused-app-visible') && !panelIsVertical(settings),
        },
        {
            id: 'applications',
            actor: actors.taskbar,
            position: panelApplicationAlignment(settings),
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
