// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {createSwitchRow} from './preferencesWidgets.js';

function addDriveOptionsGroup(page, settings) {
    const group = page.addGroup({
        title: _('Drive and Volume Options'),
        description: _('Choose which drives and network volumes appear'),
    });
    group.add(createSwitchRow(settings, {
        key: 'locations-show-mounted-only',
        title: _('Only Show Mounted Drives'),
        subtitle: _('Hide drives that are connected but not mounted'),
    }));
    group.add(createSwitchRow(settings, {
        key: 'locations-show-network',
        title: _('Include Network Volumes'),
        subtitle: _('Include network-mounted locations'),
    }));
    return group;
}

function addCommonFoldersGroup(page, settings) {
    const group = page.addGroup({
        title: _('Common Folders'),
        description: _('Choose which common folders appear'),
    });
    for (const option of [
        {
            key: 'locations-show-home',
            title: _('Home'),
            subtitle: _('Add the Home folder'),
        },
        {
            key: 'locations-show-desktop',
            title: _('Desktop'),
            subtitle: _('Add the Desktop folder'),
        },
        {
            key: 'locations-show-documents',
            title: _('Documents'),
            subtitle: _('Add the Documents folder'),
        },
        {
            key: 'locations-show-downloads',
            title: _('Downloads'),
            subtitle: _('Add the Downloads folder'),
        },
        {
            key: 'locations-show-music',
            title: _('Music'),
            subtitle: _('Add the Music folder'),
        },
        {
            key: 'locations-show-pictures',
            title: _('Pictures'),
            subtitle: _('Add the Pictures folder'),
        },
        {
            key: 'locations-show-videos',
            title: _('Videos'),
            subtitle: _('Add the Videos folder'),
        },
    ]) {
        group.add(createSwitchRow(settings, option));
    }
    return group;
}

export function addLocationsGroup({
    page,
    dockPage,
    settings,
    connectSettings,
}) {
    const taskbarLocationsGroup = page.addGroup({
        title: _('Taskbar Locations'),
        description: _(
            'Choose which folders, drives, and Trash appear with taskbar applications'
        ),
    });
    const taskbarLocationsRow = createSwitchRow(settings, {
        key: 'taskbar-show-locations',
        title: _('Show Locations'),
        subtitle: _('Display selected locations after taskbar applications'),
    });
    const taskbarTrashRow = createSwitchRow(settings, {
        key: 'taskbar-show-trash',
        title: _('Show Trash'),
        subtitle: _('Add the Trash to the taskbar'),
    });
    const taskbarMountsRow = createSwitchRow(settings, {
        key: 'taskbar-show-mounts',
        title: _('Show Drives and Volumes'),
        subtitle: _('Add mounted or connected drives to the taskbar'),
    });
    taskbarLocationsGroup.add(taskbarLocationsRow);
    taskbarLocationsGroup.add(taskbarTrashRow);
    taskbarLocationsGroup.add(taskbarMountsRow);
    const taskbarDriveOptionsGroup = addDriveOptionsGroup(page, settings);
    const taskbarCommonFoldersGroup = addCommonFoldersGroup(page, settings);

    const dockLocationsGroup = dockPage.addGroup({
        title: _('Dock Locations'),
        description: _(
            'Choose which folders, drives, and Trash appear with Dock applications'
        ),
    });
    const dockLocationsRow = createSwitchRow(settings, {
        key: 'dock-show-locations',
        title: _('Show Locations'),
        subtitle: _('Display selected locations after Dock applications'),
    });
    const dockTrashRow = createSwitchRow(settings, {
        key: 'dock-show-trash',
        title: _('Show Trash'),
        subtitle: _('Add the Trash to the Dock'),
    });
    const dockMountsRow = createSwitchRow(settings, {
        key: 'dock-show-mounts',
        title: _('Show Drives and Volumes'),
        subtitle: _('Add mounted or connected drives to the Dock'),
    });
    dockLocationsGroup.add(dockLocationsRow);
    dockLocationsGroup.add(dockTrashRow);
    dockLocationsGroup.add(dockMountsRow);
    const dockDriveOptionsGroup = addDriveOptionsGroup(dockPage, settings);
    const dockCommonFoldersGroup = addCommonFoldersGroup(dockPage, settings);

    const syncAvailability = () => {
        const xpEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const defaultPanel = settings.get_boolean('default-gnome-panel');
        for (const group of [taskbarLocationsGroup, taskbarDriveOptionsGroup, taskbarCommonFoldersGroup])
            group.visible = !defaultPanel;
        if (xpEnabled && taskbarLocationsRow.active)
            taskbarLocationsRow.active = false;
        taskbarLocationsRow.sensitive = !xpEnabled;
        taskbarLocationsGroup.sensitive = !defaultPanel && !xpEnabled;
        dockLocationsGroup.sensitive = settings.get_boolean('dock-mode') && !xpEnabled;
        const taskbarEnabled = taskbarLocationsGroup.sensitive &&
            taskbarLocationsRow.active;
        const dockEnabled = dockLocationsGroup.sensitive && dockLocationsRow.active;
        taskbarTrashRow.sensitive = taskbarEnabled;
        taskbarMountsRow.sensitive = taskbarEnabled;
        dockTrashRow.sensitive = dockEnabled;
        dockMountsRow.sensitive = dockEnabled;
        const driveOptionsEnabled =
            (taskbarEnabled && taskbarMountsRow.active) ||
            (dockEnabled && dockMountsRow.active);
        taskbarDriveOptionsGroup.sensitive = driveOptionsEnabled;
        dockDriveOptionsGroup.sensitive = driveOptionsEnabled;
        taskbarCommonFoldersGroup.sensitive = taskbarEnabled;
        dockCommonFoldersGroup.sensitive = dockEnabled;
    };
    for (const row of [
        taskbarLocationsRow,
        taskbarMountsRow,
        dockLocationsRow,
        dockMountsRow,
    ]) {
        row.connect('notify::active', syncAvailability);
    }
    for (const key of [
        'default-gnome-panel',
        'dock-mode',
        'windows-xp-theme-enabled',
    ]) {
        connectSettings(settings, `changed::${key}`, syncAvailability);
    }
    syncAvailability();
}
