// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DefaultPanelWindowSettings} from '../shared/defaultPanelWindowSettings.js';
import {defaultPanelWindowsEnabled} from '../shared/defaultPanelWindows.js';
import {createDefaultPanelIconSizingRows} from './defaultPanelIconSizing.js';
import {isDefaultPanelWithoutDock} from '../shared/panelModeProfiles.js';
import {panelApplicationAlignment} from '../shared/taskbarPanelModes.js';
import {axisPanelPositions} from './panelAxis.js';
import {
    activePanelPosition,
    positionIsVertical,
} from '../shared/panelPositionUtils.js';
import {
    createApplicationGroupingOptionsButton,
} from './applicationGroupingDialog.js';
import {
    createPinnedApplicationBehaviorOptionsButton,
} from './pinnedApplicationBehaviorDialog.js';
import {
    createClassicHighlightOptionsButton,
} from './classicHighlightDialog.js';
import {
    createProgressBarOptionsButton,
} from './progressBarDialog.js';
import {
    createRunningIndicatorReserveOptionsButton,
} from './runningIndicatorReserveDialog.js';
import {addApplicationInteractionGroup} from './applicationInteractionGroup.js';
import {addSliderRow} from './sliderRow.js';
import {
    MAX_ICON_EDGE_PADDING,
    MAX_ICON_SIZE,
    MIN_ICON_SIZE,
    MIN_ICON_EDGE_PADDING,
} from '../shared/panelSizing.js';
import {TASKBAR_HIGHLIGHT_STYLE} from '../shared/classicHighlightSettings.js';
import {
    RUNNING_INDICATOR_POSITIONS,
    RUNNING_INDICATOR_STYLES,
    runningIndicatorFillsLength,
    runningIndicatorReserveIsPossible,
} from '../shared/runningIndicatorSettings.js';
import {
    addColorRow,
    addComboRow,
    addToggleChoiceRow,
    addSwitchRow,
    createSwitchRow,
} from './preferencesWidgets.js';

function addApplicationIconControls({
    page,
    interactionPage,
    animationsPage,
    groups,
    settings,
    connectSettings,
    panelPositions,
    positionKey = 'panel-position',
    edgePaddingSubtitle,
}) {
    const group = page.addGroup({
        title: _('Application Icon Appearance'),
        description: _('Adjust icon size, spacing, and hover/focus effects'),
    });
    groups.push(group);

    const defaultPanelSizing = settings.isDefaultPanelWindows
        ? createDefaultPanelIconSizingRows(settings, connectSettings)
        : null;
    const iconSizeRow = defaultPanelSizing ? defaultPanelSizing.iconSizeRow : addSliderRow(
        group,
        settings,
        {
            key: 'icon-size',
            title: _('Icon Size'),
            subtitle: _('The panel grows automatically when larger icons need more room'),
            lower: MIN_ICON_SIZE,
            upper: MAX_ICON_SIZE,
        },
        connectSettings
    );
    if (defaultPanelSizing)
        group.add(iconSizeRow);
    const dockMinIconSizeRow = addSliderRow(
        group,
        settings,
        {
            key: 'dock-min-icon-size',
            title: _('Minimum Icon Size'),
            subtitle: _(
                'Smallest application icon size used when space is limited'
            ),
            lower: MIN_ICON_SIZE,
            upper: MAX_ICON_SIZE,
        },
        connectSettings
    );
    const iconSpacingRow = addSliderRow(
        group,
        settings,
        {
            key: 'icon-spacing',
            title: _('Icon Spacing'),
            subtitle: _('Space between application icons'),
            lower: 0,
            upper: 16,
        },
        connectSettings
    );
    const iconEdgePaddingRow = defaultPanelSizing ? defaultPanelSizing.iconEdgePaddingRow : addSliderRow(
        group,
        settings,
        {
            key: 'icon-edge-padding',
            title: _('Icon Edge Padding'),
            subtitle: edgePaddingSubtitle,
            lower: MIN_ICON_EDGE_PADDING,
            upper: MAX_ICON_EDGE_PADDING,
        },
        connectSettings
    );
    if (defaultPanelSizing)
        group.add(iconEdgePaddingRow);
    const classicOptionsButton = createClassicHighlightOptionsButton(settings);
    const highlightStyleRow = addToggleChoiceRow(
        group,
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
        },
        connectSettings
    );
    const syncClassicOptionsSensitivity = () => {
        const enabled = !settings.get_boolean('windows-xp-theme-enabled');
        group.sensitive = enabled;
        highlightStyleRow.sensitive = enabled &&
            !settings.get_boolean('windows-10-theme-enabled');
        classicOptionsButton.sensitive = enabled;
    };
    for (const key of [
        'windows-xp-theme-enabled',
        'windows-10-theme-enabled',
    ]) {
        connectSettings(
            settings,
            `changed::${key}`,
            syncClassicOptionsSensitivity
        );
    }
    syncClassicOptionsSensitivity();
    const appAlignmentRow = addComboRow(
        group,
        settings,
        {
            key: 'app-alignment',
            getValue: () => panelApplicationAlignment(settings),
            title: _('Icon Alignment'),
            subtitle: _('Choose the application icon alignment'),
            choices: panelPositions.slice(0, 2),
            choicesProvider: () => axisPanelPositions(
                settings.get_string(positionKey),
                panelPositions
            ).slice(0, 2),
            choicesChangedKeys: [positionKey, 'taskbar-dynamic', 'windows-xp-theme-enabled'],
        },
        connectSettings
    );

    addApplicationInteractionGroup({
        page: interactionPage,
        animationsPage,
        groups,
        settings,
        connectSettings,
    });
    dockMinIconSizeRow.visible = !settings.isDefaultPanelWindows;
    const syncMinimumIconSize = () => {
        const enabled = !settings.isDefaultPanelWindows &&
            !settings.get_boolean('windows-xp-theme-enabled') &&
            !isDefaultPanelWithoutDock(settings);
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
        iconEdgePaddingRow,
        appAlignmentRow,
    };
}

function addApplicationLayoutControls({
    page,
    groups,
    settings,
    connectSettings,
}) {
    const layoutGroup = page.addGroup({
        title: _('Application Layout and Behavior'),
        description: settings.isDefaultPanelWindows
            ? _('Configure window grouping, badges, and progress bars')
            : _('Choose which applications appear and how they are grouped and indicated'),
    });
    groups.push(layoutGroup);

    const pinnedBehaviorOptionsButton =
        createPinnedApplicationBehaviorOptionsButton(settings);
    const pinnedBehaviorRow = new Adw.ActionRow({
        title: _('Pinned Application Behavior'),
        subtitle: _('Choose how pinned and running applications appear'),
        activatable_widget: pinnedBehaviorOptionsButton,
    });
    pinnedBehaviorRow.add_suffix(pinnedBehaviorOptionsButton);
    pinnedBehaviorRow.visible = !settings.isDefaultPanelWindows;
    layoutGroup.add(pinnedBehaviorRow);

    const combineAppButtonsChoices = [
        {value: 'always', label: _('Always')},
        {value: 'when-full', label: _('Only When Full')},
        {value: 'never', label: _('Never')},
    ];
    const windowsXpCombineAppButtonsChoices = [
        {value: 'when-full', label: _('Only When Full')},
        {value: 'never', label: _('Never')},
    ];
    const defaultPanelCombineAppButtonsChoices = [
        {value: 'never', label: _('Never')},
        {value: 'when-full', label: _('Only When Full')},
    ];
    const combineOptionsButton =
        createApplicationGroupingOptionsButton(settings, Boolean(settings.isDefaultPanelWindows));
    const combineAppButtonsRow = addComboRow(
        layoutGroup,
        settings,
        {
            key: 'combine-app-buttons-mode',
            title: _('Combine Application Windows'),
            subtitle: _('Choose when windows share one application icon'),
            choices: combineAppButtonsChoices,
            choicesProvider: () => settings.isDefaultPanelWindows
                ? defaultPanelCombineAppButtonsChoices
                : settings.get_boolean(
                    'windows-xp-theme-enabled'
                )
                    ? windowsXpCombineAppButtonsChoices
                    : combineAppButtonsChoices,
            choicesChangedKey: 'windows-xp-theme-enabled',
            addSuffix: row => {
                if (!settings.isDefaultPanelWindows)
                    row.add_suffix(combineOptionsButton);
            },
        },
        connectSettings
    );

    const progressBarOptionsButton = createProgressBarOptionsButton(settings);
    addSwitchRow(layoutGroup, settings, {
        key: 'show-progress-bars',
        title: _('Show Progress Bars'),
        subtitle: _('Display file transfer and install progress on application icons'),
        addSuffix: row => row.add_suffix(progressBarOptionsButton),
    });
    const syncProgressBarOptionsSensitivity = () => {
        progressBarOptionsButton.sensitive =
            settings.get_boolean('show-progress-bars');
    };
    connectSettings(
        settings,
        'changed::show-progress-bars',
        syncProgressBarOptionsSensitivity
    );
    syncProgressBarOptionsSensitivity();

    const notificationBadgeSwitch = createSwitchRow(settings, {
        key: 'show-notification-badges',
        title: _('Show Notification Badges'),
        subtitle: _('Display unread counts on application icons'),
    });
    layoutGroup.add(notificationBadgeSwitch);

    const pinnedAppSeparatorSwitch = createSwitchRow(settings, {
        key: 'show-pinned-app-separator',
        title: _('Show Pinned App Separator'),
        subtitle: _('Show a line between pinned and running applications'),
    });
    layoutGroup.add(pinnedAppSeparatorSwitch);

    const locationSeparatorSwitch = createSwitchRow(settings, {
        key: 'show-location-separator',
        title: _('Show Location Separator'),
        subtitle: _('Show a line between applications and locations'),
    });
    layoutGroup.add(locationSeparatorSwitch);
    pinnedAppSeparatorSwitch.visible = !settings.isDefaultPanelWindows;
    locationSeparatorSwitch.visible = !settings.isDefaultPanelWindows;

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
        ) && !positionIsVertical(activePanelPosition(settings)) &&
            settings.get_string(
                'combine-app-buttons-mode'
            ) !== 'always';
        combineOptionsButton.sensitive = settings.isDefaultPanelWindows || enabled;
    };
    for (const key of [
        'combine-app-buttons-mode',
        'dock-mode',
        'dock-position',
        'panel-position',
        'windows-xp-theme-enabled',
    ])
        connectSettings(settings, `changed::${key}`, syncLabelSensitivity);
    syncLabelSensitivity();

    return {
        combineAppButtonsRow,
        syncLabelSensitivity,
    };
}

function addIndicatorControls({
    page,
    groups,
    settings,
    connectSettings,
}) {
    const indicatorGroup = page.addGroup({
        title: _('Running Indicators'),
        description: _(
            'Configure the position, style, size, and colours of running indicators'
        ),
    });
    groups.push(indicatorGroup);
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

    const reserveOptionsButton =
        createRunningIndicatorReserveOptionsButton(settings);
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
            addSuffix: row => row.add_suffix(reserveOptionsButton),
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
        },
        connectSettings
    );
    const indicatorSizeRow = addSliderRow(
        indicatorGroup,
        settings,
        {
            key: 'running-indicator-size',
            title: _('Running Indicator Size'),
            subtitle: _('Choose the indicator thickness in pixels'),
            lower: 1,
            upper: 5,
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
    indicatorGroup.add(indicatorFullLengthSwitch);
    const customIndicatorColorsSwitch = createSwitchRow(settings, {
        key: 'custom-indicator-colors-enabled',
        title: _('Custom Indicator Colors'),
        subtitle: _('Choose colors for running application indicators'),
    });
    indicatorGroup.add(customIndicatorColorsSwitch);
    const matchIconColorSwitch = createSwitchRow(settings, {
        key: 'match-icon-color',
        title: _('Match Icon Color'),
        subtitle: _(
            'Color the focused indicator from the application icon'
        ),
    });
    indicatorGroup.add(matchIconColorSwitch);
    const focusedIndicatorColorRow = addColorRow(
        indicatorGroup,
        settings,
        {
            key: 'focused-indicator-color',
            title: _('Focused Indicator Color'),
        },
        connectSettings
    );
    const unfocusedIndicatorColorRow = addColorRow(
        indicatorGroup,
        settings,
        {
            key: 'unfocused-indicator-color',
            title: _('Unfocused Indicator Color'),
        },
        connectSettings
    );
    const syncIndicatorControls = () => {
        const blocked =
            settings.get_boolean('windows-xp-theme-enabled') ||
            (!settings.isDefaultPanelWindows && isDefaultPanelWithoutDock(settings));
        const windows10Theme = settings.get_boolean(
            'windows-10-theme-enabled'
        );
        const enabled = customIndicatorColorsSwitch.active;
        indicatorGroup.sensitive = !blocked;
        indicatorPositionRow.sensitive = !blocked;
        reserveOptionsButton.sensitive = !blocked &&
            runningIndicatorReserveIsPossible(
                activePanelPosition(settings),
                settings.get_string('running-indicator-position')
            );
        indicatorStyleRow.sensitive = !blocked && !windows10Theme;
        indicatorSizeRow.sensitive = !blocked && !windows10Theme;
        indicatorFullLengthSwitch.sensitive = !blocked && !windows10Theme &&
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
        'windows-10-theme-enabled',
        'default-gnome-panel',
        'dock-mode',
        'dock-position',
        'panel-position',
        'running-indicator-position',
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
    page,
    groups,
    settings,
    connectSettings,
    switchSubtitle,
}) {
    const applicationOverflowGroup = page.addGroup({
        title: _('Application Overflow'),
        description: _('Choose how overflowing applications are handled'),
    });
    groups.push(applicationOverflowGroup);

    const applicationOverflowSwitch = createSwitchRow(settings, {
        key: 'application-overflow-enabled',
        title: _('Enable Application Overflow'),
        subtitle: switchSubtitle,
    });
    applicationOverflowGroup.add(applicationOverflowSwitch);

    const applicationOverflowStyleRow = addToggleChoiceRow(
        applicationOverflowGroup,
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
}

function addApplicationIsolationControls({
    page,
    groups,
    settings,
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
    const applicationIsolationGroup = page.addGroup({
        title: _('Running Application Isolation'),
        description: settings.isDefaultPanelWindows
            ? _('Limit this panel’s running windows to the current workspace or monitor')
            : _('Limit running applications to the current workspace or monitor'),
    });
    applicationIsolationGroup.add(isolateWorkspacesSwitch);
    applicationIsolationGroup.add(isolateMonitorsSwitch);
    groups.push(applicationIsolationGroup);

    return {isolateMonitorsSwitch};
}

function addApplicationSections({
    pages,
    settings,
    connectSettings,
    panelPositions,
    positionKey,
    edgePaddingSubtitle,
    overflowSubtitle,
    monitorSubtitle,
}) {
    const groups = [];
    const controls = addApplicationIconControls({
        page: pages.icons,
        interactionPage: pages.interaction,
        animationsPage: pages.animations,
        groups,
        settings,
        connectSettings,
        panelPositions,
        positionKey,
        edgePaddingSubtitle,
    });
    const layoutControls = addApplicationLayoutControls({
        page: pages.icons,
        groups,
        settings,
        connectSettings,
    });
    addApplicationOverflowControls({
        page: pages.icons,
        groups,
        settings,
        connectSettings,
        switchSubtitle: overflowSubtitle,
    });
    const isolationControls = addApplicationIsolationControls({
        page: pages.icons,
        groups,
        settings,
        monitorSubtitle,
    });
    addIndicatorControls({
        page: pages.indicators,
        groups,
        settings,
        connectSettings,
    });
    const setVisible = visible => {
        for (const group of groups)
            group.visible = visible;
    };
    return {controls, layoutControls, isolationControls, setVisible};
}

function addDockApplicationSections({pages, settings, connectSettings, panelPositions}) {
    const {controls} = addApplicationSections({
        pages,
        settings,
        connectSettings,
        panelPositions,
        positionKey: 'dock-position',
        edgePaddingSubtitle: _(
            'Space between icons and the Dock edges; lower it to fit larger icons in a thinner Dock'
        ),
        overflowSubtitle: _(
            'Show applications that do not fit in an overflow popup instead of scrolling the Dock'
        ),
        monitorSubtitle: _(
            'Show running applications only in the Dock for their monitor'
        ),
    });
    const syncDockApplicationIcons = () => {
        controls.appAlignmentRow.sensitive = settings.get_boolean('dock-mode') &&
            settings.get_boolean('dock-panel-mode');
    };
    for (const key of ['dock-mode', 'dock-panel-mode'])
        connectSettings(settings, `changed::${key}`, syncDockApplicationIcons);
    syncDockApplicationIcons();
}

function addDefaultPanelApplicationSections({pages, settings, connectSettings, panelPositions}) {
    const windowSettings = new DefaultPanelWindowSettings(settings);
    const {isolationControls, setVisible} = addApplicationSections({
        pages,
        settings: windowSettings,
        connectSettings,
        panelPositions,
        positionKey: 'panel-position',
        edgePaddingSubtitle: _('Space between window icons and the panel edges'),
        overflowSubtitle: _('Show windows that do not fit in an overflow popup instead of scrolling the panel'),
        monitorSubtitle: _('Show running windows only on the panel for their monitor'),
    });
    const syncMonitorIsolation = () => {
        isolationControls.isolateMonitorsSwitch.sensitive = settings.get_boolean('multi-monitor-panels');
    };
    connectSettings(settings, 'changed::multi-monitor-panels', syncMonitorIsolation);
    syncMonitorIsolation();
    const syncVisibility = () => {
        setVisible(defaultPanelWindowsEnabled(settings));
    };
    for (const key of ['default-gnome-panel', 'default-panel-show-running-windows', 'panel-position'])
        connectSettings(settings, `changed::${key}`, syncVisibility);
    syncVisibility();
}

export function addApplicationIconsGroup({
    pages,
    dockPages,
    settings,
    connectSettings,
    panelPositions,
}) {
    const {
        controls,
        layoutControls,
        isolationControls,
        setVisible,
    } = addApplicationSections({
        pages,
        settings,
        connectSettings,
        panelPositions,
        positionKey: 'panel-position',
        edgePaddingSubtitle: _(
            'Space between icons and the taskbar edges; lower it to fit larger icons in a thinner taskbar'
        ),
        overflowSubtitle: _(
            'Show applications that do not fit in an overflow popup instead of scrolling the taskbar'
        ),
        monitorSubtitle: _(
            'Show running applications only on the taskbar for their monitor'
        ),
    });
    const syncTaskbarApplicationIcons = () => {
        setVisible(!settings.get_boolean('default-gnome-panel'));
    };
    for (const key of ['default-gnome-panel', 'dock-mode'])
        connectSettings(settings, `changed::${key}`, syncTaskbarApplicationIcons);
    syncTaskbarApplicationIcons();
    addDefaultPanelApplicationSections({pages, settings, connectSettings, panelPositions});
    addDockApplicationSections({
        pages: dockPages,
        settings,
        connectSettings,
        panelPositions,
    });

    return {
        iconSizeRow: controls.iconSizeRow,
        iconSpacingRow: controls.iconSpacingRow,
        iconEdgePaddingRow: controls.iconEdgePaddingRow,
        appAlignmentRow: controls.appAlignmentRow,
        combineAppButtonsRow: layoutControls.combineAppButtonsRow,
        syncLabelSensitivity: layoutControls.syncLabelSensitivity,
        isolateMonitorsSwitch: isolationControls.isolateMonitorsSwitch,
    };
}
