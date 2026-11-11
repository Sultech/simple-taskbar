// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addComboRow,
    createPreferencesDialogButton,
    PreferencesOptionsDialog,
    createSwitchRow,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

const APPLICATION_GROUPING_SETTINGS = [
    'hide-app-labels',
    'group-apps-label-font-size',
    'group-apps-label-font-weight',
    'group-apps-label-max-width',
    'group-apps-use-fixed-width',
];

export function createApplicationGroupingOptionsButton(settings, forceLabels = false) {
    return createPreferencesDialogButton(
        settings,
        _('Application Label Options'),
        ApplicationGroupingOptionsDialog,
        {forceLabels}
    );
}

export const ApplicationGroupingOptionsDialog = GObject.registerClass(
class ApplicationGroupingOptionsDialog extends PreferencesOptionsDialog {
    _init({settings, parent, forceLabels = false}) {
        super._init({
            settings,
            parent,
            title: _('Application Label Options'),
            width: 560,
            height: 520,
        });

        this._forceLabels = forceLabels;
        const {addGroup, connectSettings} = this._dialogContent;

        const behaviorGroup = addGroup({
            title: _('Application Labels'),
            description: _('Customize labels on uncombined applications'),
        });

        if (!forceLabels) {
            behaviorGroup.add(createSwitchRow(settings, {
                key: 'hide-app-labels',
                title: _('Hide App Labels'),
                subtitle: _('Hide window titles beside application icons'),
            }));
        }
        const labelFontSizeRow = addSliderRow(
            behaviorGroup,
            settings,
            {
                key: 'group-apps-label-font-size',
                title: _('Label Font Size'),
                subtitle: _('Application title font size in pixels'),
                lower: 6,
                upper: 24,
            },
            connectSettings
        );
        const labelFontWeightRow = addComboRow(
            behaviorGroup,
            settings,
            {
                key: 'group-apps-label-font-weight',
                title: _('Label Font Weight'),
                subtitle: _('Choose the application title font weight'),
                choices: [
                    {value: 'inherit', label: _('Inherit from Theme')},
                    {value: 'normal', label: _('Normal')},
                    {value: 'lighter', label: _('Lighter')},
                    {value: 'bold', label: _('Bold')},
                    {value: 'bolder', label: _('Bolder')},
                ],
            },
            connectSettings
        );

        const widthGroup = addGroup({
            title: _('Application Label Width'),
            description: _('Control the width of application title labels'),
        });

        const labelMaxWidthRow = addSliderRow(
            widthGroup,
            settings,
            {
                key: 'group-apps-label-max-width',
                title: _('Maximum Label Width'),
                subtitle: _('Maximum application title width in pixels'),
                lower: 30,
                upper: 1000,
                step: 10,
            },
            connectSettings
        );
        const fixedLabelWidthSwitch = createSwitchRow(settings, {
            key: 'group-apps-use-fixed-width',
            title: _('Use Fixed Label Width'),
            subtitle: _(
                'Use the maximum label width for every application'
            ),
        });
        widthGroup.add(fixedLabelWidthSwitch);

        const labelOptionRows = [
            labelFontSizeRow,
            labelFontWeightRow,
            labelMaxWidthRow,
            fixedLabelWidthSwitch,
        ];
        const syncLabelOptionSensitivity = () => {
            const sensitive = forceLabels || !settings.get_boolean('hide-app-labels');
            for (const row of labelOptionRows)
                row.sensitive = sensitive;
        };
        connectSettings(
            settings,
            'changed::hide-app-labels',
            syncLabelOptionSensitivity
        );
        syncLabelOptionSensitivity();

    }

    _resetKeys() {
        return APPLICATION_GROUPING_SETTINGS.filter(key =>
            !this._forceLabels || key !== 'hide-app-labels');
    }
}
);
