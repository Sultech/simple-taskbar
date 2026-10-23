// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    AUTO_HIDE_REVEAL_MODE,
    AUTO_HIDE_SETTINGS,
    DOCK_AUTO_HIDE_SETTINGS,
    pressureRevealAtBottom,
} from '../shared/autoHideSettings.js';
import {
    createSwitchRow,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

export function addBottomHotEdgeGroup(page, settings, connectSettings) {
    const group = page.addGroup({
        title: _('Bottom Hot Edge'),
        description: _('These options apply to the mode that is currently active'),
    });
    const enabledSwitch = createSwitchRow(settings, {
        key: 'hot-edge-overview-enabled',
        title: _('Enable Bottom Hot Edge'),
        subtitle: _(
            'Push the pointer against the bottom screen edge to toggle Overview. Turns off pressure reveal.'
        ),
    });
    group.add(enabledSwitch);

    const pressureRow = addSliderRow(
        group,
        settings,
        {
            key: 'hot-edge-pressure-threshold',
            unit: 'px',
            title: _('Activation Pressure'),
            subtitle: _(
                'Pixels the pointer must travel past the bottom edge before Overview activates'
            ),
            lower: 0,
            upper: 500,
            step: 25,
        },
        connectSettings
    );

    const animationSwitch = createSwitchRow(settings, {
        key: 'hot-edge-animation-enabled',
        title: _('Hot Edge Animation'),
        subtitle: _('Show a ripple when the bottom hot edge activates'),
    });
    group.add(animationSwitch);
    const syncControls = () => {
        animationSwitch.sensitive = enabledSwitch.active;
        pressureRow.sensitive = enabledSwitch.active;
    };
    enabledSwitch.connect('notify::active', syncControls);
    syncControls();

    const disablePressureWithHotEdge = () => {
        if (!settings.get_boolean('hot-edge-overview-enabled'))
            return;

        for (const [modeKey, positionKey] of [
            [AUTO_HIDE_SETTINGS.revealMode, 'panel-position'],
            [DOCK_AUTO_HIDE_SETTINGS.revealMode, 'dock-position'],
        ]) {
            if (pressureRevealAtBottom(settings, modeKey, positionKey))
                settings.set_string(modeKey, AUTO_HIDE_REVEAL_MODE.INSTANT);
        }
    };
    for (const key of ['hot-edge-overview-enabled', 'panel-position', 'dock-position'])
        connectSettings(settings, `changed::${key}`, disablePressureWithHotEdge);
    disablePressureWithHotEdge();
}
