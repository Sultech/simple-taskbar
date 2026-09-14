// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    PROGRESS_BAR_SETTINGS,
    PROGRESS_BAR_SETTING_KEYS,
} from '../shared/progressBarSettings.js';
import {
    addColorRow,
    addSpinRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';

export function createProgressBarOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Progress Bar Options'),
        ProgressBarOptionsDialog
    );
}

export const ProgressBarOptionsDialog = GObject.registerClass(
class ProgressBarOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Progress Bar Options'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 500,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);

        const colorGroup = new Adw.PreferencesGroup({
            title: _('Color'),
            description: _('Choose the color of the progress bar fill'),
        });
        content.append(colorGroup);

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

        const thicknessGroup = new Adw.PreferencesGroup({
            title: _('Thickness'),
            description: _('Choose how thick the progress bar fill is'),
        });
        content.append(thicknessGroup);

        const automaticSwitch = createSwitchRow(settings, {
            key: PROGRESS_BAR_SETTINGS.automaticThickness,
            title: _('Automatic Thickness'),
            subtitle: _('Scale the thickness with the application icon size'),
        });
        thicknessGroup.add(automaticSwitch);
        const thicknessRow = addSpinRow(
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

    _reset() {
        for (const key of PROGRESS_BAR_SETTING_KEYS)
            this._settings.reset(key);
    }
}
);
