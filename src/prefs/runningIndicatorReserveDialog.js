// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    RUNNING_INDICATOR_RESERVE_SETTING_KEYS,
    RUNNING_INDICATOR_RESERVE_SETTINGS,
} from '../shared/runningIndicatorSettings.js';
import {
    createPreferencesDialogButton,
    PreferencesOptionsDialog,
    createSwitchRow,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

export function createRunningIndicatorReserveOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Running Indicator Reserve'),
        RunningIndicatorReserveDialog
    );
}

export const RunningIndicatorReserveDialog = GObject.registerClass(
class RunningIndicatorReserveDialog extends PreferencesOptionsDialog {
    _init({settings, parent}) {
        super._init({
            settings,
            parent,
            title: _('Running Indicator Reserve'),
            width: 560,
            height: 360,
        });

        const {addGroup, connectSettings} = this._dialogContent;
        const reserveGroup = addGroup({
            title: _('Indicator Reserve'),
            description: _(
                'Add space beside indicators for Glass and Classic effects'
            ),
        });

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
        const reserveSizeRow = addSliderRow(
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

    _resetKeys() {
        return RUNNING_INDICATOR_RESERVE_SETTING_KEYS;
    }
}
);
