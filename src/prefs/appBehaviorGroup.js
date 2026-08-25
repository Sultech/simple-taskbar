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
    const hidePinnedAppsSwitch = createSwitchRow(settings, {
        key: 'hide-pinned-taskbar-apps',
        title: _('Hide Pinned Applications'),
        subtitle: _('Show pinned taskbar applications only while they are running'),
    });
    advancedAppBehaviorGroup.add(hidePinnedAppsSwitch);

    const pinnedAppsAsLaunchersSwitch = createSwitchRow(settings, {
        key: 'use-pinned-apps-as-launchers',
        title: _('Use Pinned Apps as Application Launchers'),
        subtitle: _(
            'Keep pinned applications as launchers and show running applications separately'
        ),
    });
    advancedAppBehaviorGroup.add(pinnedAppsAsLaunchersSwitch);

    const pinnedAppSeparatorSwitch = createSwitchRow(settings, {
        key: 'show-pinned-app-separator',
        title: _('Show Pinned App Separator'),
        subtitle: _('Show a line between pinned and running applications'),
    });

    const locationSeparatorSwitch = createSwitchRow(settings, {
        key: 'show-location-separator',
        title: _('Show Location Separator'),
        subtitle: _('Show a line between applications and locations'),
    });
    const separatorsRow = new Adw.ExpanderRow({
        title: _('Separators'),
        subtitle: _('Choose which separators appear'),
    });
    separatorsRow.add_row(pinnedAppSeparatorSwitch);
    separatorsRow.add_row(locationSeparatorSwitch);
    advancedAppBehaviorGroup.add(separatorsRow);

    const combineAppButtonsChoices = [
        {value: 'always', label: _('Always')},
        {value: 'when-full', label: _('Only When Full')},
        {value: 'never', label: _('Never')},
    ];
    const windowsXpCombineAppButtonsChoices = [
        {value: 'when-full', label: _('Only When Full')},
        {value: 'never', label: _('Never')},
    ];
    const combineAppButtonsRow = addComboRow(
        advancedAppBehaviorGroup,
        settings,
        {
            key: 'combine-app-buttons-mode',
            title: _('Combine Application Buttons'),
            subtitle: _('Choose when windows share one taskbar button'),
            choices: combineAppButtonsChoices,
            choicesProvider: () =>
                settings.get_boolean(
                    'windows-xp-theme-enabled'
                )
                    ? windowsXpCombineAppButtonsChoices
                    : combineAppButtonsChoices,
            choicesChangedKey: 'windows-xp-theme-enabled',
        },
        connectSettings
    );

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

    const hideAppLabelsSwitch = createSwitchRow(settings, {
        key: 'hide-app-labels',
        title: _('Hide App Labels'),
        subtitle: _('Show only icons on separate window buttons'),
    });
    advancedAppBehaviorGroup.add(hideAppLabelsSwitch);
    const syncLabelSensitivity = () => {
        hideAppLabelsSwitch.sensitive =
            !settings.get_boolean(
                'windows-xp-theme-enabled'
            ) && !['left', 'right'].includes(settings.get_string(
                'panel-position'
            )) && settings.get_string(
                'combine-app-buttons-mode'
            ) !== 'always';
    };
    combineAppButtonsRow.connect('notify::selected', () => {
        syncLabelSensitivity();
    });
    connectSettings(
        settings,
        'changed::panel-position',
        syncLabelSensitivity
    );
    syncLabelSensitivity();

    const isolateWorkspacesSwitch = createSwitchRow(settings, {
        key: 'isolate-workspaces',
        title: _('Isolate Workspaces'),
        subtitle: _('Show running applications from the current workspace only'),
    });
    advancedAppBehaviorGroup.add(isolateWorkspacesSwitch);

    const isolateMonitorsSwitch = createSwitchRow(settings, {
        key: 'isolate-monitors',
        title: _('Isolate Monitors'),
        subtitle: _('Show running applications only on the taskbar for their monitor'),
    });
    advancedAppBehaviorGroup.add(isolateMonitorsSwitch);

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
        pinnedAppsAsLaunchersSwitch,
        separatorsRow,
        combineAppButtonsRow,
        applicationOverflowSwitch,
        isolateMonitorsSwitch,
        nautilusPlacesSwitch,
        syncLabelSensitivity,
    };
}
