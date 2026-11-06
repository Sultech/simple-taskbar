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
    taskbarGeometryEnabled,
} from '../shared/panelModeSettings.js';
import {createSwitchExpanderRow} from './preferencesWidgets.js';
import {
    addBordersGroup,
    addCustomColorRows,
    addThemeRows,
    addTransparencyRows,
} from './panelPreferenceRows.js';
import {createPanelThicknessSizing} from './panelThicknessSizing.js';
import {addChoiceCards, drawTaskbarEdge, edgeChoices} from './choiceCards.js';
import {addSliderRow} from './sliderRow.js';
import {addFloatingPanelRow} from './floatingPanelRow.js';

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
    addFloatingPanelRow(layoutGroup, settings, connectSettings, false);
    const sidePaddingRow = addSliderRow(layoutGroup, settings, {
        key: 'taskbar-side-padding',
        unit: 'px',
        title: _('Side Padding'),
        subtitle: _('Space inside both ends of the dynamic or floating taskbar'),
        lower: 0,
        upper: 64,
    }, connectSettings);
    const fullWidthSidePaddingRow = addSliderRow(layoutGroup, settings, {
        key: 'taskbar-full-width-side-padding',
        unit: 'px',
        title: _('Side Padding'),
        subtitle: _('Space inside both ends of the full-width taskbar'),
        lower: 0,
        upper: 64,
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
        const geometryEnabled = taskbarGeometryEnabled(settings);
        sidePaddingRow.visible = geometryEnabled;
        fullWidthSidePaddingRow.visible = !geometryEnabled;
        cornerRadiusRow.sensitive = geometryEnabled;
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

    const blockedText = _('Disable Blur My Shell panel blur to use this option');
    const windowsXpEnabled = () => settings.get_boolean('windows-xp-theme-enabled');
    const {followSwitch: followSystemThemeSwitch, themeRow: panelThemeRow} = addThemeRows(
        themeGroup, settings, connectSettings, {
            keyPrefix: '',
            followSubtitle: _('Match the active GNOME Shell theme, independently of application colours'),
            themeTitle: _('Taskbar Theme'),
            onFollowChanged: () => syncPanelThemeControls(),
        });

    const transparencyGroup = appearancePage.addGroup({
        title: _('Transparency'),
        description: _('Control the taskbar background transparency'),
    });
    const transparency = addTransparencyRows(transparencyGroup, settings, connectSettings, {
        keyPrefix: '',
        switchSubtitle: _('Make the taskbar background transparent'),
        optionsTitle: _('Dynamic Transparency Options'),
        onChanged: () => updatePanelTransparencyControls(),
    });
    const updatePanelTransparencyControls = () => {
        transparencyGroup.sensitive = !windowsXpEnabled();
        transparency.sync(!windowsXpEnabled(), blurMyShellPanelBlurEnabled(), blockedText);
    };
    connectSettings(settings, 'changed::windows-xp-theme-enabled', updatePanelTransparencyControls);
    updatePanelTransparencyControls();

    const customColor = addCustomColorRows(themeGroup, settings, connectSettings, {
        keyPrefix: '',
        switchTitle: _('Custom Taskbar Color'),
        colorTitle: _('Taskbar Color'),
        gradientTitle: _('Use Taskbar Gradient'),
        gradientSubtitle: _('Blend the taskbar color with a second color'),
        gradientColorTitle: _('Taskbar Gradient Color'),
        gradientDirectionTitle: _('Taskbar Gradient Direction'),
        textColorTitle: _('Taskbar Text Color'),
        textColorSubtitle: _('White text uses the dark taskbar theme; black text uses the light taskbar theme'),
        onChanged: () => updateCustomPanelColorControls(),
    });
    const updateCustomPanelColorControls = () =>
        customColor.sync(!windowsXpEnabled(), blurMyShellPanelBlurEnabled(), blockedText);
    const syncPanelThemeControls = () => {
        themeGroup.sensitive = !windowsXpEnabled();
        followSystemThemeSwitch.sensitive = !windowsXpEnabled();
        panelThemeRow.sensitive = !windowsXpEnabled() && !followSystemThemeSwitch.active;
    };
    connectSettings(settings, 'changed::windows-xp-theme-enabled', () => {
        syncPanelThemeControls();
        updateCustomPanelColorControls();
    });
    connectSettings(settings, 'changed::panel-theme-follow-system', syncPanelThemeControls);
    syncPanelThemeControls();
    updateCustomPanelColorControls();

    const bordersGroup = addBordersGroup(appearancePage, settings, {
        keyPrefix: '',
        subtitle: _('Display a thin border along the taskbar’s workspace-facing edge'),
    });
    const syncPanelBorderControls = () => {
        bordersGroup.sensitive = !windowsXpEnabled();
    };
    connectSettings(settings, 'changed::windows-xp-theme-enabled', syncPanelBorderControls);
    syncPanelBorderControls();

    return {
        syncCustomColor: updateCustomPanelColorControls,
        syncTransparency: updatePanelTransparencyControls,
    };
}
