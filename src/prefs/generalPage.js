// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addAppGridGroup} from './appGridGroup.js';
import {addBottomHotEdgeGroup} from './bottomHotEdgeGroup.js';
import {addFileManagerGroup} from './fileManagerGroup.js';
import {addPanelModeGroup} from './panelModeGroup.js';
import {addProfileTransferGroup} from './profileTransfer.js';
import {addResetGroup} from './preferencesDialogs.js';
import {addSettingsHub} from './settingsSubpage.js';
import {addWindowSwitchingGroup} from './windowSwitchingGroup.js';

export function addGeneralPage({window, settings, createSettings, connectSettings}) {
    const page = new Adw.PreferencesPage({
        title: _('General'),
        icon_name: 'preferences-system-symbolic',
    });
    window.add(page);

    addPanelModeGroup({page, settings, createSettings, connectSettings});
    const subpages = addSettingsHub(window, page, [{
        title: _('Features'),
        rows: [
            {
                id: 'appGrid',
                title: _('App Grid'),
                subtitle: _('Columns and rows of the GNOME app grid'),
                iconName: 'view-app-grid-symbolic',
            },
            {
                id: 'hotEdge',
                title: _('Bottom Hot Edge'),
                subtitle: _('Push the pointer against the bottom screen edge to toggle Overview'),
                iconName: 'go-bottom-symbolic',
            },
            {
                id: 'fileManager',
                title: _('File Manager'),
                subtitle: _('Folder shortcuts and the Super+E shortcut'),
                iconName: 'system-file-manager-symbolic',
            },
            {
                id: 'windowSwitching',
                title: _('Window Switching'),
                subtitle: _('Switch directly between open windows using live previews'),
                iconName: 'focus-windows-symbolic',
            },
        ],
    }, {
        title: _('Backup'),
        rows: [
            {
                id: 'backup',
                title: _('Profiles and Reset'),
                subtitle: _('Export, import, or reset all settings'),
                iconName: 'document-revert-symbolic',
            },
        ],
    }]);
    addAppGridGroup(subpages.appGrid, settings, connectSettings);
    addBottomHotEdgeGroup(subpages.hotEdge, settings, connectSettings);
    addFileManagerGroup(subpages.fileManager, settings, connectSettings);
    addWindowSwitchingGroup(subpages.windowSwitching, settings, connectSettings);
    addProfileTransferGroup(subpages.backup, window, settings, createSettings);
    addResetGroup(subpages.backup, window, createSettings);
    return page;
}
