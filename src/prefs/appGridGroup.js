// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addSpinRow, addToggleChoiceRow} from './preferencesWidgets.js';

export function addAppGridGroup(page, settings, connectSettings) {
    const group = page.addGroup({
        title: _('App Grid'),
        description: _('Applies to the GNOME app grid in every mode'),
    });
    addToggleChoiceRow(
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
    const syncCustomRows = () => {
        const custom = settings.get_string('app-grid-layout') === 'custom';
        columnsRow.sensitive = custom;
        rowsRow.sensitive = custom;
    };
    connectSettings(settings, 'changed::app-grid-layout', syncCustomRows);
    syncCustomRows();
}
