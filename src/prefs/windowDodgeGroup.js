// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {windowDodgeModeChoices} from './windowDodgeModeChoices.js';
import {
    addComboRow,
    addSwitchRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {createRevealOptionsButton} from './autoHideDialog.js';

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
            choices: windowDodgeModeChoices(),
            addRow: row => dodgeRow.add_row(row),
        },
        connectSettings
    );

    const revealOptionsButton =
        createRevealOptionsButton(settings, pointerRevealKey);
    const {row: pointerRevealSwitch} = addSwitchRow(null, settings, {
        key: pointerRevealKey,
        title: _('Reveal on Pointer'),
        subtitle: pointerRevealSubtitle,
        addSuffix: row => row.add_suffix(revealOptionsButton),
        addRow: row => dodgeRow.add_row(row),
    });
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
        const revealable = available &&
            (dodgeSwitch.active || settings.get_boolean(autohideKey));
        pointerRevealSwitch.sensitive = revealable;
        revealOptionsButton.sensitive = revealable;
    };
    dodgeSwitch.connect('notify::active', syncAvailability);
    connectSettings(settings, `changed::${autohideKey}`, syncAvailability);
    syncAvailability();

    return {syncAvailability};
}
