// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {axisPanelPositions} from './panelAxis.js';
import {
    createApplicationGroupingOptionsButton,
} from './applicationGroupingDialog.js';
import {
    createPinnedApplicationBehaviorOptionsButton,
} from './pinnedApplicationBehaviorDialog.js';
import {
    createClassicHighlightOptionsButton,
} from './classicHighlightDialog.js';
import {addApplicationInteractionGroup} from './applicationInteractionGroup.js';
import {TASKBAR_HIGHLIGHT_STYLE} from '../shared/classicHighlightSettings.js';
import {
    RUNNING_INDICATOR_POSITIONS,
    RUNNING_INDICATOR_STYLES,
    runningIndicatorFillsLength,
} from '../shared/runningIndicatorSettings.js';
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
        title: _('Application Icon Appearance'),
        subtitle: _('Adjust icon size, spacing, and hover/focus effects'),
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
            subtitle: _('Space between application icons'),
            lower: 0,
            upper: 16,
            addRow: row => iconSizingRow.add_row(row),
        },
        connectSettings
    );
    const classicOptionsButton = createClassicHighlightOptionsButton(settings);
    const highlightStyleRow = addComboRow(
        iconSizingRow,
        settings,
        {
            key: 'taskbar-highlight-style',
            title: _('Hover and Focus Effect'),
            subtitle: _('Choose the effect used by application icons'),
            choices: [
                {
                    value: TASKBAR_HIGHLIGHT_STYLE.GLASS,
                    label: _('Glass'),
                },
                {
                    value: TASKBAR_HIGHLIGHT_STYLE.CLASSIC,
                    label: _('Classic'),
                },
            ],
            addSuffix: row => row.add_suffix(classicOptionsButton),
            addRow: row => iconSizingRow.add_row(row),
        },
        connectSettings
    );
    const syncClassicOptionsSensitivity = () => {
        const enabled = !settings.get_boolean('windows-xp-theme-enabled');
        highlightStyleRow.sensitive = enabled;
        classicOptionsButton.sensitive = enabled &&
            settings.get_string(
                'taskbar-highlight-style'
            ) === TASKBAR_HIGHLIGHT_STYLE.CLASSIC;
    };
    connectSettings(
        settings,
        'changed::taskbar-highlight-style',
        syncClassicOptionsSensitivity
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncClassicOptionsSensitivity
    );
    syncClassicOptionsSensitivity();
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

    addApplicationInteractionGroup({
        group,
        settings,
        connectSettings,
    });
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
        title: _('Application Layout and Behavior'),
        subtitle: _(
            'Choose which applications appear and how they are grouped and indicated'
        ),
    });
    group.add(layoutGroup);

    const pinnedBehaviorOptionsButton =
        createPinnedApplicationBehaviorOptionsButton(settings);
    const pinnedBehaviorRow = new Adw.ActionRow({
        title: _('Pinned Application Behavior'),
        subtitle: _('Choose how pinned and running applications appear'),
        activatable_widget: pinnedBehaviorOptionsButton,
    });
    pinnedBehaviorRow.add_suffix(pinnedBehaviorOptionsButton);
    layoutGroup.add_row(pinnedBehaviorRow);

    const combineAppButtonsChoices = [
        {value: 'always', label: _('Always')},
        {value: 'when-full', label: _('Only When Full')},
        {value: 'never', label: _('Never')},
    ];
    const windowsXpCombineAppButtonsChoices = [
        {value: 'when-full', label: _('Only When Full')},
        {value: 'never', label: _('Never')},
    ];
    const combineOptionsButton =
        createApplicationGroupingOptionsButton(settings);
    const combineAppButtonsRow = addComboRow(
        layoutGroup,
        settings,
        {
            key: 'combine-app-buttons-mode',
            title: _('Combine Application Windows'),
            subtitle: _('Choose when windows share one application icon'),
            choices: combineAppButtonsChoices,
            choicesProvider: () =>
                settings.get_boolean(
                    'windows-xp-theme-enabled'
                )
                    ? windowsXpCombineAppButtonsChoices
                    : combineAppButtonsChoices,
            choicesChangedKey: 'windows-xp-theme-enabled',
            addSuffix: row => row.add_suffix(combineOptionsButton),
            addRow: row => layoutGroup.add_row(row),
        },
        connectSettings
    );

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
        const enabled = !settings.get_boolean(
            'windows-xp-theme-enabled'
        ) && !['left', 'right'].includes(settings.get_string(
            'panel-position'
        )) && settings.get_string(
            'combine-app-buttons-mode'
        ) !== 'always';
        combineOptionsButton.sensitive = enabled;
    };
    for (const key of [
        'combine-app-buttons-mode',
        'panel-position',
        'windows-xp-theme-enabled',
    ])
        connectSettings(settings, `changed::${key}`, syncLabelSensitivity);
    syncLabelSensitivity();

    return {
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
        subtitle: _(
            'Configure the position, style, size, and colours of running indicators'
        ),
    });
    group.add(indicatorGroup);
    const positionLabels = {
        top: _('Top'),
        bottom: _('Bottom'),
        left: _('Left'),
        right: _('Right'),
    };
    const styleLabels = {
        rounded: _('Rounded'),
        dots: _('Dots'),
        squares: _('Squares'),
        dashes: _('Dashes'),
        segmented: _('Segmented'),
        solid: _('Solid'),
        ciliora: _('Ciliora'),
        metro: _('Metro'),
    };

    const indicatorPositionRow = addComboRow(
        indicatorGroup,
        settings,
        {
            key: 'running-indicator-position',
            title: _('Running Indicator Position'),
            subtitle: _('Choose which edge of the application icon to use'),
            choices: RUNNING_INDICATOR_POSITIONS.map(value => ({
                value,
                label: positionLabels[value],
            })),
            addRow: row => indicatorGroup.add_row(row),
        },
        connectSettings
    );
    const indicatorStyleRow = addComboRow(
        indicatorGroup,
        settings,
        {
            key: 'running-indicator-style',
            title: _('Running Indicator Style'),
            subtitle: _(
                'Choose the shape of indicators around running applications'
            ),
            choices: RUNNING_INDICATOR_STYLES.map(value => ({
                value,
                label: styleLabels[value],
            })),
            addRow: row => indicatorGroup.add_row(row),
        },
        connectSettings
    );
    const indicatorSizeRow = addSpinRow(
        indicatorGroup,
        settings,
        {
            key: 'running-indicator-size',
            title: _('Running Indicator Size'),
            subtitle: _('Choose the indicator thickness in pixels'),
            lower: 1,
            upper: 5,
            addRow: row => indicatorGroup.add_row(row),
        },
        connectSettings
    );
    const indicatorFullLengthSwitch = createSwitchRow(settings, {
        key: 'running-indicator-full-length',
        title: _('Stretch Indicators'),
        subtitle: _(
            'Run indicators the full length of the application icon'
        ),
    });
    indicatorGroup.add_row(indicatorFullLengthSwitch);
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
        indicatorPositionRow.sensitive = !blocked;
        indicatorStyleRow.sensitive = !blocked;
        indicatorSizeRow.sensitive = !blocked;
        indicatorFullLengthSwitch.sensitive = !blocked &&
            runningIndicatorFillsLength(
                settings.get_string('running-indicator-style')
            );
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
        'running-indicator-style',
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
        title: _('Running Application Isolation'),
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
            'Show applications that do not fit in an overflow popup instead of scrolling the Dock'
        ),
    });
    addApplicationIsolationControls({
        group: appearanceGroup,
        settings,
        groupSubtitle: _(
            'Limit running applications to the current workspace or monitor'
        ),
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
            'Show applications that do not fit in an overflow popup instead of scrolling the taskbar'
        ),
    });
    const isolationControls = addApplicationIsolationControls({
        group: appearanceGroup,
        settings,
        groupSubtitle: _(
            'Limit running applications to the current workspace or monitor'
        ),
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
        combineAppButtonsRow: layoutControls.combineAppButtonsRow,
        syncLabelSensitivity: layoutControls.syncLabelSensitivity,
        pinnedAppSeparatorSwitch: layoutControls.pinnedAppSeparatorSwitch,
        locationSeparatorSwitch: layoutControls.locationSeparatorSwitch,
        applicationOverflowSwitch:
            overflowControls.applicationOverflowSwitch,
        isolateMonitorsSwitch: isolationControls.isolateMonitorsSwitch,
    };
}
