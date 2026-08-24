// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function createSwitchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({
        title,
        subtitle,
        active: settings.get_boolean(key),
    });
    settings.bind(
        key,
        row,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    return row;
}

function createDriveOptionsRow(settings) {
    const row = new Adw.ExpanderRow({
        title: _('Drive Options'),
        subtitle: _('Choose which connected drives appear'),
    });
    row.add_row(createSwitchRow(
        settings,
        'locations-show-mounted-only',
        _('Only Show Mounted Drives'),
        _('Hide drives that are connected but not mounted')
    ));
    row.add_row(createSwitchRow(
        settings,
        'locations-show-network',
        _('Include Network Volumes'),
        _('Include network-mounted locations')
    ));
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
        description: _('Show Trash and connected drives in the taskbar.'),
    });
    page.add(group);

    const taskbarRow = new Adw.ExpanderRow({
        title: _('Taskbar'),
        subtitle: _('Locations shown with taskbar applications'),
    });
    const taskbarLocationsRow = createSwitchRow(
        settings,
        'taskbar-show-locations',
        _('Show Locations'),
        _('Display selected locations after taskbar applications')
    );
    const taskbarTrashRow = createSwitchRow(
        settings,
        'taskbar-show-trash',
        _('Show Trash'),
        _('Add the Trash to the taskbar')
    );
    const taskbarMountsRow = createSwitchRow(
        settings,
        'taskbar-show-mounts',
        _('Show Drives and Volumes'),
        _('Add mounted or connected drives to the taskbar')
    );
    taskbarRow.add_row(taskbarLocationsRow);
    taskbarRow.add_row(taskbarTrashRow);
    taskbarRow.add_row(taskbarMountsRow);
    group.add(taskbarRow);

    const dockRow = new Adw.ExpanderRow({
        title: _('Dock'),
        subtitle: _('Locations shown with Dock applications'),
    });
    const dockLocationsRow = createSwitchRow(
        settings,
        'dock-show-locations',
        _('Show Locations'),
        _('Display selected locations after Dock applications')
    );
    const dockTrashRow = createSwitchRow(
        settings,
        'dock-show-trash',
        _('Show Trash'),
        _('Add the Trash to the Dock')
    );
    const dockMountsRow = createSwitchRow(
        settings,
        'dock-show-mounts',
        _('Show Drives and Volumes'),
        _('Add mounted or connected drives to the Dock')
    );
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
    const dockDriveOptionsRow = createDriveOptionsRow(settings);
    group.add(taskbarDriveOptionsRow);
    dockGroup.add(dockDriveOptionsRow);

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
