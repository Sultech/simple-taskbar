// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addSpinRow} from './preferencesWidgets.js';

export function addDockBehaviorGroup({page, settings, connectSettings}) {
    const group = new Adw.PreferencesGroup({
        title: _('Dock Behavior'),
        description: _('Configure Dock interaction independently of the main panel.'),
    });
    page.add(group);

    const autoHideSwitch = new Adw.SwitchRow({
        title: _('Auto-hide Dock'),
        subtitle: _('Reveal the Dock when the pointer reaches its screen edge'),
        active: settings.get_boolean('dock-autohide-enabled'),
    });
    group.add(autoHideSwitch);
    settings.bind(
        'dock-autohide-enabled',
        autoHideSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const multiMonitorSwitch = new Adw.SwitchRow({
        title: _('Show Dock on All Monitors'),
        subtitle: _('Show the Dock on every connected monitor'),
        active: settings.get_boolean('dock-multi-monitor-panels'),
    });
    group.add(multiMonitorSwitch);
    settings.bind(
        'dock-multi-monitor-panels',
        multiMonitorSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const workspaceScrollSwitch = new Adw.SwitchRow({
        title: _('Workspace Scroll'),
        subtitle: _('Scroll over empty Dock space to switch workspaces'),
        active: settings.get_boolean('dock-workspace-scroll-enabled'),
    });
    group.add(workspaceScrollSwitch);
    settings.bind(
        'dock-workspace-scroll-enabled',
        workspaceScrollSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

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

    const syncWorkspaceScrollControls = () => {
        workspaceScrollDelayRow.sensitive = group.sensitive &&
            workspaceScrollSwitch.active;
    };
    const syncAvailability = () => {
        group.sensitive = settings.get_boolean('dock-mode') &&
            !settings.get_boolean('windows-xp-theme-enabled');
        syncWorkspaceScrollControls();
    };
    workspaceScrollSwitch.connect(
        'notify::active',
        syncWorkspaceScrollControls
    );
    for (const key of [
        'dock-mode',
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
