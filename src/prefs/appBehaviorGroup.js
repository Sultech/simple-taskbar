// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addComboRow,
    createSwitchRow,
} from './preferencesWidgets.js';

export function addAppBehaviorGroup({
    settings,
    connectSettings,
    advancedAppBehaviorGroup,
    advancedFileManagerGroup,
}) {
    const applicationOverflowRow = new Adw.ExpanderRow({
        title: _('Application Overflow'),
        subtitle: _('Choose how overflowing applications are handled'),
    });
    const applicationOverflowSwitch = createSwitchRow(settings, {
        key: 'application-overflow-enabled',
        title: _('Enable Application Overflow'),
        subtitle: _(
            'Show application buttons that do not fit in an overflow popup instead of scrolling the taskbar'
        ),
    });
    applicationOverflowRow.add_row(applicationOverflowSwitch);

    const applicationOverflowStyleRow = addComboRow(
        applicationOverflowRow,
        settings,
        {
            key: 'application-overflow-style',
            title: _('Overflow Style'),
            choices: [
                {value: 'taskbar', label: _('Taskbar Flyout')},
                {value: 'list', label: _('Application List')},
            ],
            addRow: row => applicationOverflowRow.add_row(row),
        },
        connectSettings
    );
    applicationOverflowStyleRow.sensitive =
        applicationOverflowSwitch.active;
    applicationOverflowSwitch.connect('notify::active', widget => {
        applicationOverflowStyleRow.sensitive = widget.active;
    });
    advancedAppBehaviorGroup.add(applicationOverflowRow);

    const isolateWorkspacesSwitch = createSwitchRow(settings, {
        key: 'isolate-workspaces',
        title: _('Isolate Workspaces'),
        subtitle: _('Show running applications from the current workspace only'),
    });
    const isolateMonitorsSwitch = createSwitchRow(settings, {
        key: 'isolate-monitors',
        title: _('Isolate Monitors'),
        subtitle: _('Show running applications only on the taskbar for their monitor'),
    });
    const applicationIsolationRow = new Adw.ExpanderRow({
        title: _('Application Isolation'),
        subtitle: _('Choose which applications appear on the taskbar'),
    });
    applicationIsolationRow.add_row(isolateWorkspacesSwitch);
    applicationIsolationRow.add_row(isolateMonitorsSwitch);
    advancedAppBehaviorGroup.add(applicationIsolationRow);

    const nautilusPlacesSwitch = createSwitchRow(settings, {
        key: 'nautilus-places-enabled',
        title: _('Nautilus Folder Shortcuts'),
        subtitle: _('Show common folders in the Files taskbar menu'),
    });
    advancedFileManagerGroup.add(nautilusPlacesSwitch);

    const middleClickCloseAppsSwitch = createSwitchRow(settings, {
        key: 'middle-click-close-apps',
        title: _('Middle Click Closes Applications'),
        subtitle: _('Close all application windows instead of opening a new window'),
    });
    advancedAppBehaviorGroup.add(middleClickCloseAppsSwitch);

    return {
        applicationOverflowSwitch,
        isolateMonitorsSwitch,
        nautilusPlacesSwitch,
    };
}
