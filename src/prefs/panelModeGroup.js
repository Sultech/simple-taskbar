// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DEFAULT_PANEL_ITEM_ORDER} from '../shared/panelItemOrder.js';
import {applyDefaultTaskbarSettings} from '../shared/taskbarDefaults.js';
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
                'Horizontal space around panel buttons. Use -1 for automatic: Just Perfection’s value when it is configured, otherwise 3 px'
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
    indicatorStyleRow,
    customIndicatorColorsSwitch,
    matchIconColorSwitch,
    focusedIndicatorColorRow,
    unfocusedIndicatorColorRow,
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
        for (const row of [
            indicatorStyleRow,
            customIndicatorColorsSwitch,
            matchIconColorSwitch,
            focusedIndicatorColorRow,
            unfocusedIndicatorColorRow,
            nautilusPlacesSwitch,
        ])
            row.sensitive = !enabled;
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
        settings.set_boolean('default-gnome-panel', enabled);
        if (enabled) {
            settings.set_boolean('windows-xp-theme-enabled', false);
            settings.set_int('panel-height', 32);
            settings.set_int('panel-button-padding', 12);
            settings.set_string('panel-position', 'top');
            settings.set_boolean('activities-button-visible', true);
            settings.set_string('activities-button-position', 'left');
            settings.set_string('clock-position', 'center');
            settings.set_string('system-menu-position', 'right');
            settings.set_string('folder-menu-position', 'right');
            settings.set_string('tray-overflow-position', 'right');
            settings.set_strv(
                'panel-item-order',
                DEFAULT_PANEL_ITEM_ORDER
            );
            settings.set_boolean('multi-monitor-panels', true);
            settings.set_boolean('windows-start-menu-enabled', false);
            settings.set_boolean('gnome-start-button-visible', false);
            settings.set_boolean('show-desktop-button-visible', false);
            settings.set_boolean('panel-border-enabled', false);
            settings.set_boolean('panel-border-light-enabled', false);
        } else {
            applyDefaultTaskbarSettings(settings);
        }
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
