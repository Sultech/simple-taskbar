// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {createSwitchRow} from './preferencesWidgets.js';
import {commonFolderSwitchOptions} from './locationsGroup.js';

export function addStartMenuFoldersGroup({settings, foldersSubpage, windowsStartMenuSwitch}) {
    const startMenuFoldersGroup = foldersSubpage.addGroup({
        title: _('Folder Shortcuts'),
        description: _('Choose which folders appear beside the Settings icon'),
    });
    const startMenuLocationsSwitch = createSwitchRow(settings, {
        key: 'start-menu-show-locations',
        title: _('Show Folder Shortcuts'),
        subtitle: _('Show selected folders beside the Settings icon in the Start Menu'),
    });
    startMenuFoldersGroup.add(startMenuLocationsSwitch);
    const startMenuFolderRows = [];
    for (const option of commonFolderSwitchOptions('start-menu')) {
        const row = createSwitchRow(settings, option);
        startMenuFoldersGroup.add(row);
        startMenuFolderRows.push(row);
    }
    const updateStartMenuLocationControls = () => {
        startMenuFoldersGroup.sensitive = windowsStartMenuSwitch.active;
        for (const row of startMenuFolderRows)
            row.sensitive = startMenuLocationsSwitch.active;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateStartMenuLocationControls
    );
    startMenuLocationsSwitch.connect(
        'notify::active',
        updateStartMenuLocationControls
    );
    updateStartMenuLocationControls();
}
