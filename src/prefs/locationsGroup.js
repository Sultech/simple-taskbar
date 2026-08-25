// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {createSwitchRow} from './preferencesWidgets.js';

function createDriveOptionsRow(settings) {
    const row = new Adw.ExpanderRow({
        title: _('Drive Options'),
        subtitle: _('Choose which connected drives appear'),
    });
    row.add_row(createSwitchRow(settings, {
        key: 'locations-show-mounted-only',
        title: _('Only Show Mounted Drives'),
        subtitle: _('Hide drives that are connected but not mounted'),
    }));
    row.add_row(createSwitchRow(settings, {
        key: 'locations-show-network',
        title: _('Include Network Volumes'),
        subtitle: _('Include network-mounted locations'),
    }));
    return row;
}

function createCommonFoldersRow(settings) {
    const row = new Adw.ExpanderRow({
        title: _('Common Folders'),
        subtitle: _('Choose which common folders appear'),
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
        row.add_row(createSwitchRow(settings, option));
    }
    return row;
}

export function addLocationsGroup({
    page,
    dockPage,
    settings,
    connectSettings,
}) {
    const group = new Adw.PreferencesGroup({
        title: _('Locations'),
        description: _(
            'Show common folders, Trash, and connected drives in the taskbar.'
        ),
    });
    page.add(group);

    const taskbarRow = new Adw.ExpanderRow({
        title: _('Taskbar'),
        subtitle: _('Locations shown with taskbar applications'),
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
    taskbarRow.add_row(taskbarLocationsRow);
    taskbarRow.add_row(taskbarTrashRow);
    taskbarRow.add_row(taskbarMountsRow);
    group.add(taskbarRow);

    const dockRow = new Adw.ExpanderRow({
        title: _('Dock'),
        subtitle: _('Locations shown with Dock applications'),
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
    dockRow.add_row(dockLocationsRow);
    dockRow.add_row(dockTrashRow);
    dockRow.add_row(dockMountsRow);
    const dockGroup = new Adw.PreferencesGroup({
        title: _('Locations'),
        description: _('Show Trash and connected drives in the Dock.'),
    });
    dockPage.add(dockGroup);
    dockGroup.add(dockRow);

    const taskbarDriveOptionsRow = createDriveOptionsRow(settings);
    const taskbarCommonFoldersRow = createCommonFoldersRow(settings);
    const dockDriveOptionsRow = createDriveOptionsRow(settings);
    const dockCommonFoldersRow = createCommonFoldersRow(settings);
    group.add(taskbarDriveOptionsRow);
    group.add(taskbarCommonFoldersRow);
    dockGroup.add(dockDriveOptionsRow);
    dockGroup.add(dockCommonFoldersRow);

    const syncAvailability = () => {
        const xpEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        if (xpEnabled && taskbarLocationsRow.active)
            taskbarLocationsRow.active = false;
        taskbarLocationsRow.sensitive = !xpEnabled;
        taskbarRow.sensitive = !settings.get_boolean(
            'default-gnome-panel'
        ) && !xpEnabled;
        dockRow.sensitive = settings.get_boolean('dock-mode') && !xpEnabled;
        const taskbarEnabled = taskbarRow.sensitive &&
            taskbarLocationsRow.active;
        const dockEnabled = dockRow.sensitive && dockLocationsRow.active;
        taskbarTrashRow.sensitive = taskbarEnabled;
        taskbarMountsRow.sensitive = taskbarEnabled;
        dockTrashRow.sensitive = dockEnabled;
        dockMountsRow.sensitive = dockEnabled;
        const driveOptionsEnabled =
            (taskbarEnabled && taskbarMountsRow.active) ||
            (dockEnabled && dockMountsRow.active);
        taskbarDriveOptionsRow.sensitive = driveOptionsEnabled;
        dockDriveOptionsRow.sensitive = driveOptionsEnabled;
        taskbarCommonFoldersRow.sensitive = taskbarEnabled;
        dockCommonFoldersRow.sensitive = dockEnabled;
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
