// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    createSwitchRow,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

export function addWindowSwitchingGroup(page, settings, connectSettings) {
    const group = page.addGroup({
        title: _('Grid Alt-Tab'),
        description: _(
            'Switch directly between open windows using live previews.'
        ),
    });

    const enabledSwitch = createSwitchRow(settings, {
        key: 'grid-alt-tab-enabled',
        title: _('Enable Grid Alt-Tab'),
        subtitle: _(
            'Replace GNOME’s application switcher with a responsive window grid'
        ),
    });
    group.add(enabledSwitch);

    const cardSizeRow = addSliderRow(group, settings, {
        key: 'grid-alt-tab-max-card-size',
        title: _('Maximum Card Size'),
        subtitle: _(
            'Largest preview height in pixels; widths follow each window’s shape'
        ),
        lower: 120,
        upper: 500,
        step: 10,
    }, connectSettings);
    const workspaceSwitch = createSwitchRow(settings, {
        key: 'grid-alt-tab-isolate-workspaces',
        title: _('Isolate Workspaces'),
        subtitle: _(
            'Show windows from the current workspace instead of all workspaces'
        ),
    });
    group.add(workspaceSwitch);
    const monitorSwitch = createSwitchRow(settings, {
        key: 'grid-alt-tab-isolate-monitors',
        title: _('Isolate Monitors'),
        subtitle: _(
            'Show only windows from the monitor displaying the switcher'
        ),
    });
    group.add(monitorSwitch);
    const primaryMonitorSwitch = createSwitchRow(settings, {
        key: 'grid-alt-tab-show-on-primary-monitor',
        title: _('Show on Primary Monitor'),
        subtitle: _(
            'Always display the switcher on the primary monitor'
        ),
    });
    group.add(primaryMonitorSwitch);
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
