// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addComboRow,
    createPreferencesDialogButton,
    PreferencesOptionsDialog,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

export function createFocusedAppOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Focused Application Options'),
        FocusedAppOptionsDialog
    );
}

const FocusedAppOptionsDialog = GObject.registerClass(
class FocusedAppOptionsDialog extends PreferencesOptionsDialog {
    _init({settings, parent}) {
        super._init({
            settings,
            parent,
            title: _('Focused Application Options'),
            width: 560,
            height: 360,
        });

        const {addGroup, connectSettings} = this._dialogContent;
        const labelGroup = addGroup({
            title: _('Label'),
            description: _('Choose what the focused application shows in the panel'),
        });
        addComboRow(
            labelGroup,
            settings,
            {
                key: 'focused-app-label',
                title: _('Label Text'),
                choices: [
                    {value: 'app-name', label: _('Application Name')},
                    {value: 'window-title', label: _('Window Title')},
                    {value: 'app-name-and-title', label: _('Application Name and Window Title')},
                ],
            },
            connectSettings
        );
        addSliderRow(
            labelGroup,
            settings,
            {
                key: 'focused-app-max-width',
                title: _('Maximum Width'),
                subtitle: _('Longer labels are shortened with an ellipsis'),
                lower: 80,
                upper: 800,
                step: 10,
            },
            connectSettings
        );
    }

    _resetKeys() {
        return ['focused-app-label', 'focused-app-max-width'];
    }
}
);
