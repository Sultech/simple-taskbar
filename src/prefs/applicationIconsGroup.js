// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {axisPanelPositions} from './panelAxis.js';
import {
    addColorRow,
    addComboRow,
    addSpinRow,
    createSwitchRow,
} from './preferencesWidgets.js';

const MAX_ICON_SIZE = 63;

function addApplicationIconControls({
    group,
    settings,
    connectSettings,
    panelPositions,
}) {
    const iconSizingRow = new Adw.ExpanderRow({
        title: _('Icon Sizing and Spacing'),
        subtitle: _('Adjust application icon sizes and the space between them'),
    });
    group.add(iconSizingRow);

    const iconSizeRow = addSpinRow(
        iconSizingRow,
        settings,
        {
            key: 'icon-size',
            title: _('Icon Size'),
            subtitle: _(
                'The panel grows automatically when larger icons need more room'
            ),
            lower: 15,
            upper: MAX_ICON_SIZE,
            addRow: row => iconSizingRow.add_row(row),
        },
        connectSettings
    );
    const dockMinIconSizeRow = addSpinRow(
        iconSizingRow,
        settings,
        {
            key: 'dock-min-icon-size',
            title: _('Minimum Icon Size'),
            subtitle: _(
                'Smallest application icon size used when space is limited'
            ),
            lower: 15,
            upper: MAX_ICON_SIZE,
            addRow: row => iconSizingRow.add_row(row),
        },
        connectSettings
    );
    const iconSpacingRow = addSpinRow(
        iconSizingRow,
        settings,
        {
            key: 'icon-spacing',
            title: _('Icon Spacing'),
            subtitle: _('Space between application buttons'),
            lower: 0,
            upper: 16,
            addRow: row => iconSizingRow.add_row(row),
        },
        connectSettings
    );
    const appAlignmentRow = addComboRow(
        group,
        settings,
        {
            key: 'app-alignment',
            title: _('Icon Alignment'),
            subtitle: _('Choose the application icon alignment'),
            choices: panelPositions.slice(0, 2),
            choicesProvider: () =>
                axisPanelPositions(settings, panelPositions).slice(0, 2),
            choicesChangedKey: 'panel-position',
        },
        connectSettings
    );

    const windowInteractionRow = new Adw.ExpanderRow({
        title: _('Application Interaction'),
        subtitle: _('Configure previews, multi-window actions, and clicks'),
    });
    group.add(windowInteractionRow);
    windowInteractionRow.add_row(createSwitchRow(settings, {
        key: 'window-previews-enabled',
        title: _('Window Previews'),
        subtitle: _('Show live window previews when hovering application icons'),
    }));
    windowInteractionRow.add_row(createSwitchRow(settings, {
        key: 'multi-window-click-spread',
        title: _('Spread Multiple Windows'),
        subtitle: _('Click an app with multiple windows to show only its windows in Overview, across all workspaces'),
    }));
    windowInteractionRow.add_row(createSwitchRow(settings, {
        key: 'middle-click-close-apps',
        title: _('Middle Click Closes Applications'),
        subtitle: _('Close all application windows instead of opening a new window'),
    }));

    const syncMinimumIconSize = () => {
        const enabled = !settings.get_boolean('windows-xp-theme-enabled') &&
            (!settings.get_boolean('default-gnome-panel') ||
                settings.get_boolean('dock-mode'));
        dockMinIconSizeRow.sensitive = enabled;
        if (!enabled)
            return;

        const maximum = settings.get_int('icon-size');
        dockMinIconSizeRow.get_adjustment().set_upper(maximum);
        if (settings.get_int('dock-min-icon-size') > maximum)
            settings.set_int('dock-min-icon-size', maximum);
    };
    for (const key of [
        'dock-mode',
        'windows-xp-theme-enabled',
        'default-gnome-panel',
        'icon-size',
    ]) {
        connectSettings(
            settings,
            `changed::${key}`,
            syncMinimumIconSize
        );
    }
    syncMinimumIconSize();

    return {
        iconSizeRow,
        iconSpacingRow,
        appAlignmentRow,
    };
}

function addApplicationLayoutControls({
    group,
    settings,
    connectSettings,
}) {
    const layoutGroup = new Adw.ExpanderRow({
        title: _('Application Layout'),
        subtitle: _(
            'Choose which applications appear and how their buttons are shown'
        ),
    });
    group.add(layoutGroup);

    const hidePinnedAppsSwitch = createSwitchRow(settings, {
        key: 'hide-pinned-taskbar-apps',
        title: _('Hide Pinned Applications'),
        subtitle: _(
            'Show pinned taskbar applications only while they are running'
        ),
    });
    layoutGroup.add_row(hidePinnedAppsSwitch);

    const pinnedAppsAsLaunchersSwitch = createSwitchRow(settings, {
        key: 'use-pinned-apps-as-launchers',
        title: _('Use Pinned Apps as Application Launchers'),
        subtitle: _(
            'Keep pinned applications as launchers and show running applications separately'
        ),
    });
    layoutGroup.add_row(pinnedAppsAsLaunchersSwitch);

    const hideUnpinnedAppsSwitch = createSwitchRow(settings, {
        key: 'hide-unpinned-taskbar-apps',
        title: _('Hide Unpinned Applications'),
        subtitle: _(
            'Show only pinned applications and their running windows'
        ),
    });
    layoutGroup.add_row(hideUnpinnedAppsSwitch);
    const syncHiddenApplications = changedKey => {
        if (!settings.get_boolean(changedKey))
            return;

        const otherKey = changedKey === 'hide-pinned-taskbar-apps'
            ? 'hide-unpinned-taskbar-apps'
            : 'hide-pinned-taskbar-apps';
        if (settings.get_boolean(otherKey))
            settings.set_boolean(otherKey, false);
    };
    connectSettings(
        settings,
        'changed::hide-pinned-taskbar-apps',
        () => syncHiddenApplications('hide-pinned-taskbar-apps')
    );
    connectSettings(
        settings,
        'changed::hide-unpinned-taskbar-apps',
        () => syncHiddenApplications('hide-unpinned-taskbar-apps')
    );
    syncHiddenApplications('hide-pinned-taskbar-apps');
    const syncHideUnpinnedAppsSensitivity = () => {
        hideUnpinnedAppsSwitch.sensitive =
            !settings.get_boolean('windows-xp-theme-enabled');
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncHideUnpinnedAppsSensitivity
    );
    syncHideUnpinnedAppsSensitivity();

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
        layoutGroup,
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
            addRow: row => layoutGroup.add_row(row),
        },
        connectSettings
    );

    const hideAppLabelsSwitch = createSwitchRow(settings, {
        key: 'hide-app-labels',
        title: _('Hide App Labels'),
        subtitle: _('Show only icons on separate window buttons'),
    });
    layoutGroup.add_row(hideAppLabelsSwitch);

    const notificationBadgeSwitch = createSwitchRow(settings, {
        key: 'show-notification-badges',
        title: _('Show Notification Badges'),
        subtitle: _('Display unread counts on application icons'),
    });
    layoutGroup.add_row(notificationBadgeSwitch);

    const pinnedAppSeparatorSwitch = createSwitchRow(settings, {
        key: 'show-pinned-app-separator',
        title: _('Show Pinned App Separator'),
        subtitle: _('Show a line between pinned and running applications'),
    });
    layoutGroup.add_row(pinnedAppSeparatorSwitch);

    const locationSeparatorSwitch = createSwitchRow(settings, {
        key: 'show-location-separator',
        title: _('Show Location Separator'),
        subtitle: _('Show a line between applications and locations'),
    });
    layoutGroup.add_row(locationSeparatorSwitch);

    const syncSeparatorSensitivity = () => {
        const enabled = !settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        pinnedAppSeparatorSwitch.sensitive = enabled;
        locationSeparatorSwitch.sensitive = enabled;
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncSeparatorSensitivity
    );
    syncSeparatorSensitivity();

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
    combineAppButtonsRow.connect('notify::selected', syncLabelSensitivity);
    connectSettings(
        settings,
        'changed::panel-position',
        syncLabelSensitivity
    );
    syncLabelSensitivity();

    const syncPinnedAppsAsLaunchersSensitivity = () => {
        pinnedAppsAsLaunchersSwitch.sensitive =
            !settings.get_boolean('windows-xp-theme-enabled');
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncPinnedAppsAsLaunchersSensitivity
    );
    syncPinnedAppsAsLaunchersSensitivity();

    return {
        pinnedAppsAsLaunchersSwitch,
        combineAppButtonsRow,
        syncLabelSensitivity,
        pinnedAppSeparatorSwitch,
        locationSeparatorSwitch,
    };
}

function addIndicatorControls({
    group,
    settings,
    connectSettings,
}) {
    const indicatorGroup = new Adw.ExpanderRow({
        title: _('Running Indicators'),
        subtitle: _('Configure indicators beneath running application icons'),
    });
    group.add(indicatorGroup);

    const indicatorStyleRow = addComboRow(
        indicatorGroup,
        settings,
        {
            key: 'running-indicator-style',
            title: _('Running Indicator Style'),
            subtitle: _(
                'Choose the shape of indicators beneath running applications'
            ),
            choices: [
                {value: 'rounded', label: _('Rounded')},
                {value: 'straight', label: _('Straight')},
            ],
            addRow: row => indicatorGroup.add_row(row),
        },
        connectSettings
    );
    const customIndicatorColorsSwitch = new Adw.SwitchRow({
        title: _('Custom Indicator Colors'),
        subtitle: _('Choose colors for running application indicators'),
        active: settings.get_boolean(
            'custom-indicator-colors-enabled'
        ),
    });
    indicatorGroup.add_row(customIndicatorColorsSwitch);
    settings.bind(
        'custom-indicator-colors-enabled',
        customIndicatorColorsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const matchIconColorSwitch = new Adw.SwitchRow({
        title: _('Match Icon Color'),
        subtitle: _(
            'Color the focused indicator from the application icon'
        ),
        active: settings.get_boolean('match-icon-color'),
    });
    indicatorGroup.add_row(matchIconColorSwitch);
    settings.bind(
        'match-icon-color',
        matchIconColorSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const focusedIndicatorColorRow = addColorRow(
        indicatorGroup,
        settings,
        {
            key: 'focused-indicator-color',
            title: _('Focused Indicator Color'),
            addRow: row => indicatorGroup.add_row(row),
        },
        connectSettings
    );
    const unfocusedIndicatorColorRow = addColorRow(
        indicatorGroup,
        settings,
        {
            key: 'unfocused-indicator-color',
            title: _('Unfocused Indicator Color'),
            addRow: row => indicatorGroup.add_row(row),
        },
        connectSettings
    );
    const syncIndicatorControls = () => {
        const blocked =
            settings.get_boolean('windows-xp-theme-enabled') ||
            (settings.get_boolean('default-gnome-panel') &&
                !settings.get_boolean('dock-mode'));
        const enabled = customIndicatorColorsSwitch.active;
        indicatorStyleRow.sensitive = !blocked;
        customIndicatorColorsSwitch.sensitive = !blocked;
        matchIconColorSwitch.sensitive = !blocked;
        focusedIndicatorColorRow.visible = enabled;
        unfocusedIndicatorColorRow.visible = enabled;
        focusedIndicatorColorRow.sensitive = !blocked && enabled;
        unfocusedIndicatorColorRow.sensitive = !blocked && enabled;
    };
    customIndicatorColorsSwitch.connect('notify::active', () => {
        if (customIndicatorColorsSwitch.active)
            matchIconColorSwitch.active = false;
        syncIndicatorControls();
    });
    matchIconColorSwitch.connect('notify::active', () => {
        if (matchIconColorSwitch.active)
            customIndicatorColorsSwitch.active = false;
    });
    for (const key of [
        'windows-xp-theme-enabled',
        'default-gnome-panel',
        'dock-mode',
    ]) {
        connectSettings(
            settings,
            `changed::${key}`,
            syncIndicatorControls
        );
    }
    syncIndicatorControls();
}

function addApplicationOverflowControls({
    group,
    settings,
    connectSettings,
    switchSubtitle,
}) {
    const applicationOverflowRow = new Adw.ExpanderRow({
        title: _('Application Overflow'),
        subtitle: _('Choose how overflowing applications are handled'),
    });
    group.add(applicationOverflowRow);

    const applicationOverflowSwitch = createSwitchRow(settings, {
        key: 'application-overflow-enabled',
        title: _('Enable Application Overflow'),
        subtitle: switchSubtitle,
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
    const syncApplicationOverflowSensitivity = () => {
        applicationOverflowSwitch.sensitive =
            !settings.get_boolean('windows-xp-theme-enabled');
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncApplicationOverflowSensitivity
    );
    syncApplicationOverflowSensitivity();

    return {applicationOverflowSwitch};
}

function addApplicationIsolationControls({
    group,
    settings,
    groupSubtitle,
    monitorSubtitle,
}) {
    const isolateWorkspacesSwitch = createSwitchRow(settings, {
        key: 'isolate-workspaces',
        title: _('Isolate Workspaces'),
        subtitle: _('Show running applications from the current workspace only'),
    });
    const isolateMonitorsSwitch = createSwitchRow(settings, {
        key: 'isolate-monitors',
        title: _('Isolate Monitors'),
        subtitle: monitorSubtitle,
    });
    const applicationIsolationRow = new Adw.ExpanderRow({
        title: _('Application Isolation'),
        subtitle: groupSubtitle,
    });
    applicationIsolationRow.add_row(isolateWorkspacesSwitch);
    applicationIsolationRow.add_row(isolateMonitorsSwitch);
    group.add(applicationIsolationRow);

    return {isolateMonitorsSwitch};
}

function addDockApplicationIconsGroup({
    page,
    settings,
    connectSettings,
    panelPositions,
}) {
    const appearanceGroup = new Adw.PreferencesGroup({
        title: _('Application Icons'),
        description: _(
            'Change the size, spacing, placement, and running indicators for Dock icons.'
        ),
    });
    page.add(appearanceGroup);
    const controls = addApplicationIconControls({
        group: appearanceGroup,
        settings,
        connectSettings,
        panelPositions,
    });
    addApplicationOverflowControls({
        group: appearanceGroup,
        settings,
        connectSettings,
        switchSubtitle: _(
            'Show application buttons that do not fit in an overflow popup instead of scrolling the Dock'
        ),
    });
    addApplicationIsolationControls({
        group: appearanceGroup,
        settings,
        groupSubtitle: _('Choose which applications appear on the Dock'),
        monitorSubtitle: _(
            'Show running applications only in the Dock for their monitor'
        ),
    });
    addIndicatorControls({
        group: appearanceGroup,
        settings,
        connectSettings,
    });
    addApplicationLayoutControls({
        group: appearanceGroup,
        settings,
        connectSettings,
    });
    const syncDockApplicationIcons = () => {
        const dockModeEnabled = settings.get_boolean('dock-mode');
        appearanceGroup.visible = dockModeEnabled;
        appearanceGroup.sensitive = dockModeEnabled;
        controls.appAlignmentRow.sensitive = dockModeEnabled &&
            settings.get_boolean('dock-panel-mode');
    };
    connectSettings(
        settings,
        'changed::dock-mode',
        syncDockApplicationIcons
    );
    connectSettings(
        settings,
        'changed::dock-panel-mode',
        syncDockApplicationIcons
    );
    syncDockApplicationIcons();
}

export function addApplicationIconsGroup({
    page,
    dockPage,
    settings,
    connectSettings,
    panelPositions,
}) {
    const appearanceGroup = new Adw.PreferencesGroup({
        title: _('Application Icons'),
        description: _(
            'Change the size, spacing, placement, and running indicators for taskbar icons.'
        ),
    });
    page.add(appearanceGroup);
    addDockApplicationIconsGroup({
        page: dockPage,
        settings,
        connectSettings,
        panelPositions,
    });
    const controls = addApplicationIconControls({
        group: appearanceGroup,
        settings,
        connectSettings,
        panelPositions,
    });
    const overflowControls = addApplicationOverflowControls({
        group: appearanceGroup,
        settings,
        connectSettings,
        switchSubtitle: _(
            'Show application buttons that do not fit in an overflow popup instead of scrolling the taskbar'
        ),
    });
    const isolationControls = addApplicationIsolationControls({
        group: appearanceGroup,
        settings,
        groupSubtitle: _('Choose which applications appear on the taskbar'),
        monitorSubtitle: _(
            'Show running applications only on the taskbar for their monitor'
        ),
    });
    addIndicatorControls({
        group: appearanceGroup,
        settings,
        connectSettings,
    });
    const layoutControls = addApplicationLayoutControls({
        group: appearanceGroup,
        settings,
        connectSettings,
    });

    return {
        appearanceGroup,
        iconSizeRow: controls.iconSizeRow,
        iconSpacingRow: controls.iconSpacingRow,
        appAlignmentRow: controls.appAlignmentRow,
        pinnedAppsAsLaunchersSwitch:
            layoutControls.pinnedAppsAsLaunchersSwitch,
        combineAppButtonsRow: layoutControls.combineAppButtonsRow,
        syncLabelSensitivity: layoutControls.syncLabelSensitivity,
        pinnedAppSeparatorSwitch: layoutControls.pinnedAppSeparatorSwitch,
        locationSeparatorSwitch: layoutControls.locationSeparatorSwitch,
        applicationOverflowSwitch:
            overflowControls.applicationOverflowSwitch,
        isolateMonitorsSwitch: isolationControls.isolateMonitorsSwitch,
    };
}
