// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addSpinRow, addToggleChoiceRow} from './preferencesWidgets.js';
import {extensionEnabled} from '../shared/settingsUtils.js';

const V_SHELL_UUID = 'vertical-workspaces@G-dH.github.com';

export function addAppGridGroup(page, settings, connectSettings) {
    const group = page.addGroup({title: _('App Grid')});
    const layoutRow = addToggleChoiceRow(
        group,
        settings,
        {
            key: 'app-grid-layout',
            title: _('App Grid Layout'),
            subtitle: _('Columns and rows of the GNOME app grid'),
            choices: [
                {value: 'auto', label: _('Automatic')},
                {value: 'custom', label: _('Custom')},
            ],
        },
        connectSettings
    );
    const columnsRow = addSpinRow(
        group,
        settings,
        {
            key: 'app-grid-columns',
            title: _('App Grid Columns'),
            subtitle: _('Applications across each page'),
            lower: 2,
            upper: 12,
        },
        connectSettings
    );
    const rowsRow = addSpinRow(
        group,
        settings,
        {
            key: 'app-grid-rows',
            title: _('App Grid Rows'),
            subtitle: _('Applications down each page'),
            lower: 2,
            upper: 10,
        },
        connectSettings
    );
    const shellSettings = new Gio.Settings({schema_id: 'org.gnome.shell'});
    const syncCustomRows = () => {
        const available = !extensionEnabled(shellSettings, V_SHELL_UUID);
        const custom = settings.get_string('app-grid-layout') === 'custom';
        group.description = available
            ? _('Applies to the GNOME app grid in every mode')
            : _('V-Shell manages the app grid while it is enabled');
        layoutRow.sensitive = available;
        columnsRow.sensitive = available && custom;
        rowsRow.sensitive = available && custom;
    };
    connectSettings(settings, 'changed::app-grid-layout', syncCustomRows);
    connectSettings(shellSettings, 'changed::enabled-extensions', syncCustomRows);
    connectSettings(shellSettings, 'changed::disabled-extensions', syncCustomRows);
    syncCustomRows();
}
