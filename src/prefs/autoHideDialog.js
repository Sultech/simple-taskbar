// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    AUTO_HIDE_REVEAL_MODE,
    AUTO_HIDE_SETTINGS,
    AUTO_HIDE_SETTING_KEYS,
} from '../shared/autoHideSettings.js';
import {
    addComboRow,
    addSpinRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
} from './preferencesWidgets.js';

export function createRevealOptionsButton(
    settings,
    pointerRevealKey,
    descriptions
) {
    return createPreferencesDialogButton(
        settings,
        _('Timing Options'),
        RevealOptionsDialog,
        {pointerRevealKey, descriptions}
    );
}

export const RevealOptionsDialog = GObject.registerClass(
class RevealOptionsDialog extends Adw.Window {
    _init({settings, parent, pointerRevealKey, descriptions}) {
        super._init({
            title: _('Timing Options'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 560,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);

        const revealGroup = new Adw.PreferencesGroup({
            title: _('Reveal'),
            description: descriptions.reveal,
        });
        content.append(revealGroup);

        const modeRow = addComboRow(
            revealGroup,
            settings,
            {
                key: AUTO_HIDE_SETTINGS.revealMode,
                title: _('Reveal Mode'),
                subtitle: descriptions.revealMode,
                choices: [
                    {
                        value: AUTO_HIDE_REVEAL_MODE.INSTANT,
                        label: _('Instant'),
                    },
                    {
                        value: AUTO_HIDE_REVEAL_MODE.DELAY,
                        label: _('After a Delay'),
                    },
                    {
                        value: AUTO_HIDE_REVEAL_MODE.PRESSURE,
                        label: _('After Pushing Against the Edge'),
                    },
                ],
            },
            connectSettings
        );
        const delayRow = addSpinRow(
            revealGroup,
            settings,
            {
                key: AUTO_HIDE_SETTINGS.revealDelay,
                title: _('Reveal Delay'),
                subtitle: _('How long the pointer rests on the edge, in milliseconds'),
                lower: 50,
                upper: 2000,
                step: 50,
            },
            connectSettings
        );

        const pressureRow = addSpinRow(
            revealGroup,
            settings,
            {
                key: AUTO_HIDE_SETTINGS.pressureThreshold,
                title: _('Activation Pressure'),
                subtitle: _('How far to push past the edge before revealing. Turns off the bottom hot edge.'),
                lower: 0,
                upper: 500,
                step: 10,
            },
            connectSettings
        );

        const hideGroup = new Adw.PreferencesGroup({
            title: _('Hide'),
            description: descriptions.hide,
        });
        content.append(hideGroup);

        addSpinRow(
            hideGroup,
            settings,
            {
                key: AUTO_HIDE_SETTINGS.hideDelay,
                title: _('Hide Delay'),
                subtitle: descriptions.hideDelay,
                lower: 0,
                upper: 2000,
                step: 50,
            },
            connectSettings
        );

        const disableHotEdgeWithPressure = () => {
            if (settings.get_string(AUTO_HIDE_SETTINGS.revealMode) ===
                AUTO_HIDE_REVEAL_MODE.PRESSURE) {
                settings.set_boolean('hot-edge-overview-enabled', false);
            }
        };
        connectSettings(
            settings,
            `changed::${AUTO_HIDE_SETTINGS.revealMode}`,
            disableHotEdgeWithPressure
        );
        disableHotEdgeWithPressure();

        const syncSensitivity = () => {
            const revealable = settings.get_boolean(pointerRevealKey);
            modeRow.sensitive = revealable;
            const mode = settings.get_string(AUTO_HIDE_SETTINGS.revealMode);
            delayRow.sensitive = revealable &&
                mode === AUTO_HIDE_REVEAL_MODE.DELAY;
            pressureRow.sensitive = revealable &&
                mode === AUTO_HIDE_REVEAL_MODE.PRESSURE;
        };
        connectSettings(
            settings,
            `changed::${AUTO_HIDE_SETTINGS.revealMode}`,
            syncSensitivity
        );
        connectSettings(
            settings,
            `changed::${pointerRevealKey}`,
            syncSensitivity
        );
        syncSensitivity();
    }

    _reset() {
        for (const key of AUTO_HIDE_SETTING_KEYS)
            this._settings.reset(key);
    }
}
);
