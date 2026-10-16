// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    PANEL_AXIS_PROFILE_ENABLED_KEYS,
    PANEL_MODE_DEFAULT,
    PANEL_MODE_DOCK,
    PANEL_MODE_TASKBAR,
    PANEL_MODE_WINDOWS_10,
    PANEL_MODE_WINDOWS_XP,
    initializeDockAxisProfiles,
    setPanelMode,
} from '../shared/panelModeProfiles.js';
import {
    addChoiceCards,
    drawDefaultPanelMode,
    drawDockMode,
    drawTaskbarMode,
    drawWindows10Mode,
    drawWindowsXpMode,
} from './choiceCards.js';
import {
    createOverviewBehaviorButton,
    DOCK_OVERVIEW_BEHAVIOR_KEYS,
} from './overviewBehaviorDialog.js';

const DOCK_DEFAULT_ICON_SIZE = 48;
const DOCK_DEFAULT_ICON_SPACING = 6;
const DOCK_DEFAULT_START_BUTTON_PADDING = 2;

function activeMode(settings) {
    if (settings.get_boolean('dock-mode'))
        return PANEL_MODE_DOCK;
    if (settings.get_boolean('windows-xp-theme-enabled'))
        return PANEL_MODE_WINDOWS_XP;
    if (settings.get_boolean('windows-10-theme-enabled'))
        return PANEL_MODE_WINDOWS_10;
    if (settings.get_boolean('default-gnome-panel'))
        return PANEL_MODE_DEFAULT;
    return PANEL_MODE_TASKBAR;
}

function enableDockMode(settings) {
    setPanelMode(settings, PANEL_MODE_DEFAULT);
    if (!settings.get_boolean('dock-mode-initialized')) {
        settings.set_int('icon-size', DOCK_DEFAULT_ICON_SIZE);
        settings.set_int('icon-spacing', DOCK_DEFAULT_ICON_SPACING);
        settings.set_int(
            'start-button-padding',
            DOCK_DEFAULT_START_BUTTON_PADDING
        );
        settings.set_string('dock-position', 'bottom');
        settings.set_boolean('windows-start-menu-enabled', false);
        settings.set_boolean('gnome-start-button-visible', true);
        settings.set_string('combine-app-buttons-mode', 'always');
        settings.set_boolean('use-pinned-apps-as-launchers', false);
        settings.set_boolean('show-pinned-app-separator', true);
        settings.set_boolean('dock-mode-initialized', true);
    }
    settings.set_boolean('dock-mode', true);
    initializeDockAxisProfiles(settings);
}

function applyMode(settings, mode) {
    if (mode === PANEL_MODE_DOCK) {
        enableDockMode(settings);
        return;
    }

    setPanelMode(settings, mode);
    settings.set_boolean('dock-mode', false);
}

export function addPanelModeGroup({
    page,
    settings,
    createSettings,
    connectSettings,
}) {
    const group = new Adw.PreferencesGroup({
        title: _('Mode'),
        description: _('Choose your desktop layout'),
    });
    page.add(group);

    const modes = [
        {
            mode: PANEL_MODE_TASKBAR,
            label: _('Taskbar'),
            draw: drawTaskbarMode,
            subtitle: _('Show applications in the taskbar'),
            tooltip: _('Taskbar Mode Options'),
            axisProfile: {
                key: PANEL_AXIS_PROFILE_ENABLED_KEYS[PANEL_MODE_TASKBAR],
                mode: PANEL_MODE_TASKBAR,
            },
        },
        {
            mode: PANEL_MODE_DOCK,
            label: _('Dock'),
            draw: drawDockMode,
            subtitle: _('Keep the GNOME panel and show applications in a separate Dock'),
            tooltip: _('Dock Mode Options'),
            keys: DOCK_OVERVIEW_BEHAVIOR_KEYS,
            axisProfile: {
                key: PANEL_AXIS_PROFILE_ENABLED_KEYS[PANEL_MODE_DOCK],
                mode: PANEL_MODE_DOCK,
            },
        },
        {
            mode: PANEL_MODE_DEFAULT,
            label: _('Default GNOME Panel'),
            draw: drawDefaultPanelMode,
            subtitle: _('Use the original GNOME panel with optional running window buttons'),
            tooltip: _('Default GNOME Panel Options'),
            axisProfile: {
                key: PANEL_AXIS_PROFILE_ENABLED_KEYS[PANEL_MODE_DEFAULT],
                mode: PANEL_MODE_DEFAULT,
            },
        },
        {
            mode: PANEL_MODE_WINDOWS_XP,
            label: _('Windows XP'),
            draw: drawWindowsXpMode,
            subtitle: _('Apply a Windows XP-inspired taskbar style'),
            tooltip: _('Windows XP Theme Overview Behavior'),
        },
        {
            mode: PANEL_MODE_WINDOWS_10,
            label: _('Windows 10'),
            draw: drawWindows10Mode,
            subtitle: _('Apply a Windows 10-inspired taskbar style'),
            tooltip: _('Windows 10 Theme Overview Behavior'),
        },
    ];

    const cards = addChoiceCards(group, {
        choices: modes.map(({mode, label, draw}) => ({value: mode, label, draw})),
        columns: 3,
        onSelected: mode => {
            if (activeMode(settings) === mode)
                return;

            const modeSettings = createSettings();
            modeSettings.delay();
            applyMode(modeSettings, mode);
            modeSettings.apply();
        },
        connectSettings,
    });

    const optionsGroup = new Adw.PreferencesGroup();
    page.add(optionsGroup);
    const optionRows = new Map();
    for (const {mode, label, subtitle, tooltip, keys, axisProfile} of modes) {
        const optionsButton = createOverviewBehaviorButton(
            settings,
            tooltip,
            keys,
            axisProfile
        );
        const row = new Adw.ActionRow({
            title: label,
            subtitle,
            activatable_widget: optionsButton,
        });
        row.add_suffix(optionsButton);
        optionsGroup.add(row);
        optionRows.set(mode, {row, title: label, subtitle});
    }

    const syncModes = () => {
        const current = activeMode(settings);
        cards.setActive(current);
        for (const [mode, {row}] of optionRows)
            row.visible = mode === current;
        const {row: defaultPanelRow, title, subtitle} = optionRows.get(PANEL_MODE_DEFAULT);
        const dockPanel = current === PANEL_MODE_DOCK;
        defaultPanelRow.visible ||= dockPanel;
        defaultPanelRow.title = dockPanel ? _('GNOME Panel') : title;
        defaultPanelRow.subtitle = dockPanel
            ? _('Overview and running window options for the GNOME panel used with the Dock')
            : subtitle;
    };
    for (const key of [
        'default-gnome-panel',
        'dock-mode',
        'windows-xp-theme-enabled',
        'windows-10-theme-enabled',
    ])
        connectSettings(settings, `changed::${key}`, syncModes);
    syncModes();
}
