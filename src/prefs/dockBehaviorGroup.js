// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {PANEL_SCROLL_ACTION} from '../shared/panelScrollActions.js';
import {
    addComboRow,
    addSpinRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {addWindowDodgeRows} from './windowDodgeGroup.js';

export function addDockBehaviorGroup({page, settings, connectSettings}) {
    const group = new Adw.PreferencesGroup({
        title: _('Dock Behavior'),
        description: _('Configure Dock interaction independently of the main panel.'),
    });
    page.add(group);

    const autoHideSwitch = createSwitchRow(settings, {
        key: 'dock-autohide-enabled',
        title: _('Auto-hide Dock'),
        subtitle: _('Reveal the Dock when the pointer reaches its screen edge'),
    });
    const edgeRevealSwitch = createSwitchRow(settings, {
        key: 'dock-edge-reveal-enabled',
        title: _('Limit Reveal to Dock Edge'),
        subtitle: _('Only reveal a floating Dock when the pointer reaches its edge'),
    });
    const dodgeWindows = addWindowDodgeRows(
        group,
        settings,
        {
            enabledKey: 'dock-dodge-windows-enabled',
            modeKey: 'dock-dodge-windows-mode',
            pointerRevealKey: 'dock-dodge-pointer-reveal-enabled',
            autohideKey: 'dock-autohide-enabled',
            autohideSwitch: autoHideSwitch,
            visibilitySubtitle: _(
                'Choose when the Dock hides and how it is revealed'
            ),
            visibilityRows: [edgeRevealSwitch],
            connectSettings,
        }
    );

    const workspaceScrollRow = new Adw.ExpanderRow({
        title: _('Dock Scroll'),
        subtitle: _('Choose what happens when scrolling over the Dock'),
    });
    const workspaceScrollActionRow = addComboRow(
        workspaceScrollRow,
        settings,
        {
            key: 'dock-workspace-scroll-action',
            title: _('Scroll Action'),
            subtitle: _('Action used when scrolling over empty Dock space'),
            choices: [
                {
                    value: PANEL_SCROLL_ACTION.SWITCH_WORKSPACE,
                    label: _('Switch Workspace'),
                },
                {
                    value: PANEL_SCROLL_ACTION.CYCLE_WINDOWS,
                    label: _('Cycle Windows'),
                },
                {
                    value: PANEL_SCROLL_ACTION.CHANGE_VOLUME,
                    label: _('Change Volume'),
                },
                {
                    value: PANEL_SCROLL_ACTION.DO_NOTHING,
                    label: _('Do Nothing'),
                },
            ],
            addRow: row => workspaceScrollRow.add_row(row),
        },
        connectSettings
    );

    const workspaceScrollDelayRow = addSpinRow(
        workspaceScrollRow,
        settings,
        {
            key: 'dock-workspace-scroll-delay',
            title: _('Scroll Delay'),
            subtitle: _('Minimum delay between Dock scroll actions in milliseconds'),
            lower: 5,
            upper: 250,
            step: 5,
            addRow: row => workspaceScrollRow.add_row(row),
        },
        connectSettings
    );
    group.add(workspaceScrollRow);

    const multiMonitorSwitch = createSwitchRow(settings, {
        key: 'dock-multi-monitor-panels',
        title: _('Show Dock on All Monitors'),
        subtitle: _('Show the Dock on every connected monitor'),
    });
    group.add(multiMonitorSwitch);

    const syncWorkspaceScrollControls = () => {
        const dockPanelModeEnabled = settings.get_boolean('dock-panel-mode');
        workspaceScrollActionRow.sensitive = group.sensitive &&
            dockPanelModeEnabled;
        workspaceScrollDelayRow.sensitive = group.sensitive &&
            (!dockPanelModeEnabled ||
                settings.get_string('dock-workspace-scroll-action') !==
                PANEL_SCROLL_ACTION.DO_NOTHING);
    };
    const syncAvailability = () => {
        const available = settings.get_boolean('dock-mode') &&
            !settings.get_boolean('windows-xp-theme-enabled');
        group.sensitive = available;
        edgeRevealSwitch.sensitive = available &&
            !settings.get_boolean('dock-panel-mode');
        dodgeWindows.syncAvailability();
        syncWorkspaceScrollControls();
    };
    for (const key of [
        'dock-mode',
        'dock-panel-mode',
        'windows-xp-theme-enabled',
    ]) {
        connectSettings(settings, `changed::${key}`, syncAvailability);
    }
    connectSettings(
        settings,
        'changed::dock-workspace-scroll-action',
        syncWorkspaceScrollControls
    );
    syncAvailability();
}
