// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';

const START_BUTTON_SETTINGS = [
    'start-button-follow-app-alignment',
    'windows-start-menu-enabled',
];

export function createStartButtonOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Start Button Options'),
        StartButtonOptionsDialog
    );
}

export const StartButtonOptionsDialog = GObject.registerClass(
class StartButtonOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Start Button'),
            transient_for: parent,
            modal: true,
            default_width: 560,
            default_height: 360,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);
        const alignmentGroup = new Adw.PreferencesGroup({
            title: _('Alignment and Menu'),
        });
        content.append(alignmentGroup);

        const followAppAlignmentSwitch = createSwitchRow(settings, {
            key: 'start-button-follow-app-alignment',
            title: _('Follow Application Alignment'),
            subtitle: _('Move the Start button with the application icons'),
        });
        alignmentGroup.add(followAppAlignmentSwitch);

        const windowsStartMenuSwitch = createSwitchRow(settings, {
            key: 'windows-start-menu-enabled',
            title: _('Eleven-style Start Menu'),
            subtitle: _('Replace the GNOME app grid with an Eleven-style menu'),
        });
        alignmentGroup.add(windowsStartMenuSwitch);

        const syncSensitivity = () => {
            const defaultPanel = settings.get_boolean('default-gnome-panel') &&
                !settings.get_boolean('dock-mode');
            const windowsXpTheme = settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            followAppAlignmentSwitch.sensitive =
                !defaultPanel && !windowsXpTheme;
            windowsStartMenuSwitch.sensitive = !windowsXpTheme;
        };
        for (const key of [
            'default-gnome-panel',
            'dock-mode',
            'windows-xp-theme-enabled',
        ])
            connectSettings(settings, `changed::${key}`, syncSensitivity);
        syncSensitivity();
    }

    _reset() {
        for (const key of START_BUTTON_SETTINGS)
            this._settings.reset(key);
    }
}
);
