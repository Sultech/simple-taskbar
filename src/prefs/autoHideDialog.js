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

export function createRevealOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Reveal Options'),
        RevealOptionsDialog
    );
}

export const RevealOptionsDialog = GObject.registerClass(
class RevealOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Reveal Options'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 400,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);

        const revealGroup = new Adw.PreferencesGroup({
            title: _('Reveal'),
            description: _('Choose how quickly the pointer brings the panel back'),
        });
        content.append(revealGroup);

        addComboRow(
            revealGroup,
            settings,
            {
                key: AUTO_HIDE_SETTINGS.revealMode,
                title: _('Reveal Mode'),
                subtitle: _('Choose when the panel appears at the screen edge'),
                choices: [
                    {
                        value: AUTO_HIDE_REVEAL_MODE.INSTANT,
                        label: _('Instant'),
                    },
                    {
                        value: AUTO_HIDE_REVEAL_MODE.DELAY,
                        label: _('After a Delay'),
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

        const syncSensitivity = () => {
            delayRow.sensitive = settings.get_string(
                AUTO_HIDE_SETTINGS.revealMode
            ) === AUTO_HIDE_REVEAL_MODE.DELAY;
        };
        connectSettings(
            settings,
            `changed::${AUTO_HIDE_SETTINGS.revealMode}`,
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
