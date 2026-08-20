// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addComboRow} from './preferencesWidgets.js';

export function addAppBehaviorGroup({
    settings,
    connectSettings,
    advancedAppBehaviorGroup,
    advancedFileManagerGroup,
}) {
    const hidePinnedAppsSwitch = new Adw.SwitchRow({
        title: _('Hide Pinned Applications'),
        subtitle: _('Show pinned taskbar applications only while they are running'),
        active: settings.get_boolean(
            'hide-pinned-taskbar-apps'
        ),
    });
    advancedAppBehaviorGroup.add(hidePinnedAppsSwitch);
    settings.bind(
        'hide-pinned-taskbar-apps',
        hidePinnedAppsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const pinnedAppsAsLaunchersSwitch = new Adw.SwitchRow({
        title: _('Use Pinned Apps as Application Launchers'),
        subtitle: _(
            'Keep pinned applications as launchers and show running applications separately'
        ),
        active: settings.get_boolean(
            'use-pinned-apps-as-launchers'
        ),
    });
    advancedAppBehaviorGroup.add(pinnedAppsAsLaunchersSwitch);
    settings.bind(
        'use-pinned-apps-as-launchers',
        pinnedAppsAsLaunchersSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

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

    const applicationOverflowSwitch = new Adw.SwitchRow({
        title: _('Application Overflow'),
        subtitle: _(
            'Show application buttons that do not fit in an overflow popup instead of scrolling the taskbar'
        ),
        active: settings.get_boolean(
            'application-overflow-enabled'
        ),
    });
    advancedAppBehaviorGroup.add(applicationOverflowSwitch);
    settings.bind(
        'application-overflow-enabled',
        applicationOverflowSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const applicationOverflowStyleRow = addComboRow(
        advancedAppBehaviorGroup,
        settings,
        {
            key: 'application-overflow-style',
            title: _('Overflow Style'),
            choices: [
                {value: 'taskbar', label: _('Taskbar Flyout')},
                {value: 'list', label: _('Application List')},
            ],
        },
        connectSettings
    );
    applicationOverflowStyleRow.sensitive =
        applicationOverflowSwitch.active;
    applicationOverflowSwitch.connect('notify::active', widget => {
        applicationOverflowStyleRow.sensitive = widget.active;
    });

    const hideAppLabelsSwitch = new Adw.SwitchRow({
        title: _('Hide App Labels'),
        subtitle: _('Show only icons on separate window buttons'),
        active: settings.get_boolean('hide-app-labels'),
    });
    advancedAppBehaviorGroup.add(hideAppLabelsSwitch);
    settings.bind(
        'hide-app-labels',
        hideAppLabelsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
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

    const isolateWorkspacesSwitch = new Adw.SwitchRow({
        title: _('Isolate Workspaces'),
        subtitle: _('Show running applications from the current workspace only'),
        active: settings.get_boolean('isolate-workspaces'),
    });
    advancedAppBehaviorGroup.add(isolateWorkspacesSwitch);
    settings.bind(
        'isolate-workspaces',
        isolateWorkspacesSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const isolateMonitorsSwitch = new Adw.SwitchRow({
        title: _('Isolate Monitors'),
        subtitle: _('Show running applications only on the taskbar for their monitor'),
        active: settings.get_boolean('isolate-monitors'),
    });
    advancedAppBehaviorGroup.add(isolateMonitorsSwitch);
    settings.bind(
        'isolate-monitors',
        isolateMonitorsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const nautilusPlacesSwitch = new Adw.SwitchRow({
        title: _('Nautilus Folder Shortcuts'),
        subtitle: _('Show common folders in the Files taskbar menu'),
        active: settings.get_boolean(
            'nautilus-places-enabled'
        ),
    });
    advancedFileManagerGroup.add(nautilusPlacesSwitch);
    settings.bind(
        'nautilus-places-enabled',
        nautilusPlacesSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const middleClickCloseAppsSwitch = new Adw.SwitchRow({
        title: _('Middle Click Closes Applications'),
        subtitle: _('Close all application windows instead of opening a new window'),
        active: settings.get_boolean('middle-click-close-apps'),
    });
    advancedAppBehaviorGroup.add(middleClickCloseAppsSwitch);
    settings.bind(
        'middle-click-close-apps',
        middleClickCloseAppsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    return {
        pinnedAppsAsLaunchersSwitch,
        combineAppButtonsRow,
        applicationOverflowSwitch,
        isolateMonitorsSwitch,
        nautilusPlacesSwitch,
        syncLabelSensitivity,
    };
}
