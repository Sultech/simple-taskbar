// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DODGE_WINDOW_MODE} from '../shared/windowDodgeModes.js';
import {windowDodgeModeChoices} from './windowDodgeModeChoices.js';
import {
    addComboRow,
    addSpinRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
} from './preferencesWidgets.js';

export function createDynamicTransparencyOptionsButton(settings, keys) {
    return createPreferencesDialogButton(
        settings,
        keys.title,
        DynamicTransparencyOptionsDialog,
        keys
    );
}

export const DynamicTransparencyOptionsDialog = GObject.registerClass(
class DynamicTransparencyOptionsDialog extends Adw.Window {
    _init({
        settings,
        parent,
        title,
        behaviorKey,
        distanceKey,
        levelKey,
        animationTimeKey,
    }) {
        super._init({
            title,
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 500,
        });

        this._settings = settings;
        this._keys = {
            behavior: behaviorKey,
            distance: distanceKey,
            level: levelKey,
            animationTime: animationTimeKey,
        };
        const {content, connectSettings} = createPreferencesDialogContent(
            this
        );

        const optionsGroup = new Adw.PreferencesGroup({
            title: _('Dynamic Transparency'),
            description: _(
                'Choose which windows restore the configured panel transparency'
            ),
        });
        content.append(optionsGroup);

        addComboRow(
            optionsGroup,
            settings,
            {
                key: this._keys.behavior,
                title: _('Windows That Restore Transparency'),
                subtitle: _(
                    'Select the window state that returns the configured panel transparency'
                ),
                choices: windowDodgeModeChoices(),
            },
            connectSettings
        );
        const distanceRow = addSpinRow(
            optionsGroup,
            settings,
            {
                key: this._keys.distance,
                title: _('Window Trigger Distance'),
                subtitle: _(
                    'Distance from the panel that restores its configured transparency'
                ),
                lower: 0,
                upper: 200,
            },
            connectSettings
        );
        addSpinRow(
            optionsGroup,
            settings,
            {
                key: this._keys.level,
                title: _('Transparency Without a Matching Window'),
                subtitle: _(
                    '0% is opaque and 100% is fully transparent'
                ),
                lower: 0,
                upper: 100,
            },
            connectSettings
        );
        addSpinRow(
            optionsGroup,
            settings,
            {
                key: this._keys.animationTime,
                title: _('Transparency Animation Duration'),
                subtitle: _('Transition time in milliseconds'),
                lower: 0,
                upper: 2000,
                step: 10,
            },
            connectSettings
        );

        const syncDistanceSensitivity = () => {
            distanceRow.sensitive = settings.get_string(
                this._keys.behavior
            ) !== DODGE_WINDOW_MODE.MAXIMIZED_WINDOWS;
        };
        connectSettings(
            settings,
            `changed::${this._keys.behavior}`,
            syncDistanceSensitivity
        );
        syncDistanceSensitivity();
    }

    _reset() {
        for (const key of Object.values(this._keys))
            this._settings.reset(key);
    }
}
);
