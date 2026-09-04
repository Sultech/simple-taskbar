// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DODGE_WINDOW_MODE} from '../shared/windowDodgeModes.js';
import {addComboRow, createSwitchRow} from './preferencesWidgets.js';

export function addWindowDodgeRows(
    group,
    settings,
    {
        enabledKey,
        modeKey,
        pointerRevealKey,
        autohideKey,
        autohideSwitch,
        visibilityTitle,
        visibilitySubtitle,
        dodgeSubtitle,
        modeSubtitle,
        pointerRevealSubtitle,
        visibilityRows,
        connectSettings,
    }
) {
    const dodgeRow = new Adw.ExpanderRow({
        title: visibilityTitle,
        subtitle: visibilitySubtitle,
    });
    dodgeRow.add_row(autohideSwitch);
    const dodgeSwitch = createSwitchRow(settings, {
        key: enabledKey,
        title: _('Enable Dodge Windows'),
        subtitle: dodgeSubtitle,
    });
    dodgeRow.add_row(dodgeSwitch);

    const modeRow = addComboRow(
        dodgeRow,
        settings,
        {
            key: modeKey,
            title: _('Dodge Windows Mode'),
            subtitle: modeSubtitle,
            choices: [
                {
                    value: DODGE_WINDOW_MODE.ALL_WINDOWS,
                    label: _('All windows'),
                },
                {
                    value: DODGE_WINDOW_MODE.FOCUSED_APPLICATION,
                    label: _('Only focused application’s windows'),
                },
                {
                    value: DODGE_WINDOW_MODE.FOCUSED_WINDOW,
                    label: _('Only focused window'),
                },
                {
                    value: DODGE_WINDOW_MODE.MAXIMIZED_WINDOWS,
                    label: _('Only maximized windows'),
                },
            ],
            addRow: row => dodgeRow.add_row(row),
        },
        connectSettings
    );

    const pointerRevealSwitch = createSwitchRow(settings, {
        key: pointerRevealKey,
        title: _('Reveal on Pointer'),
        subtitle: pointerRevealSubtitle,
    });
    dodgeRow.add_row(pointerRevealSwitch);
    for (const row of visibilityRows)
        dodgeRow.add_row(row);
    group.add(dodgeRow);

    const disableAutoHideWhenDodgeEnabled = () => {
        if (settings.get_boolean(enabledKey) &&
            settings.get_boolean(autohideKey)) {
            settings.set_boolean(autohideKey, false);
        }
    };
    const disableDodgeWhenAutoHideEnabled = () => {
        if (settings.get_boolean(autohideKey) &&
            settings.get_boolean(enabledKey)) {
            settings.set_boolean(enabledKey, false);
        }
    };
    connectSettings(
        settings,
        `changed::${enabledKey}`,
        disableAutoHideWhenDodgeEnabled
    );
    connectSettings(
        settings,
        `changed::${autohideKey}`,
        disableDodgeWhenAutoHideEnabled
    );
    disableAutoHideWhenDodgeEnabled();

    const syncAvailability = () => {
        const available = group.sensitive;
        dodgeRow.sensitive = available;
        dodgeSwitch.sensitive = available;
        modeRow.sensitive = available && dodgeSwitch.active;
        pointerRevealSwitch.sensitive = available && dodgeSwitch.active;
    };
    dodgeSwitch.connect('notify::active', syncAvailability);
    syncAvailability();

    return {syncAvailability};
}
