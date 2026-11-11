// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {isDefaultPanelWithoutDock} from '../shared/panelModeProfiles.js';
import {
    START_BUTTON_LOCATION_KEY,
    startButtonAlignmentKey,
    startButtonInPanel,
} from '../shared/panelModeSettings.js';
import {
    createPreferencesDialogButton,
    PreferencesOptionsDialog,
    createSwitchRow,
} from './preferencesWidgets.js';

export function createStartButtonOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Start Button Options'),
        StartButtonOptionsDialog
    );
}

export const StartButtonOptionsDialog = GObject.registerClass(
class StartButtonOptionsDialog extends PreferencesOptionsDialog {
    _init({settings, parent}) {
        super._init({
            settings,
            parent,
            title: _('Start Button'),
            width: 560,
            height: 360,
        });

        this._followAppAlignmentKey =
            startButtonAlignmentKey(settings, 'start-button-follow-app-alignment');
        const {addGroup, connectSettings} = this._dialogContent;
        const alignmentGroup = addGroup({
            title: _('Alignment and Menu'),
        });

        const followAppAlignmentSwitch = createSwitchRow(settings, {
            key: this._followAppAlignmentKey,
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
            const defaultPanel = isDefaultPanelWithoutDock(settings);
            const windowsXpTheme = settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            followAppAlignmentSwitch.sensitive =
                (startButtonInPanel(settings) || !defaultPanel) && !windowsXpTheme;
            windowsStartMenuSwitch.sensitive = !windowsXpTheme;
        };
        for (const key of [
            'default-gnome-panel',
            'dock-mode',
            'windows-xp-theme-enabled',
            START_BUTTON_LOCATION_KEY,
        ])
            connectSettings(settings, `changed::${key}`, syncSensitivity);
        syncSensitivity();
    }

    _resetKeys() {
        return [this._followAppAlignmentKey, 'windows-start-menu-enabled'];
    }
}
);
