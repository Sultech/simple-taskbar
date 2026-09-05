// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addComboRow,
    addSpinRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';

const APPLICATION_GROUPING_SETTINGS = [
    'hide-app-labels',
    'group-apps-label-font-size',
    'group-apps-label-font-weight',
    'group-apps-label-max-width',
    'group-apps-use-fixed-width',
];

export function createApplicationGroupingOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Application Label Options'),
        ApplicationGroupingOptionsDialog
    );
}

export const ApplicationGroupingOptionsDialog = GObject.registerClass(
class ApplicationGroupingOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Application Label Options'),
            transient_for: parent,
            modal: true,
            default_width: 560,
            default_height: 520,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);

        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Application Labels'),
            description: _('Customize labels on uncombined applications'),
        });
        content.append(behaviorGroup);

        const hideAppLabelsSwitch = createSwitchRow(settings, {
            key: 'hide-app-labels',
            title: _('Hide App Labels'),
            subtitle: _('Hide window titles beside application icons'),
        });
        behaviorGroup.add(hideAppLabelsSwitch);
        const labelFontSizeRow = addSpinRow(
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

        const widthGroup = new Adw.PreferencesGroup({
            title: _('Application Label Width'),
            description: _('Control the width of application title labels'),
        });
        content.append(widthGroup);

        const labelMaxWidthRow = addSpinRow(
            widthGroup,
            settings,
            {
                key: 'group-apps-label-max-width',
                title: _('Maximum Label Width'),
                subtitle: _('Maximum application title width in pixels'),
                lower: 0,
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
            const sensitive = !settings.get_boolean('hide-app-labels');
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

    _reset() {
        for (const key of APPLICATION_GROUPING_SETTINGS)
            this._settings.reset(key);
    }
}
);
