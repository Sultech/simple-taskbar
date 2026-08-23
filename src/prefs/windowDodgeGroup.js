// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DODGE_WINDOW_MODE} from '../shared/windowDodgeModes.js';
import {addComboRow} from './preferencesWidgets.js';

export function addWindowDodgeRows(
    group,
    settings,
    {
        enabledKey,
        modeKey,
        pointerRevealKey,
        autohideKey,
        connectSettings,
    }
) {
    const dodgeSwitch = new Adw.SwitchRow({
        title: _('Dodge Windows'),
        subtitle: _('Hide the panel or Dock when a qualifying window overlaps it'),
        active: settings.get_boolean(enabledKey),
    });
    group.add(dodgeSwitch);
    settings.bind(
        enabledKey,
        dodgeSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const modeRow = addComboRow(
        group,
        settings,
        {
            key: modeKey,
            title: _('Dodge Windows Mode'),
            subtitle: _('Choose which windows make the panel or Dock hide'),
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
                    value: DODGE_WINDOW_MODE.MAXIMIZED_WINDOWS,
                    label: _('Only maximized windows'),
                },
                {
                    value: DODGE_WINDOW_MODE.ALWAYS_ON_TOP,
                    label: _('Always on top'),
                },
            ],
        },
        connectSettings
    );

    const pointerRevealSwitch = new Adw.SwitchRow({
        title: _('Reveal on Pointer'),
        subtitle: _('Reveal the panel or Dock when the pointer reaches its screen edge while dodging a window'),
        active: settings.get_boolean(pointerRevealKey),
    });
    group.add(pointerRevealSwitch);
    settings.bind(
        pointerRevealKey,
        pointerRevealSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

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
        dodgeSwitch.sensitive = available;
        modeRow.sensitive = available && dodgeSwitch.active;
        pointerRevealSwitch.sensitive = available && dodgeSwitch.active;
    };
    dodgeSwitch.connect('notify::active', syncAvailability);
    syncAvailability();

    return {syncAvailability};
}
