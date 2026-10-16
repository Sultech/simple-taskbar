// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DODGE_WINDOW_MODE} from '../shared/windowDodgeModes.js';
import {
    addComboRow,
    addSwitchRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {createRevealOptionsButton} from './autoHideDialog.js';

export function windowDodgeModeChoices() {
    return [
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
    ];
}

export function addWindowDodgeGroup(
    page,
    settings,
    {
        enabledKey,
        modeKey,
        pointerRevealKey,
        autohideKey,
        autohideSwitch,
        visibilityTitle,
        visibilityDescription,
        dodgeSubtitle,
        modeSubtitle,
        pointerRevealSubtitle,
        timingDescriptions,
        visibilityRows,
        isAvailable = () => true,
        connectSettings,
    }
) {
    const dodgeGroup = page.addGroup({
        title: visibilityTitle,
        description: visibilityDescription,
    });
    dodgeGroup.add(autohideSwitch);
    const dodgeSwitch = createSwitchRow(settings, {
        key: enabledKey,
        title: _('Enable Dodge Windows'),
        subtitle: dodgeSubtitle,
    });
    dodgeGroup.add(dodgeSwitch);

    const modeRow = addComboRow(
        dodgeGroup,
        settings,
        {
            key: modeKey,
            title: _('Dodge Windows Mode'),
            subtitle: modeSubtitle,
            choices: windowDodgeModeChoices(),
            addRow: row => dodgeGroup.add(row),
        },
        connectSettings
    );

    const revealOptionsButton =
        createRevealOptionsButton(
            settings,
            pointerRevealKey,
            timingDescriptions
        );
    const {
        row: pointerRevealRow,
        toggle: pointerRevealSwitch,
    } = addSwitchRow(null, settings, {
        key: pointerRevealKey,
        title: _('Reveal on Pointer'),
        subtitle: pointerRevealSubtitle,
        addSuffix: row => row.add_suffix(revealOptionsButton),
        addRow: row => dodgeGroup.add(row),
    });
    for (const row of visibilityRows)
        dodgeGroup.add(row);

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
        const available = isAvailable();
        dodgeGroup.sensitive = available;
        dodgeSwitch.sensitive = available;
        modeRow.sensitive = available && dodgeSwitch.active;
        const autoHideEnabled = settings.get_boolean(autohideKey);
        const revealable = available &&
            (dodgeSwitch.active || autoHideEnabled);
        pointerRevealRow.sensitive = revealable;
        revealOptionsButton.sensitive = revealable &&
            (autoHideEnabled || pointerRevealSwitch.active);
    };
    dodgeSwitch.connect('notify::active', syncAvailability);
    pointerRevealSwitch.connect('notify::active', syncAvailability);
    connectSettings(settings, `changed::${autohideKey}`, syncAvailability);
    syncAvailability();

    return {group: dodgeGroup, syncAvailability};
}
