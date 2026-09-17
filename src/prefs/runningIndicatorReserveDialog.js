// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    RUNNING_INDICATOR_RESERVE_SETTING_KEYS,
    RUNNING_INDICATOR_RESERVE_SETTINGS,
} from '../shared/runningIndicatorSettings.js';
import {
    addSpinRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';

export function createRunningIndicatorReserveOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Running Indicator Reserve'),
        RunningIndicatorReserveDialog
    );
}

export const RunningIndicatorReserveDialog = GObject.registerClass(
class RunningIndicatorReserveDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Running Indicator Reserve'),
            transient_for: parent,
            modal: true,
            default_width: 560,
            default_height: 360,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);
        const reserveGroup = new Adw.PreferencesGroup({
            title: _('Indicator Reserve'),
            description: _(
                'Add space beside indicators for Glass and Classic effects'
            ),
        });
        content.append(reserveGroup);

        const reserveSwitch = createSwitchRow(settings, {
            key: RUNNING_INDICATOR_RESERVE_SETTINGS.enabled,
            title: _('Enable Reserve'),
        });
        reserveGroup.add(reserveSwitch);
        const symmetricalSwitch = createSwitchRow(settings, {
            key: RUNNING_INDICATOR_RESERVE_SETTINGS.symmetrical,
            title: _('Symmetrical Reserve'),
            subtitle: _('Add the same reserve to the opposite side'),
        });
        reserveGroup.add(symmetricalSwitch);
        const reserveSizeRow = addSpinRow(
            reserveGroup,
            settings,
            {
                key: RUNNING_INDICATOR_RESERVE_SETTINGS.size,
                title: _('Reserve Size'),
                subtitle: _('Reserve in pixels'),
                lower: 1,
                upper: 20,
            },
            connectSettings
        );

        const syncSensitivity = () => {
            const enabled = reserveSwitch.active;
            symmetricalSwitch.sensitive = enabled;
            reserveSizeRow.sensitive = enabled;
        };
        reserveSwitch.connect('notify::active', syncSensitivity);
        syncSensitivity();
    }

    _reset() {
        for (const key of RUNNING_INDICATOR_RESERVE_SETTING_KEYS)
            this._settings.reset(key);
    }
}
);
