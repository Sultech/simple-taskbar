// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    MAX_PANEL_HEIGHT,
    MIN_PANEL_HEIGHT,
    standardMinimumPanelHeight,
} from '../shared/panelSizing.js';
import {
    applyWindowsXpThemeSettings,
    WINDOWS_XP_ICON_SPACING,
} from '../shared/windowsXpTheme.js';
import {setPanelPosition} from '../shared/panelModeProfiles.js';
import {
    TASKBAR_GEOMETRY_KEYS,
    dynamicTaskbarEnabled,
    floatingTaskbarEnabled,
} from '../shared/taskbarPanelModes.js';
import {
    addColorRow,
    addToggleChoiceRow,
    addSwitchRow,
    createSwitchExpanderRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {
    createDynamicTransparencyOptionsButton,
} from './dynamicTransparencyDialog.js';
import {createPanelThicknessSizing} from './panelThicknessSizing.js';
import {addChoiceCards, drawTaskbarEdge, edgeChoices} from './choiceCards.js';
import {addSliderRow} from './sliderRow.js';

const PANEL_HEIGHT_FOLLOW_KEY = 'panel-height-follow-icon-size';

export function addPanelAppearancePage({
    sizePage,
    appearancePage,
    settings,
    connectSettings,
    createSettings,
    blurMyShellPanelBlurEnabled,
    iconSizeRow,
    iconSpacingRow,
    iconEdgePaddingRow,
    appAlignmentRow,
    combineAppButtonsRow,
    syncLabelSensitivity,
}) {
    const panelPositionGroup = sizePage.addGroup({
        title: _('Taskbar Position'),
        description: _('Place the taskbar at a screen edge'),
    });
    const panelPositionCards = addChoiceCards(panelPositionGroup, {
        choices: edgeChoices(edge => drawTaskbarEdge(edge, () => ({
            short: dynamicTaskbarEnabled(settings),
            floating: floatingTaskbarEnabled(settings),
        }))),
        onSelected: position => {
            const positionSettings = createSettings();
            positionSettings.delay();
            setPanelPosition(positionSettings, position);
            positionSettings.apply();
        },
        connectSettings,
    });
    const syncPanelPositionCards = () => {
        panelPositionCards.setActive(settings.get_string('panel-position'));
    };
    connectSettings(settings, 'changed::panel-position', syncPanelPositionCards);
    syncPanelPositionCards();
    for (const key of TASKBAR_GEOMETRY_KEYS)
        connectSettings(settings, `changed::${key}`, panelPositionCards.redraw);

    const panelAppearanceGroup = sizePage.addGroup({
        title: _('Thickness'),
        description: _('Choose how thick the taskbar is'),
    });
    const layoutGroup = sizePage.addGroup({
        title: _('Panel Layout'),
        description: _('Choose dynamic sizing and floating independently'),
    });
    const dynamicExpander = createSwitchExpanderRow(settings, {
        title: _('Dynamic Panel Mode'),
        subtitle: _('Size the taskbar to its contents and expand as items are added'),
        getKey: () => 'taskbar-dynamic',
    }, connectSettings);
    layoutGroup.add(dynamicExpander);
    const addDynamicRow = row => dynamicExpander.add_row(row);
    addSliderRow(null, settings, {
        key: 'taskbar-max-length',
        unit: '%',
        title: _('Maximum Taskbar Length'),
        subtitle: _('Limit the dynamic taskbar to this percentage of the monitor length'),
        lower: 1,
        upper: 90,
        addRow: addDynamicRow,
    }, connectSettings);
    addSliderRow(null, settings, {
        key: 'taskbar-side-padding',
        unit: 'px',
        title: _('Side Padding'),
        subtitle: _('Space inside both ends of the dynamic taskbar'),
        lower: 0,
        upper: 64,
        addRow: addDynamicRow,
    }, connectSettings);
    const highlightEdgeGapRow = addSliderRow(null, settings, {
        key: 'taskbar-highlight-edge-gap',
        unit: 'px',
        title: _('Highlight Edge Gap'),
        subtitle: _('Space between the highlight and the edges of the dynamic taskbar'),
        lower: 0,
        upper: 16,
        addRow: addDynamicRow,
    }, connectSettings);
    const syncHighlightEdgeGapRow = () => {
        const defaultPanel = settings.get_boolean('default-gnome-panel');
        highlightEdgeGapRow.sensitive = !defaultPanel;
        highlightEdgeGapRow.subtitle = defaultPanel
            ? _('Not used in Default GNOME Panel mode, where Panel Height sets the thickness')
            : _('Space between the highlight and the edges of the dynamic taskbar');
    };
    connectSettings(settings, 'changed::default-gnome-panel', syncHighlightEdgeGapRow);
    syncHighlightEdgeGapRow();
    const floatingExpander = createSwitchExpanderRow(settings, {
        title: _('Floating Panel Mode'),
        subtitle: _('Add a small screen-edge gap that closes for maximized windows'),
        getKey: () => settings.get_boolean('taskbar-dynamic')
            ? 'taskbar-dynamic-floating'
            : 'taskbar-floating',
        keyChangedKey: 'taskbar-dynamic',
    }, connectSettings);
    layoutGroup.add(floatingExpander);
    addSliderRow(null, settings, {
        key: 'taskbar-floating-gap',
        unit: 'px',
        title: _('Floating Gap'),
        subtitle: _('Distance between the floating taskbar and the screen edge'),
        lower: 1,
        upper: 32,
        addRow: row => floatingExpander.add_row(row),
    }, connectSettings);
    const cornerRadiusRow = addSliderRow(layoutGroup, settings, {
        key: 'taskbar-corner-radius',
        title: _('Corner Radius'),
        subtitle: _('Round the corners of the dynamic or floating taskbar'),
        lower: 0,
        upper: 64,
    }, connectSettings);
    const syncFloatingControls = () => {
        layoutGroup.sensitive = !settings.get_boolean('windows-xp-theme-enabled');
        cornerRadiusRow.sensitive = dynamicTaskbarEnabled(settings) ||
            floatingTaskbarEnabled(settings);
    };
    for (const key of TASKBAR_GEOMETRY_KEYS)
        connectSettings(settings, `changed::${key}`, syncFloatingControls);
    syncFloatingControls();

    const panelHeightFollowSubtitle = _('Keep the taskbar only as thick as its icons need');
    const {
        followSwitch: panelHeightFollowSwitch,
        followsIcons: panelHeightFollowsIcons,
    } = createPanelThicknessSizing(settings, connectSettings, {
        heightKey: 'panel-height',
        followKey: PANEL_HEIGHT_FOLLOW_KEY,
        followSubtitle: panelHeightFollowSubtitle,
        isActive: () => !settings.get_boolean('default-gnome-panel') &&
            !settings.get_boolean('windows-xp-theme-enabled') &&
            !dynamicTaskbarEnabled(settings),
    });
    panelAppearanceGroup.add(panelHeightFollowSwitch);

    const panelHeightRow = addSliderRow(
        panelAppearanceGroup,
        settings,
        {
            key: 'panel-height',
            title: _('Taskbar Thickness'),
            subtitle: _(
                'Oversized icons shrink automatically when the taskbar is reduced'
            ),
            lower: MIN_PANEL_HEIGHT,
            upper: MAX_PANEL_HEIGHT,
        },
        connectSettings
    );
    const syncWindowsXpTheme = () => {
        const enabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        if (enabled) {
            if (settings.get_boolean('default-gnome-panel')) {
                settings.set_boolean(
                    'default-gnome-panel',
                    false
                );
            }
            applyWindowsXpThemeSettings(settings);
        }
        panelHeightRow.get_adjustment().set_lower(
            enabled || settings.get_boolean('default-gnome-panel')
                ? MIN_PANEL_HEIGHT
                : standardMinimumPanelHeight(settings)
        );
        iconSpacingRow.get_adjustment().set_lower(
            enabled ? WINDOWS_XP_ICON_SPACING : 0
        );
        const iconSpacing = settings.get_int('icon-spacing');
        if (iconSpacingRow.get_value() !== iconSpacing)
            iconSpacingRow.set_value(iconSpacing);
        iconSizeRow.sensitive = !enabled;
        iconSpacingRow.sensitive = !enabled;
        iconEdgePaddingRow.sensitive = !enabled;
        const defaultPanel = settings.get_boolean('default-gnome-panel');
        const dynamic = dynamicTaskbarEnabled(settings);
        panelHeightFollowSwitch.sensitive = !enabled && !defaultPanel && !dynamic;
        if (defaultPanel)
            panelHeightFollowSwitch.subtitle = _('Not available with the Default GNOME Panel: set the Taskbar Thickness below and the window icons resize to fit');
        else if (dynamic)
            panelHeightFollowSwitch.subtitle = _('Dynamic Panel Mode always matches the thickness to the icon size');
        else
            panelHeightFollowSwitch.subtitle = panelHeightFollowSubtitle;
        panelHeightRow.sensitive = !enabled && !dynamic && !panelHeightFollowsIcons();
        panelPositionGroup.sensitive = !enabled;
        appAlignmentRow.sensitive = !enabled && !dynamicTaskbarEnabled(settings) &&
            (!settings.get_boolean('dock-mode') ||
                settings.get_boolean('dock-panel-mode'));
        combineAppButtonsRow.sensitive = true;
        syncLabelSensitivity();
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncWindowsXpTheme
    );
    connectSettings(settings, 'changed::taskbar-dynamic', syncWindowsXpTheme);
    connectSettings(settings, 'changed::dock-mode', syncWindowsXpTheme);
    connectSettings(
        settings,
        'changed::default-gnome-panel',
        syncWindowsXpTheme
    );
    connectSettings(
        settings,
        'changed::dock-panel-mode',
        syncWindowsXpTheme
    );
    connectSettings(settings, 'changed::icon-size', syncWindowsXpTheme);
    connectSettings(settings, 'changed::icon-spacing', syncWindowsXpTheme);
    connectSettings(
        settings,
        'changed::icon-edge-padding',
        syncWindowsXpTheme
    );
    connectSettings(settings, 'changed::panel-height', syncWindowsXpTheme);
    connectSettings(
        settings,
        `changed::${PANEL_HEIGHT_FOLLOW_KEY}`,
        syncWindowsXpTheme
    );
    connectSettings(settings, 'changed::panel-position', syncWindowsXpTheme);
    connectSettings(
        settings,
        'changed::panel-button-padding',
        syncWindowsXpTheme
    );
    connectSettings(
        settings,
        'changed::custom-indicator-colors-enabled',
        syncWindowsXpTheme
    );
    connectSettings(
        settings,
        'changed::custom-panel-color-enabled',
        syncWindowsXpTheme
    );
    connectSettings(
        settings,
        'changed::activities-button-position',
        syncWindowsXpTheme
    );
    connectSettings(settings, 'changed::app-alignment', syncWindowsXpTheme);
    connectSettings(
        settings,
        'changed::start-button-position',
        syncWindowsXpTheme
    );
    connectSettings(
        settings,
        'changed::use-pinned-apps-as-launchers',
        syncWindowsXpTheme
    );
    connectSettings(
        settings,
        'changed::combine-app-buttons-mode',
        syncWindowsXpTheme
    );
    connectSettings(
        settings,
        'changed::hide-app-labels',
        syncWindowsXpTheme
    );
    syncWindowsXpTheme();

    const themeGroup = appearancePage.addGroup({
        title: _('Theme and Styling'),
        description: _(
            'Choose the taskbar theme, colours, gradient, and text appearance'
        ),
    });

    const followSystemThemeSwitch = createSwitchRow(settings, {
        key: 'panel-theme-follow-system',
        title: _('Follow System Theme'),
        subtitle: _('Match the active GNOME Shell theme, independently of application colours'),
    });
    themeGroup.add(followSystemThemeSwitch);

    const panelThemeRow = addToggleChoiceRow(
        themeGroup,
        settings,
        {
            key: 'panel-theme',
            title: _('Taskbar Theme'),
            subtitle: _('Choose the colour scheme when system matching is off'),
            choices: [
                {value: 'light', label: _('Light')},
                {value: 'dark', label: _('Dark')},
            ],
        },
        connectSettings
    );
    followSystemThemeSwitch.connect('notify::active', widget => {
        syncPanelThemeControls();
        if (widget.active)
            settings.set_boolean(
                'custom-panel-color-enabled',
                false
            );
    });

    const transparencySwitchSubtitle = _(
        'Make the taskbar background transparent'
    );
    const dynamicTransparencySubtitle = _(
        'Adjust transparency according to the selected window state'
    );
    const panelBlurTransparencySubtitle = _(
        'Disable Blur My Shell panel blur to use this option'
    );
    const transparencyGroup = appearancePage.addGroup({
        title: _('Transparency'),
        description: _('Control the taskbar background transparency'),
    });

    const transparencySwitch = createSwitchRow(settings, {
        key: 'transparency-enabled',
        title: _('Enable Transparency'),
        subtitle: transparencySwitchSubtitle,
    });
    transparencyGroup.add(transparencySwitch);

    const transparencyRowSubtitle = _(
        '0% is opaque and 100% is fully transparent'
    );
    const transparencyRow = addSliderRow(
        transparencyGroup,
        settings,
        {
            key: 'transparency-level',
            unit: '%',
            title: _('Transparency'),
            subtitle: transparencyRowSubtitle,
            lower: 0,
            upper: 100,
        },
        connectSettings
    );
    const dynamicTransparencyOptionsButton =
        createDynamicTransparencyOptionsButton(settings, {
            title: _('Dynamic Transparency Options'),
            behaviorKey: 'transparency-dynamic-behavior',
            distanceKey: 'transparency-dynamic-distance',
            levelKey: 'transparency-dynamic-level',
            animationTimeKey: 'transparency-dynamic-animation-time',
        });
    const {
        row: dynamicTransparencyRow,
        toggle: dynamicTransparencyToggle,
    } = addSwitchRow(transparencyGroup, settings, {
        key: 'transparency-on-unmaximized',
        title: _('Dynamic Transparency'),
        subtitle: dynamicTransparencySubtitle,
        addSuffix: row => row.add_suffix(dynamicTransparencyOptionsButton),
    });
    const updatePanelTransparencyControls = () => {
        const blocked = blurMyShellPanelBlurEnabled();
        const windowsXpThemeEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        transparencyGroup.sensitive = !windowsXpThemeEnabled;
        transparencySwitch.sensitive = !blocked &&
            !windowsXpThemeEnabled;
        transparencySwitch.subtitle = blocked
            ? panelBlurTransparencySubtitle
            : transparencySwitchSubtitle;
        transparencyRow.sensitive = !blocked &&
            !windowsXpThemeEnabled && transparencySwitch.active;
        transparencyRow.subtitle = blocked
            ? panelBlurTransparencySubtitle
            : transparencyRowSubtitle;
        dynamicTransparencyRow.sensitive = !blocked &&
            !windowsXpThemeEnabled;
        dynamicTransparencyRow.subtitle = blocked
            ? panelBlurTransparencySubtitle
            : dynamicTransparencySubtitle;
        dynamicTransparencyOptionsButton.sensitive =
            !blocked && !windowsXpThemeEnabled &&
            dynamicTransparencyToggle.active;
    };
    transparencySwitch.connect(
        'notify::active',
        updatePanelTransparencyControls
    );
    dynamicTransparencyToggle.connect(
        'notify::active',
        updatePanelTransparencyControls
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        updatePanelTransparencyControls
    );
    updatePanelTransparencyControls();

    const customPanelColorSubtitle = _(
        'Use a chosen color instead of the light or dark theme color'
    );
    const customPanelColorSwitch = createSwitchRow(settings, {
        key: 'custom-panel-color-enabled',
        title: _('Custom Taskbar Color'),
        subtitle: customPanelColorSubtitle,
    });
    themeGroup.add(customPanelColorSwitch);
    const customPanelColorRow = addColorRow(
        themeGroup,
        settings,
        {
            key: 'custom-panel-color',
            title: _('Taskbar Color'),
        },
        connectSettings
    );
    const customPanelGradientSwitch = createSwitchRow(settings, {
        key: 'custom-panel-gradient-enabled',
        title: _('Use Taskbar Gradient'),
        subtitle: _('Blend the taskbar color with a second color'),
    });
    themeGroup.add(customPanelGradientSwitch);
    const customPanelGradientColorRow = addColorRow(
        themeGroup,
        settings,
        {
            key: 'custom-panel-gradient-color',
            title: _('Taskbar Gradient Color'),
        },
        connectSettings
    );
    const customPanelGradientDirectionRow = addToggleChoiceRow(
        themeGroup,
        settings,
        {
            key: 'custom-panel-gradient-direction',
            title: _('Taskbar Gradient Direction'),
            subtitle: _('Choose how the gradient flows'),
            choices: [
                {value: 'vertical', label: _('Vertical')},
                {value: 'horizontal', label: _('Horizontal')},
            ],
        },
        connectSettings
    );
    const customPanelTextColorSubtitle = _(
        'White text uses the dark taskbar theme; black text uses the light taskbar theme'
    );
    const customPanelTextColorRow = addToggleChoiceRow(
        themeGroup,
        settings,
        {
            key: 'panel-theme',
            title: _('Taskbar Text Color'),
            subtitle: customPanelTextColorSubtitle,
            choices: [
                {value: 'dark', label: _('White')},
                {value: 'light', label: _('Black')},
            ],
        },
        connectSettings
    );
    const updateCustomPanelColorControls = () => {
        const blocked = blurMyShellPanelBlurEnabled();
        if (blocked && settings.get_boolean('custom-panel-color-enabled'))
            settings.set_boolean('custom-panel-color-enabled', false);
        const customPanelColorEnabled = settings.get_boolean(
            'custom-panel-color-enabled'
        );
        const customPanelGradientEnabled = settings.get_boolean(
            'custom-panel-gradient-enabled'
        );
        const windowsXpThemeEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        customPanelColorSwitch.sensitive = !blocked &&
            !windowsXpThemeEnabled;
        customPanelColorSwitch.subtitle = blocked
            ? panelBlurTransparencySubtitle
            : customPanelColorSubtitle;
        customPanelGradientSwitch.visible = customPanelColorEnabled;
        customPanelGradientSwitch.sensitive = !blocked &&
            !windowsXpThemeEnabled && customPanelColorEnabled;
        customPanelGradientColorRow.visible = customPanelColorEnabled &&
            customPanelGradientEnabled;
        customPanelGradientColorRow.sensitive = !blocked &&
            !windowsXpThemeEnabled && customPanelColorEnabled &&
            customPanelGradientEnabled;
        customPanelGradientDirectionRow.visible = customPanelColorEnabled &&
            customPanelGradientEnabled;
        customPanelGradientDirectionRow.sensitive = !blocked &&
            !windowsXpThemeEnabled && customPanelColorEnabled &&
            customPanelGradientEnabled;
        customPanelColorRow.visible = customPanelColorEnabled;
        customPanelColorRow.sensitive = !blocked &&
            !windowsXpThemeEnabled &&
            customPanelColorEnabled;
        customPanelTextColorRow.visible = customPanelColorEnabled;
        customPanelTextColorRow.sensitive = !blocked &&
            !windowsXpThemeEnabled &&
            customPanelColorEnabled;
        customPanelTextColorRow.subtitle = blocked
            ? panelBlurTransparencySubtitle
            : customPanelTextColorSubtitle;
    };
    const syncPanelThemeControls = () => {
        const windowsXpThemeEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        themeGroup.sensitive = !windowsXpThemeEnabled;
        followSystemThemeSwitch.sensitive = !windowsXpThemeEnabled;
        panelThemeRow.sensitive = !windowsXpThemeEnabled &&
            !followSystemThemeSwitch.active;
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        () => {
            syncPanelThemeControls();
            updateCustomPanelColorControls();
        }
    );
    connectSettings(
        settings,
        'changed::panel-theme-follow-system',
        syncPanelThemeControls
    );
    syncPanelThemeControls();
    customPanelColorSwitch.connect(
        'notify::active',
        widget => {
            if (widget.active &&
                settings.get_boolean(
                    'panel-theme-follow-system'
                )) {
                settings.set_boolean(
                    'panel-theme-follow-system',
                    false
                );
            }
            updateCustomPanelColorControls();
        }
    );
    customPanelGradientSwitch.connect(
        'notify::active',
        updateCustomPanelColorControls
    );
    updateCustomPanelColorControls();

    const bordersGroup = appearancePage.addGroup({
        title: _('Borders'),
        description: _('Choose whether to show a border in light and dark themes'),
    });

    const darkPanelBorderSwitch = createSwitchRow(settings, {
        key: 'panel-border-enabled',
        title: _('Show Border in Dark Mode'),
        subtitle: _('Display a thin border along the taskbar’s workspace-facing edge'),
    });
    bordersGroup.add(darkPanelBorderSwitch);

    const lightPanelBorderSwitch = createSwitchRow(settings, {
        key: 'panel-border-light-enabled',
        title: _('Show Border in Light Mode'),
        subtitle: _('Display a thin border along the taskbar’s workspace-facing edge'),
    });
    bordersGroup.add(lightPanelBorderSwitch);
    const syncPanelBorderControls = () => {
        const enabled = !settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        bordersGroup.sensitive = enabled;
        darkPanelBorderSwitch.sensitive = enabled;
        lightPanelBorderSwitch.sensitive = enabled;
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncPanelBorderControls
    );
    syncPanelBorderControls();

    return {
        syncCustomColor: updateCustomPanelColorControls,
        syncTransparency: updatePanelTransparencyControls,
    };
}
