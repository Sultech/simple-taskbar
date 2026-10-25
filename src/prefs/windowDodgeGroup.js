// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DODGE_WINDOW_MODE} from '../shared/windowDodgeModes.js';
import {
    addComboRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {createIntellihideOptionsButton} from './autoHideDialog.js';

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
        autoHideKeys,
        positionKey,
        autohideSwitch,
        visibilityTitle,
        visibilityDescription,
        dodgeSubtitle,
        modeSubtitle,
        pointerRevealSubtitle,
        timingDescriptions,
        edgeReveal,
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
        },
        connectSettings
    );

    const intellihideOptionsButton = createIntellihideOptionsButton(
        settings,
        pointerRevealKey,
        autohideKey,
        autoHideKeys,
        positionKey,
        edgeReveal,
        {...timingDescriptions, pointerReveal: pointerRevealSubtitle}
    );
    const intellihideOptionsRow = new Adw.ActionRow({
        title: _('Intellihide Options'),
        subtitle: _('Pointer reveal, timing and Overview behaviour for auto-hide and dodge windows'),
        activatable_widget: intellihideOptionsButton,
    });
    intellihideOptionsRow.add_suffix(intellihideOptionsButton);
    dodgeGroup.add(intellihideOptionsRow);

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
        intellihideOptionsRow.sensitive = available &&
            (dodgeSwitch.active || settings.get_boolean(autohideKey));
    };
    dodgeSwitch.connect('notify::active', syncAvailability);
    connectSettings(settings, `changed::${autohideKey}`, syncAvailability);
    syncAvailability();

    return {group: dodgeGroup, syncAvailability};
}
