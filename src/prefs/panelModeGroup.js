// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    PANEL_MODE_DEFAULT,
    PANEL_MODE_TASKBAR,
    setPanelMode,
    setPanelPosition,
} from '../shared/panelModeProfiles.js';
import {alternativePanelPosition} from '../shared/panelPositionUtils.js';
import {
    createOverviewBehaviorButton,
    DOCK_OVERVIEW_BEHAVIOR_KEYS,
} from './overviewBehaviorDialog.js';
import {addComboRow, addSpinRow} from './preferencesWidgets.js';

const DOCK_DEFAULT_ICON_SIZE = 48;
const DOCK_DEFAULT_ICON_SPACING = 5;
const DOCK_DEFAULT_START_BUTTON_PADDING = 2;

function addModeRow(settings, {
    title,
    subtitle,
    tooltip,
    active,
    keys,
    addRow,
}) {
    const row = new Adw.ActionRow({title, subtitle});
    const optionsButton = createOverviewBehaviorButton(
        settings,
        tooltip,
        keys
    );
    row.add_suffix(optionsButton);
    const toggle = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active,
    });
    row.add_suffix(toggle);
    row.activatable_widget = toggle;
    addRow(row);
    return {row, toggle, optionsButton};
}

export function addPanelModeGroup({
    page,
    dockPage,
    settings,
    createSettings,
    connectSettings,
}) {
    const panelModeGroup = new Adw.PreferencesGroup({
        title: _('General'),
    });
    page.add(panelModeGroup);

    const {
        row: taskbarModeRow,
        toggle: taskbarModeSwitch,
        optionsButton: taskbarOverviewButton,
    } = addModeRow(settings, {
        title: _('Taskbar Mode'),
        subtitle: _('Show applications in the taskbar'),
        tooltip: _('Taskbar Mode Overview Behavior'),
        active: !settings.get_boolean('default-gnome-panel') &&
            !settings.get_boolean('dock-mode') &&
            !settings.get_boolean('windows-xp-theme-enabled'),
        addRow: row => panelModeGroup.add(row),
    });

    const alternativeModesRow = new Adw.ExpanderRow({
        title: _('Alternative Modes'),
        subtitle: _('Choose the original GNOME panel or the Windows XP theme'),
    });
    panelModeGroup.add(alternativeModesRow);

    const dockModeGroup = new Adw.PreferencesGroup({
        title: _('General'),
    });
    dockPage.add(dockModeGroup);

    const {
        row: defaultGnomePanelRow,
        toggle: defaultGnomePanelSwitch,
        optionsButton: defaultGnomePanelOverviewButton,
    } = addModeRow(settings, {
        title: _('Default GNOME Panel'),
        subtitle: _('Hide taskbar applications and use the original Dash in Overview'),
        tooltip: _('Default GNOME Panel Overview Behavior'),
        active: settings.get_boolean('default-gnome-panel'),
        addRow: row => alternativeModesRow.add_row(row),
    });

    const {
        row: dockModeRow,
        toggle: dockModeSwitch,
        optionsButton: dockOverviewButton,
    } = addModeRow(settings, {
        title: _('Dock Mode'),
        subtitle: _('Show applications in a separate Dock instead of the taskbar'),
        tooltip: _('Dock Mode Overview Behavior'),
        active: settings.get_boolean('dock-mode'),
        keys: DOCK_OVERVIEW_BEHAVIOR_KEYS,
        addRow: row => dockModeGroup.add(row),
    });

    const dockPositionChoices = [
        {value: 'top', label: _('Top')},
        {value: 'bottom', label: _('Bottom')},
        {value: 'left', label: _('Left')},
        {value: 'right', label: _('Right')},
    ];
    const syncPanelPositionConflict = () => {
        if (!settings.get_boolean('dock-mode'))
            return;

        const panelPosition = settings.get_string('panel-position');
        if (settings.get_string('dock-position') !== panelPosition)
            return;

        settings.set_string(
            'dock-position',
            alternativePanelPosition(panelPosition)
        );
    };
    const syncDockPositionConflict = () => {
        if (!settings.get_boolean('dock-mode'))
            return;

        const dockPosition = settings.get_string('dock-position');
        if (settings.get_string('panel-position') !== dockPosition)
            return;

        const panelSettings = createSettings();
        panelSettings.delay();
        setPanelPosition(
            panelSettings,
            alternativePanelPosition(dockPosition)
        );
        panelSettings.apply();
    };
    syncPanelPositionConflict();
    const dockPositionRow = addComboRow(
        dockModeGroup,
        settings,
        {
            key: 'dock-position',
            title: _('Dock Position'),
            subtitle: _('Place the Dock at a different screen edge from the taskbar'),
            choices: dockPositionChoices,
            setValue: position => settings.set_string('dock-position', position),
        },
        connectSettings
    );
    const dockMaxLengthRow = addSpinRow(
        dockModeGroup,
        settings,
        {
            key: 'dock-max-length',
            title: _('Maximum Dock Length'),
            subtitle: _('Limit the Dock to this percentage of the monitor length'),
            lower: 1,
            upper: 90,
        },
        connectSettings
    );
    const dockPanelModeSwitch = new Adw.SwitchRow({
        title: _('Full-width Dock'),
        subtitle: _('Extend the Dock fully to the monitor edge'),
        active: settings.get_boolean('dock-panel-mode'),
    });
    dockModeGroup.add(dockPanelModeSwitch);
    connectSettings(
        settings,
        'changed::panel-position',
        syncPanelPositionConflict
    );
    connectSettings(
        settings,
        'changed::dock-mode',
        syncPanelPositionConflict
    );
    connectSettings(
        settings,
        'changed::dock-position',
        syncDockPositionConflict
    );

    const {
        row: windowsXpThemeRow,
        toggle: windowsXpThemeSwitch,
        optionsButton: windowsXpOverviewButton,
    } = addModeRow(settings, {
        title: _('Windows XP Theme'),
        subtitle: _('Apply a Windows XP-inspired taskbar style'),
        tooltip: _('Windows XP Theme Overview Behavior'),
        active: settings.get_boolean('windows-xp-theme-enabled'),
        addRow: row => alternativeModesRow.add_row(row),
    });

    return {
        taskbarModeRow,
        taskbarModeSwitch,
        taskbarOverviewButton,
        defaultGnomePanelRow,
        defaultGnomePanelSwitch,
        defaultGnomePanelOverviewButton,
        windowsXpThemeRow,
        windowsXpOverviewButton,
        dockModeRow,
        dockModeSwitch,
        dockOverviewButton,
        dockModeGroup,
        dockPositionRow,
        dockMaxLengthRow,
        dockPanelModeSwitch,
        windowsXpThemeSwitch,
    };
}

export function connectDefaultGnomePanelSync({
    settings,
    createSettings,
    connectSettings,
    taskbarModeRow,
    taskbarModeSwitch,
    taskbarOverviewButton,
    defaultGnomePanelRow,
    defaultGnomePanelSwitch,
    defaultGnomePanelOverviewButton,
    windowsXpOverviewButton,
    dockModeSwitch,
    dockOverviewButton,
    dockPositionRow,
    dockMaxLengthRow,
    dockPanelModeSwitch,
    appearanceGroup,
    startMenuPage,
}) {
    let syncingPanelModes = false;
    const syncDefaultGnomePanel = () => {
        const enabled = settings.get_boolean(
            'default-gnome-panel'
        );
        const dockModeEnabled = settings.get_boolean('dock-mode');
        const windowsXpModeEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const defaultPanelRestrictions = enabled && !dockModeEnabled;
        syncingPanelModes = true;
        const taskbarModeEnabled = !enabled && !dockModeEnabled &&
            !windowsXpModeEnabled;
        taskbarModeSwitch.active = taskbarModeEnabled;
        defaultGnomePanelSwitch.active = enabled;
        taskbarModeRow.sensitive = true;
        taskbarOverviewButton.sensitive = taskbarModeEnabled;
        defaultGnomePanelRow.sensitive = !dockModeEnabled;
        defaultGnomePanelOverviewButton.sensitive = enabled &&
            !dockModeEnabled;
        windowsXpOverviewButton.sensitive = windowsXpModeEnabled;
        appearanceGroup.visible = !dockModeEnabled &&
            !defaultPanelRestrictions;
        appearanceGroup.sensitive = !dockModeEnabled &&
            !defaultPanelRestrictions;
        startMenuPage.sensitive = !defaultPanelRestrictions;
        appearanceGroup.description = defaultPanelRestrictions
            ? _('Application icons are unavailable in Default GNOME Panel mode.')
            : _('Change the size, spacing, and placement of taskbar icons.');
        syncingPanelModes = false;
    };

    const setTaskbarMode = enabled => {
        const settings = createSettings();
        settings.delay();
        setPanelMode(
            settings,
            enabled ? PANEL_MODE_TASKBAR : PANEL_MODE_DEFAULT
        );
        settings.apply();
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
            if (syncingPanelModes)
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
    taskbarModeSwitch.connect(
        'notify::active',
        () => {
            if (syncingPanelModes)
                return;

            const enabled = taskbarModeSwitch.active;
            const taskbarModeEnabled =
                !settings.get_boolean('default-gnome-panel') &&
                !settings.get_boolean('dock-mode') &&
                !settings.get_boolean('windows-xp-theme-enabled');
            if (enabled === taskbarModeEnabled)
                return;

            setTaskbarMode(enabled);
            syncDefaultGnomePanel();
            syncDockMode();
        }
    );
    let syncingDockMode = false;
    const syncDockMode = () => {
        syncingDockMode = true;
        const dockModeEnabled = settings.get_boolean('dock-mode');
        const dockPanelModeEnabled = settings.get_boolean('dock-panel-mode');
        dockModeSwitch.active = settings.get_boolean('dock-mode');
        dockPanelModeSwitch.active = dockPanelModeEnabled;
        dockOverviewButton.sensitive = dockModeEnabled &&
            !settings.get_boolean('windows-xp-theme-enabled');
        dockPositionRow.sensitive = dockModeEnabled &&
            !settings.get_boolean('windows-xp-theme-enabled');
        dockPanelModeSwitch.sensitive = dockModeEnabled &&
            !settings.get_boolean('windows-xp-theme-enabled');
        dockMaxLengthRow.sensitive = dockModeEnabled &&
            !dockPanelModeEnabled &&
            !settings.get_boolean('windows-xp-theme-enabled');
        syncingDockMode = false;
    };
    const setDockMode = enabled => {
        const settings = createSettings();
        settings.delay();
        if (enabled) {
            setPanelMode(settings, PANEL_MODE_DEFAULT);
            if (!settings.get_boolean('dock-mode-initialized')) {
                settings.set_int('icon-size', DOCK_DEFAULT_ICON_SIZE);
                settings.set_int(
                    'icon-spacing',
                    DOCK_DEFAULT_ICON_SPACING
                );
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
        } else {
            settings.set_boolean('dock-mode', false);
            setPanelMode(settings, PANEL_MODE_TASKBAR);
        }
        settings.apply();
    };

    dockModeSwitch.connect(
        'notify::active',
        () => {
            if (syncingDockMode)
                return;

            const enabled = dockModeSwitch.active;
            if (enabled === settings.get_boolean('dock-mode'))
                return;
            setDockMode(enabled);
            syncDefaultGnomePanel();
            syncDockMode();
        }
    );
    dockPanelModeSwitch.connect(
        'notify::active',
        () => {
            if (syncingDockMode)
                return;

            settings.set_boolean(
                'dock-panel-mode',
                dockPanelModeSwitch.active
            );
            syncDockMode();
        }
    );
    connectSettings(
        settings,
        'changed::default-gnome-panel',
        syncDefaultGnomePanel
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncDefaultGnomePanel
    );
    connectSettings(settings, 'changed::dock-mode', () => {
        syncDefaultGnomePanel();
        syncDockMode();
    });
    connectSettings(
        settings,
        'changed::dock-panel-mode',
        syncDockMode
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncDockMode
    );
    syncDefaultGnomePanel();
    syncDockMode();
}
