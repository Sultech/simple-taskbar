// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    PANEL_MODE_DEFAULT,
    PANEL_MODE_TASKBAR,
    setPanelMode,
} from '../shared/panelModeProfiles.js';
import {addSpinRow} from './preferencesWidgets.js';

export function addPanelModeGroup({page, settings, connectSettings}) {
    const panelModeGroup = new Adw.PreferencesGroup({
        title: _('General'),
    });
    page.add(panelModeGroup);

    const defaultGnomePanelSwitch = new Adw.SwitchRow({
        title: _('Default GNOME Panel'),
        subtitle: _('Hide taskbar applications and use the original Dash in Overview'),
        active: settings.get_boolean('default-gnome-panel'),
    });
    panelModeGroup.add(defaultGnomePanelSwitch);

    const windowsXpThemeSwitch = new Adw.SwitchRow({
        title: _('Windows XP Theme'),
        subtitle: _('Apply a Windows XP-inspired taskbar style'),
        active: settings.get_boolean(
            'windows-xp-theme-enabled'
        ),
    });
    panelModeGroup.add(windowsXpThemeSwitch);

    const panelButtonPaddingRow = addSpinRow(
        panelModeGroup,
        settings,
        {
            key: 'panel-button-padding',
            title: _('Panel Button Padding'),
            subtitle: _(
                'Space between panel buttons. Use -1 for automatic: Just Perfection’s value when it is configured, otherwise 3 px'
            ),
            lower: -1,
            upper: 20,
        },
        connectSettings
    );

    return {
        defaultGnomePanelSwitch,
        windowsXpThemeSwitch,
        panelButtonPaddingRow,
    };
}

export function connectDefaultGnomePanelSync({
    settings,
    createSettings,
    connectSettings,
    defaultGnomePanelSwitch,
    appearanceGroup,
    startMenuPage,
    advancedAppBehaviorGroup,
    advancedStartMenuGroup,
    nautilusPlacesSwitch,
}) {
    let syncingDefaultGnomePanel = false;
    const syncDefaultGnomePanel = () => {
        const enabled = settings.get_boolean(
            'default-gnome-panel'
        );
        syncingDefaultGnomePanel = true;
        defaultGnomePanelSwitch.active = enabled;
        appearanceGroup.sensitive = !enabled;
        startMenuPage.sensitive = !enabled;
        advancedAppBehaviorGroup.sensitive = !enabled;
        advancedStartMenuGroup.sensitive = !enabled;
        nautilusPlacesSwitch.sensitive = !enabled;
        appearanceGroup.description = enabled
            ? _('Application icons are unavailable in Default GNOME Panel mode.')
            : _('Change the size, spacing, and placement of taskbar icons.');
        advancedAppBehaviorGroup.description = enabled
            ? _('Application options are unavailable in Default GNOME Panel mode.')
            : _('Choose which applications appear and how they are grouped.');
        syncingDefaultGnomePanel = false;
    };

    const setDefaultGnomePanel = enabled => {
        const settings = createSettings();
        settings.delay();
        setPanelMode(
            settings,
            enabled ? PANEL_MODE_DEFAULT : PANEL_MODE_TASKBAR
        );
        settings.apply();
    };

    defaultGnomePanelSwitch.connect(
        'notify::active',
        () => {
            if (syncingDefaultGnomePanel)
                return;

            const enabled = defaultGnomePanelSwitch.active;
            if (enabled === settings.get_boolean(
                'default-gnome-panel'
            )) {
                return;
            }
            setDefaultGnomePanel(enabled);
            syncDefaultGnomePanel();
        }
    );
    connectSettings(
        settings,
        'changed::default-gnome-panel',
        syncDefaultGnomePanel
    );
    syncDefaultGnomePanel();
}
