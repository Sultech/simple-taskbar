// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    PROGRESS_BAR_SETTINGS,
    PROGRESS_BAR_SETTING_KEYS,
} from '../shared/progressBarSettings.js';
import {
    addColorRow,
    createPreferencesDialogButton,
    PreferencesOptionsDialog,
    createSwitchRow,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

export function createProgressBarOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Progress Bar Options'),
        ProgressBarOptionsDialog
    );
}

export const ProgressBarOptionsDialog = GObject.registerClass(
class ProgressBarOptionsDialog extends PreferencesOptionsDialog {
    _init({settings, parent}) {
        super._init({
            settings,
            parent,
            title: _('Progress Bar Options'),
            width: 640,
            height: 500,
        });

        const {addGroup, connectSettings} = this._dialogContent;

        const colorGroup = addGroup({
            title: _('Color'),
            description: _('Choose the color of the progress bar fill'),
        });

        const followSwitch = createSwitchRow(settings, {
            key: PROGRESS_BAR_SETTINGS.followIndicatorColors,
            title: _('Follow Running Indicator Colors'),
            subtitle: _('Use the running indicator color settings'),
        });
        colorGroup.add(followSwitch);
        const colorRow = addColorRow(
            colorGroup,
            settings,
            {
                key: PROGRESS_BAR_SETTINGS.color,
                title: _('Custom Progress Bar Color'),
            },
            connectSettings
        );

        const thicknessGroup = addGroup({
            title: _('Thickness'),
            description: _('Choose how thick the progress bar fill is'),
        });

        const automaticSwitch = createSwitchRow(settings, {
            key: PROGRESS_BAR_SETTINGS.automaticThickness,
            title: _('Automatic Thickness'),
            subtitle: _('Scale the thickness with the application icon size'),
        });
        thicknessGroup.add(automaticSwitch);
        const thicknessRow = addSliderRow(
            thicknessGroup,
            settings,
            {
                key: PROGRESS_BAR_SETTINGS.thickness,
                title: _('Custom Thickness'),
                subtitle: _('Fill thickness in pixels'),
                lower: 1,
                upper: 8,
            },
            connectSettings
        );

        const syncSensitivity = () => {
            colorRow.sensitive = !settings.get_boolean(
                PROGRESS_BAR_SETTINGS.followIndicatorColors
            );
            thicknessRow.sensitive = !settings.get_boolean(
                PROGRESS_BAR_SETTINGS.automaticThickness
            );
        };
        connectSettings(
            settings,
            `changed::${PROGRESS_BAR_SETTINGS.followIndicatorColors}`,
            syncSensitivity
        );
        connectSettings(
            settings,
            `changed::${PROGRESS_BAR_SETTINGS.automaticThickness}`,
            syncSensitivity
        );
        syncSensitivity();
    }

    _resetKeys() {
        return PROGRESS_BAR_SETTING_KEYS;
    }
}
);
