// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
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
    group.add(autoHideSwitch);
    const dodgeWindows = addWindowDodgeRows(
        group,
        settings,
        {
            enabledKey: 'dock-dodge-windows-enabled',
            modeKey: 'dock-dodge-windows-mode',
            pointerRevealKey: 'dock-dodge-pointer-reveal-enabled',
            autohideKey: 'dock-autohide-enabled',
            connectSettings,
        }
    );

    const edgeRevealSwitch = createSwitchRow(settings, {
        key: 'dock-edge-reveal-enabled',
        title: _('Limit Reveal to Dock Edge'),
        subtitle: _('Only reveal a floating Dock when the pointer reaches its edge'),
    });
    group.add(edgeRevealSwitch);

    const workspaceScrollSwitch = createSwitchRow(settings, {
        key: 'dock-workspace-scroll-enabled',
        title: _('Workspace Scroll'),
        subtitle: _('Scroll over empty Dock space to switch workspaces'),
    });
    group.add(workspaceScrollSwitch);

    const workspaceScrollDelayRow = addSpinRow(
        group,
        settings,
        {
            key: 'dock-workspace-scroll-delay',
            title: _('Workspace Scroll Delay'),
            subtitle: _('Minimum delay between workspace changes in milliseconds'),
            lower: 5,
            upper: 250,
            step: 5,
        },
        connectSettings
    );

    const multiMonitorSwitch = createSwitchRow(settings, {
        key: 'dock-multi-monitor-panels',
        title: _('Show Dock on All Monitors'),
        subtitle: _('Show the Dock on every connected monitor'),
    });
    group.add(multiMonitorSwitch);

    const syncWorkspaceScrollControls = () => {
        workspaceScrollDelayRow.sensitive = group.sensitive &&
            workspaceScrollSwitch.active;
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
    workspaceScrollSwitch.connect(
        'notify::active',
        syncWorkspaceScrollControls
    );
    for (const key of [
        'dock-mode',
        'dock-panel-mode',
        'windows-xp-theme-enabled',
    ]) {
        connectSettings(settings, `changed::${key}`, syncAvailability);
    }
    connectSettings(
        settings,
        'changed::dock-workspace-scroll-enabled',
        syncWorkspaceScrollControls
    );
    syncAvailability();
}
