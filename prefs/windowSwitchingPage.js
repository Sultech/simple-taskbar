// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addSpinRow} from './preferencesWidgets.js';

export function addWindowSwitchingPage(window, settings, connectSettings) {
    const page = new Adw.PreferencesPage({
        title: _('Window Switching'),
        icon_name: 'focus-windows-symbolic',
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: _('Grid Alt-Tab'),
        description: _(
            'Switch directly between open windows using live previews.'
        ),
    });
    page.add(group);

    const enabledSwitch = new Adw.SwitchRow({
        title: _('Enable Grid Alt-Tab'),
        subtitle: _(
            'Replace GNOME’s application switcher with a responsive window grid'
        ),
        active: settings.get_boolean('grid-alt-tab-enabled'),
    });
    group.add(enabledSwitch);
    settings.bind(
        'grid-alt-tab-enabled',
        enabledSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const cardSizeRow = addSpinRow(group, settings, {
        key: 'grid-alt-tab-max-card-size',
        title: _('Maximum Card Size'),
        subtitle: _(
            'Largest preview height in pixels; widths follow each window’s shape'
        ),
        lower: 120,
        upper: 500,
        step: 10,
    }, connectSettings);
    const workspaceSwitch = new Adw.SwitchRow({
        title: _('Isolate Workspaces'),
        subtitle: _(
            'Show windows from the current workspace instead of all workspaces'
        ),
        active: settings.get_boolean('grid-alt-tab-isolate-workspaces'),
    });
    group.add(workspaceSwitch);
    settings.bind(
        'grid-alt-tab-isolate-workspaces',
        workspaceSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const monitorSwitch = new Adw.SwitchRow({
        title: _('Isolate Monitors'),
        subtitle: _(
            'Show only windows from the monitor displaying the switcher'
        ),
        active: settings.get_boolean('grid-alt-tab-isolate-monitors'),
    });
    group.add(monitorSwitch);
    settings.bind(
        'grid-alt-tab-isolate-monitors',
        monitorSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const primaryMonitorSwitch = new Adw.SwitchRow({
        title: _('Show on Primary Monitor'),
        subtitle: _(
            'Always display the switcher on the primary monitor'
        ),
        active: settings.get_boolean(
            'grid-alt-tab-show-on-primary-monitor'
        ),
    });
    group.add(primaryMonitorSwitch);
    settings.bind(
        'grid-alt-tab-show-on-primary-monitor',
        primaryMonitorSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const syncSensitivity = () => {
        const enabled = enabledSwitch.active;
        cardSizeRow.sensitive = enabled;
        workspaceSwitch.sensitive = enabled;
        primaryMonitorSwitch.sensitive = enabled;
        monitorSwitch.sensitive = enabled;
    };
    enabledSwitch.connect('notify::active', syncSensitivity);
    syncSensitivity();
}
