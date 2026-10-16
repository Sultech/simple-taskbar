// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {isDefaultPanelWithoutDock} from '../shared/panelModeProfiles.js';
import {createSwitchRow} from './preferencesWidgets.js';

export function addFileManagerGroup(page, settings, connectSettings) {
    const group = page.addGroup({
        title: _('File Manager'),
        description: _('Configure file manager shortcuts'),
    });
    const placesRow = createSwitchRow(settings, {
        key: 'nautilus-places-enabled',
        title: _('Nautilus Folder Shortcuts'),
        subtitle: _('Show common folders in the menu of the Files icon on the taskbar or Dock'),
    });
    group.add(placesRow);
    group.add(createSwitchRow(settings, {
        key: 'super-e-file-manager-enabled',
        title: _('Super+E Opens File Manager'),
        subtitle: _(
            'Open your home folder with the system’s default file manager'
        ),
    }));

    const syncPlacesRow = () => {
        placesRow.sensitive = !isDefaultPanelWithoutDock(settings);
    };
    for (const key of ['default-gnome-panel', 'dock-mode'])
        connectSettings(settings, `changed::${key}`, syncPlacesRow);
    syncPlacesRow();
}
