// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addSpinRow,
    createSwitchRow,
} from './preferencesWidgets.js';

export function createBottomHotEdgeRow(settings, connectSettings) {
    const row = new Adw.ExpanderRow({
        title: _('Bottom Hot Edge'),
        subtitle: _(
            'Configure the bottom-edge gesture, pressure, and animation for toggling Overview'
        ),
    });
    const enabledSwitch = createSwitchRow(settings, {
        key: 'hot-edge-overview-enabled',
        title: _('Enable Bottom Hot Edge'),
        subtitle: _(
            'Push the pointer against the bottom screen edge to toggle Overview. Turns off pressure reveal.'
        ),
    });
    row.add_row(enabledSwitch);

    const pressureRow = addSpinRow(
        row,
        settings,
        {
            key: 'hot-edge-pressure-threshold',
            title: _('Activation Pressure'),
            subtitle: _(
                'Pixels the pointer must travel past the bottom edge before Overview activates'
            ),
            lower: 0,
            upper: 500,
            step: 25,
            addRow: child => row.add_row(child),
        },
        connectSettings
    );

    const animationSwitch = createSwitchRow(settings, {
        key: 'hot-edge-animation-enabled',
        title: _('Hot Edge Animation'),
        subtitle: _('Show a ripple when the bottom hot edge activates'),
    });
    row.add_row(animationSwitch);
    const syncControls = () => {
        animationSwitch.sensitive = enabledSwitch.active;
        pressureRow.sensitive = enabledSwitch.active;
    };
    enabledSwitch.connect('notify::active', syncControls);
    syncControls();
    return row;
}
