// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {COMMON_FOLDERS, commonFolderKey} from '../shared/commonFolders.js';
import {createSwitchRow} from './preferencesWidgets.js';

function commonFolderLabels() {
    return {
        home: [_('Home'), _('Add the Home folder')],
        desktop: [_('Desktop'), _('Add the Desktop folder')],
        documents: [_('Documents'), _('Add the Documents folder')],
        downloads: [_('Downloads'), _('Add the Downloads folder')],
        music: [_('Music'), _('Add the Music folder')],
        pictures: [_('Pictures'), _('Add the Pictures folder')],
        videos: [_('Videos'), _('Add the Videos folder')],
    };
}

export function commonFolderSwitchOptions(prefix) {
    const labels = commonFolderLabels();
    return COMMON_FOLDERS.map(folder => ({
        key: commonFolderKey(folder, prefix),
        title: labels[folder.id][0],
        subtitle: labels[folder.id][1],
    }));
}

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

function createCommonFoldersRow(settings) {
    const row = new Adw.ExpanderRow({
        title: _('Common Folders'),
        subtitle: _('Choose which common folders appear'),
    });
    for (const option of commonFolderSwitchOptions('locations'))
        row.add_row(createSwitchRow(settings, option));
    return row;
}

function createLocationSeparatorRow(settings) {
    return createSwitchRow(settings, {
        key: 'show-location-separator',
        title: _('Show Location Separator'),
        subtitle: _('Show a line between applications and locations'),
    });
}

function addScopeLocationsGroup(page, settings, {
    prefix,
    title,
    description,
    locationsSubtitle,
    trashSubtitle,
    mountsSubtitle,
}) {
    const group = page.addGroup({title, description});
    const locationsRow = createSwitchRow(settings, {
        key: `${prefix}-show-locations`,
        title: _('Show Locations'),
        subtitle: locationsSubtitle,
    });
    const minimizedWindowsRow = createSwitchRow(settings, {
        key: `${prefix}-show-minimized-windows`,
        title: _('Show Minimized Window Previews'),
        subtitle: _('Show clickable window thumbnails before folders, drives, and Trash'),
    });
    const separatorRow = createLocationSeparatorRow(settings);
    const trashRow = createSwitchRow(settings, {
        key: `${prefix}-show-trash`,
        title: _('Show Trash'),
        subtitle: trashSubtitle,
    });
    const mountsRow = createSwitchRow(settings, {
        key: `${prefix}-show-mounts`,
        title: _('Show Drives and Volumes'),
        subtitle: mountsSubtitle,
    });
    const foldersRow = createCommonFoldersRow(settings);
    for (const row of [locationsRow, minimizedWindowsRow, separatorRow, trashRow, mountsRow, foldersRow])
        group.add(row);
    return {
        group,
        locationsRow,
        mountsRow,
        dependentRows: [minimizedWindowsRow, separatorRow, trashRow, mountsRow, foldersRow],
        driveOptionsGroup: addDriveOptionsGroup(page, settings),
    };
}

export function addLocationsGroup({
    page,
    dockPage,
    settings,
    connectSettings,
}) {
    const taskbar = addScopeLocationsGroup(page, settings, {
        prefix: 'taskbar',
        title: _('Taskbar Locations'),
        description: _('Choose which folders, drives, and Trash appear with taskbar applications'),
        locationsSubtitle: _('Display selected locations after taskbar applications'),
        trashSubtitle: _('Add the Trash to the taskbar'),
        mountsSubtitle: _('Add mounted or connected drives to the taskbar'),
    });
    const dock = addScopeLocationsGroup(dockPage, settings, {
        prefix: 'dock',
        title: _('Dock Locations'),
        description: _('Choose which folders, drives, and Trash appear with Dock applications'),
        locationsSubtitle: _('Display selected locations after Dock applications'),
        trashSubtitle: _('Add the Trash to the Dock'),
        mountsSubtitle: _('Add mounted or connected drives to the Dock'),
    });

    const syncAvailability = () => {
        const xpEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const defaultPanel = settings.get_boolean('default-gnome-panel');
        for (const group of [taskbar.group, taskbar.driveOptionsGroup])
            group.visible = !defaultPanel;
        if (xpEnabled && taskbar.locationsRow.active)
            taskbar.locationsRow.active = false;
        taskbar.locationsRow.sensitive = !xpEnabled;
        taskbar.group.sensitive = !defaultPanel && !xpEnabled;
        dock.group.sensitive = settings.get_boolean('dock-mode') && !xpEnabled;
        const taskbarEnabled = taskbar.group.sensitive && taskbar.locationsRow.active;
        const dockEnabled = dock.group.sensitive && dock.locationsRow.active;
        for (const row of taskbar.dependentRows)
            row.sensitive = taskbarEnabled;
        for (const row of dock.dependentRows)
            row.sensitive = dockEnabled;
        const driveOptionsEnabled =
            (taskbarEnabled && taskbar.mountsRow.active) ||
            (dockEnabled && dock.mountsRow.active);
        taskbar.driveOptionsGroup.sensitive = driveOptionsEnabled;
        dock.driveOptionsGroup.sensitive = driveOptionsEnabled;
    };
    for (const row of [
        taskbar.locationsRow,
        taskbar.mountsRow,
        dock.locationsRow,
        dock.mountsRow,
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
