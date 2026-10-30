// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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
import {
    MAX_PANEL_HEIGHT,
    MIN_PANEL_HEIGHT,
} from '../shared/panelSizing.js';
import {
    bindThicknessLowerBound,
    createPanelThicknessSizing,
} from './panelThicknessSizing.js';
import {
    setDockPosition,
    setPanelPosition,
} from '../shared/panelModeProfiles.js';
import {alternativePanelPosition} from '../shared/panelPositionUtils.js';
import {addChoiceCards, drawDockEdge, edgeChoices} from './choiceCards.js';
import {addSliderRow} from './sliderRow.js';
import {DOCK_FLOATING_KEYS, dockFloatingEnabled} from '../shared/taskbarPanelModes.js';

const DOCK_PANEL_HEIGHT_KEY = 'dock-panel-height';
const DOCK_PANEL_HEIGHT_FOLLOW_KEY = 'dock-panel-height-follow-icon-size';

function addDockPlacementRows(positionGroup, group, settings, connectSettings, createSettings) {
    const syncPanelPositionConflict = () => {
        if (!settings.get_boolean('dock-mode'))
            return;

        const panelPosition = settings.get_string('panel-position');
        if (settings.get_string('dock-position') !== panelPosition)
            return;

        setDockPosition(
            settings,
            alternativePanelPosition(panelPosition)
        );
    };
    const syncDockPositionConflict = () => {
        if (!settings.get_boolean('dock-mode'))
            return;

        const dockPosition = settings.get_string('dock-position');
        if (settings.get_string('panel-position') !== dockPosition)
            return;

        const panelSettings = createSettings();
        panelSettings.delay();
        setPanelPosition(
            panelSettings,
            alternativePanelPosition(dockPosition)
        );
        panelSettings.apply();
    };
    syncPanelPositionConflict();
    const panelEdge = () => settings.get_string('panel-position');
    const dockShape = () => ({
        short: !settings.get_boolean('dock-panel-mode'),
        floating: dockFloatingEnabled(settings),
    });
    const positionCards = addChoiceCards(positionGroup, {
        choices: edgeChoices(edge => drawDockEdge(edge, panelEdge, dockShape)),
        onSelected: position => setDockPosition(settings, position),
        connectSettings,
    });
    const syncPositionCards = () => {
        positionCards.setActive(settings.get_string('dock-position'));
    };
    connectSettings(settings, 'changed::dock-position', syncPositionCards);
    syncPositionCards();
    for (const key of ['panel-position', ...DOCK_FLOATING_KEYS])
        connectSettings(settings, `changed::${key}`, positionCards.redraw);
    connectSettings(settings, 'changed::panel-position', syncPanelPositionConflict);
    connectSettings(settings, 'changed::dock-mode', syncPanelPositionConflict);
    connectSettings(settings, 'changed::dock-position', syncDockPositionConflict);

    const dockShapeExpander = createSwitchExpanderRow(settings, {
        title: _('Dynamic Dock'),
        subtitle: _('Size the Dock to its contents; turn off for a full-width Dock'),
        getKey: () => 'dock-panel-mode',
        inverted: true,
    }, connectSettings);
    group.add(dockShapeExpander);
    const addDockShapeRow = row => dockShapeExpander.add_row(row);
    addSliderRow(null, settings, {
        key: 'dock-max-length',
        unit: '%',
        title: _('Maximum Dock Length'),
        subtitle: _('Limit the Dock to this percentage of the monitor length'),
        lower: 1,
        upper: 90,
        addRow: addDockShapeRow,
    }, connectSettings);
    addSliderRow(null, settings, {
        key: 'dock-highlight-edge-gap',
        unit: 'px',
        title: _('Highlight Edge Gap'),
        subtitle: _('Space between the highlight and the edges of the Dock'),
        lower: 0,
        upper: 16,
        addRow: addDockShapeRow,
    }, connectSettings);

    const floatingExpander = createSwitchExpanderRow(settings, {
        title: _('Floating Dock'),
        subtitle: _('Add a small screen-edge gap that closes for maximized windows'),
        getKey: () => settings.get_boolean('dock-panel-mode')
            ? 'dock-panel-mode-floating'
            : 'dock-floating',
        keyChangedKey: 'dock-panel-mode',
    }, connectSettings);
    group.add(floatingExpander);
    addSliderRow(null, settings, {
        key: 'dock-floating-gap',
        unit: 'px',
        title: _('Floating Gap'),
        subtitle: _('Distance between the floating Dock and the screen edge'),
        lower: 1,
        upper: 32,
        addRow: row => floatingExpander.add_row(row),
    }, connectSettings);
}

export function addDockAppearanceGroup({
    sizePage,
    appearancePage,
    settings,
    connectSettings,
    createSettings,
    blurMyShellPanelBlurEnabled,
    blurMyShellDockBlurEnabled,
}) {
    const positionGroup = sizePage.addGroup({
        title: _('Dock Position'),
        description: _('Place the Dock at a different screen edge from the taskbar'),
    });
    const thicknessGroup = sizePage.addGroup({
        title: _('Thickness'),
        description: _('Choose how thick the Dock is when Dynamic Dock is off'),
    });
    const group = sizePage.addGroup({
        title: _('Dock Layout'),
        description: _('Choose the Dock length, floating and corners'),
    });
    addDockPlacementRows(positionGroup, group, settings, connectSettings, createSettings);
    const sidePaddingRow = addSliderRow(group, settings, {
        key: 'dock-side-padding',
        unit: 'px',
        title: _('Side Padding'),
        subtitle: _('Space inside both ends of the Dock'),
        lower: 0,
        upper: 64,
    }, connectSettings);

    const dockAvailable = () => settings.get_boolean('dock-mode') &&
        !settings.get_boolean('windows-xp-theme-enabled');

    const {
        followSwitch: dockPanelHeightFollowSwitch,
        followsIcons: dockPanelHeightFollowsIcons,
    } = createPanelThicknessSizing(settings, connectSettings, {
        heightKey: DOCK_PANEL_HEIGHT_KEY,
        followKey: DOCK_PANEL_HEIGHT_FOLLOW_KEY,
        followSubtitle: _(
            'Keep the Dock only as thick as its icons need'
        ),
        isActive: () => settings.get_boolean('dock-mode'),
    });
    thicknessGroup.add(dockPanelHeightFollowSwitch);

    const dockPanelHeightRow = addSliderRow(
        thicknessGroup,
        settings,
        {
            key: DOCK_PANEL_HEIGHT_KEY,
            title: _('Dock Thickness'),
            subtitle: _(
                'Oversized icons shrink automatically when the Dock is made thinner'
            ),
            lower: MIN_PANEL_HEIGHT,
            upper: MAX_PANEL_HEIGHT,
        },
        connectSettings
    );
    bindThicknessLowerBound(settings, connectSettings, dockPanelHeightRow);

    const themeGroup = appearancePage.addGroup({
        title: _('Theme and Styling'),
        description: _(
            'Choose the Dock theme, colours, gradient, and text appearance'
        ),
    });

    const followSystemThemeSwitch = createSwitchRow(settings, {
        key: 'dock-panel-theme-follow-system',
        title: _('Follow System Theme'),
        subtitle: _('Match the active GNOME Shell theme'),
    });
    themeGroup.add(followSystemThemeSwitch);

    const dockThemeRow = addToggleChoiceRow(
        themeGroup,
        settings,
        {
            key: 'dock-panel-theme',
            title: _('Dock Theme'),
            subtitle: _('Choose the colour scheme when system matching is off'),
            choices: [
                {value: 'light', label: _('Light')},
                {value: 'dark', label: _('Dark')},
            ],
        },
        connectSettings
    );

    const cornerRadiusRow = addSliderRow(
        group,
        settings,
        {
            key: 'dock-corner-radius',
            title: _('Dock Corner Radius'),
            subtitle: _(
                'Applies to the floating Dock, including Dynamic and Static Blur'
            ),
            lower: 0,
            upper: 64,
        },
        connectSettings
    );
    const syncLayoutControls = () => {
        const enabled = !settings.get_boolean('dock-panel-mode') ||
            dockFloatingEnabled(settings);
        sidePaddingRow.sensitive = enabled;
        cornerRadiusRow.sensitive = enabled;
    };
    for (const key of DOCK_FLOATING_KEYS)
        connectSettings(settings, `changed::${key}`, syncLayoutControls);
    syncLayoutControls();

    const transparencySwitchSubtitle = _(
        'Make the Dock background transparent'
    );
    const dynamicTransparencySubtitle = _(
        'Adjust transparency according to the selected window state'
    );
    const dockBlurSubtitles = {
        panel: {
            blur: _('Apply Blur My Shell panel blur to the Dock'),
            blocked: _('Disable Blur My Shell panel blur to use this option'),
        },
        dock: {
            blur: _('Apply Blur My Shell dock blur to the Dock'),
            blocked: _('Disable Blur My Shell dock blur to use this option'),
        },
        none: {
            blur: _('This Blur My Shell version cannot blur the Dock'),
            blocked: '',
        },
    };
    const dockBlurMode = () => settings.get_string('blur-my-shell-dock-mode');
    const dockBlurAvailable = () => {
        const mode = dockBlurMode();
        if (mode === 'dock')
            return blurMyShellDockBlurEnabled();
        return mode === 'panel' && blurMyShellPanelBlurEnabled();
    };
    const dockBlurBlocksAppearance = () =>
        settings.get_boolean('dock-panel-blur-enabled') && dockBlurAvailable();
    const transparencyGroup = appearancePage.addGroup({
        title: _('Transparency and Blur'),
        description: _('Configure Dock transparency and Blur My Shell integration'),
    });

    const transparencySwitch = createSwitchRow(settings, {
        key: 'dock-transparency-enabled',
        title: _('Enable Transparency'),
        subtitle: transparencySwitchSubtitle,
    });
    transparencyGroup.add(transparencySwitch);
    const dockPanelBlurSwitch = createSwitchRow(settings, {
        key: 'dock-panel-blur-enabled',
        title: _('Blur Dock with Blur My Shell'),
        subtitle: dockBlurSubtitles.panel.blur,
    });
    transparencyGroup.add(dockPanelBlurSwitch);

    const transparencyRowSubtitle = _(
        '0% is opaque and 100% is fully transparent'
    );
    const transparencyRow = addSliderRow(
        transparencyGroup,
        settings,
        {
            key: 'dock-transparency-level',
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
            title: _('Dock Dynamic Transparency Options'),
            behaviorKey: 'dock-transparency-dynamic-behavior',
            distanceKey: 'dock-transparency-dynamic-distance',
            levelKey: 'dock-transparency-dynamic-level',
            animationTimeKey: 'dock-transparency-dynamic-animation-time',
        });
    const {
        row: dynamicTransparencyRow,
        toggle: dynamicTransparencyToggle,
    } = addSwitchRow(transparencyGroup, settings, {
        key: 'dock-transparency-on-unmaximized',
        title: _('Dynamic Transparency'),
        subtitle: dynamicTransparencySubtitle,
        addSuffix: row => row.add_suffix(dynamicTransparencyOptionsButton),
    });

    const customPanelColorSubtitle = _(
        'Use a chosen color instead of the light or dark theme color'
    );
    const customPanelColorSwitch = createSwitchRow(settings, {
        key: 'dock-custom-panel-color-enabled',
        title: _('Custom Dock Color'),
        subtitle: customPanelColorSubtitle,
    });
    themeGroup.add(customPanelColorSwitch);

    const customPanelColorRow = addColorRow(
        themeGroup,
        settings,
        {
            key: 'dock-custom-panel-color',
            title: _('Dock Color'),
        },
        connectSettings
    );
    const customPanelGradientSwitch = createSwitchRow(settings, {
        key: 'dock-custom-panel-gradient-enabled',
        title: _('Use Dock Gradient'),
        subtitle: _('Blend the Dock color with a second color'),
    });
    themeGroup.add(customPanelGradientSwitch);
    const customPanelGradientColorRow = addColorRow(
        themeGroup,
        settings,
        {
            key: 'dock-custom-panel-gradient-color',
            title: _('Dock Gradient Color'),
        },
        connectSettings
    );
    const customPanelGradientDirectionRow = addToggleChoiceRow(
        themeGroup,
        settings,
        {
            key: 'dock-custom-panel-gradient-direction',
            title: _('Dock Gradient Direction'),
            subtitle: _('Choose how the gradient flows'),
            choices: [
                {value: 'vertical', label: _('Vertical')},
                {value: 'horizontal', label: _('Horizontal')},
            ],
        },
        connectSettings
    );
    const customPanelTextColorSubtitle = _(
        'White text uses the dark Dock theme; black text uses the light Dock theme'
    );
    const customPanelTextColorRow = addToggleChoiceRow(
        themeGroup,
        settings,
        {
            key: 'dock-panel-theme',
            title: _('Dock Text Color'),
            subtitle: customPanelTextColorSubtitle,
            choices: [
                {value: 'dark', label: _('White')},
                {value: 'light', label: _('Black')},
            ],
        },
        connectSettings
    );

    const bordersGroup = appearancePage.addGroup({
        title: _('Borders'),
        description: _('Choose whether to show a border in light and dark themes'),
    });

    const darkPanelBorderSwitch = createSwitchRow(settings, {
        key: 'dock-panel-border-enabled',
        title: _('Show Border in Dark Mode'),
        subtitle: _('Display a thin border along the Dock’s workspace-facing edge'),
    });
    bordersGroup.add(darkPanelBorderSwitch);

    const lightPanelBorderSwitch = createSwitchRow(settings, {
        key: 'dock-panel-border-light-enabled',
        title: _('Show Border in Light Mode'),
        subtitle: _('Display a thin border along the Dock’s workspace-facing edge'),
    });
    bordersGroup.add(lightPanelBorderSwitch);

    const syncThemeControls = () => {
        const available = dockAvailable();
        followSystemThemeSwitch.sensitive = available;
        dockThemeRow.sensitive = available &&
            !followSystemThemeSwitch.active;
    };
    const syncTransparencyControls = () => {
        const blocked = dockBlurBlocksAppearance();
        const available = dockAvailable();
        const {blur: blurSubtitle, blocked: blockedSubtitle} =
            dockBlurSubtitles[dockBlurMode()];
        dockPanelBlurSwitch.sensitive = available && dockBlurAvailable();
        dockPanelBlurSwitch.subtitle = blurSubtitle;
        transparencySwitch.sensitive = available && !blocked;
        transparencySwitch.subtitle = blocked
            ? blockedSubtitle
            : transparencySwitchSubtitle;
        transparencyRow.sensitive = available &&
            !blocked && transparencySwitch.active;
        transparencyRow.subtitle = blocked
            ? blockedSubtitle
            : transparencyRowSubtitle;
        dynamicTransparencyRow.sensitive = available && !blocked;
        dynamicTransparencyRow.subtitle = blocked
            ? blockedSubtitle
            : dynamicTransparencySubtitle;
        dynamicTransparencyOptionsButton.sensitive = available &&
            !blocked && dynamicTransparencyToggle.active;
    };
    const syncCustomColorControls = () => {
        const blocked = dockBlurBlocksAppearance();
        const {blocked: blockedSubtitle} = dockBlurSubtitles[dockBlurMode()];
        if (blocked &&
            settings.get_boolean('dock-custom-panel-color-enabled')) {
            settings.set_boolean(
                'dock-custom-panel-color-enabled',
                false
            );
        }
        const available = dockAvailable();
        const enabled = customPanelColorSwitch.active;
        const gradientEnabled = settings.get_boolean(
            'dock-custom-panel-gradient-enabled'
        );
        customPanelColorSwitch.sensitive = available && !blocked;
        customPanelColorSwitch.subtitle = blocked
            ? blockedSubtitle
            : customPanelColorSubtitle;
        customPanelGradientSwitch.visible = enabled;
        customPanelGradientSwitch.sensitive = available &&
            !blocked && enabled;
        customPanelGradientColorRow.visible = enabled && gradientEnabled;
        customPanelGradientColorRow.sensitive = available &&
            !blocked && enabled && gradientEnabled;
        customPanelGradientDirectionRow.visible = enabled &&
            gradientEnabled;
        customPanelGradientDirectionRow.sensitive = available &&
            !blocked && enabled && gradientEnabled;
        customPanelColorRow.visible = enabled;
        customPanelColorRow.sensitive = available &&
            !blocked && enabled;
        customPanelTextColorRow.visible = enabled;
        customPanelTextColorRow.sensitive = available &&
            !blocked && enabled;
        customPanelTextColorRow.subtitle = blocked
            ? blockedSubtitle
            : customPanelTextColorSubtitle;
    };
    const groups = [positionGroup, thicknessGroup, group, themeGroup, transparencyGroup, bordersGroup];
    const syncAvailability = () => {
        const available = dockAvailable();
        for (const availableGroup of groups)
            availableGroup.sensitive = available;
        const fullWidthDock = settings.get_boolean('dock-panel-mode');
        dockPanelHeightFollowSwitch.sensitive = fullWidthDock;
        dockPanelHeightRow.sensitive = fullWidthDock &&
            !dockPanelHeightFollowsIcons();
        syncThemeControls();
        syncTransparencyControls();
        syncCustomColorControls();
    };

    followSystemThemeSwitch.connect('notify::active', widget => {
        if (widget.active)
            settings.set_boolean('dock-custom-panel-color-enabled', false);
        syncThemeControls();
        syncCustomColorControls();
    });
    transparencySwitch.connect(
        'notify::active',
        syncTransparencyControls
    );
    dynamicTransparencyToggle.connect(
        'notify::active',
        syncTransparencyControls
    );
    customPanelColorSwitch.connect('notify::active', widget => {
        if (widget.active &&
            settings.get_boolean('dock-panel-theme-follow-system')) {
            settings.set_boolean('dock-panel-theme-follow-system', false);
        }
        syncThemeControls();
        syncCustomColorControls();
    });
    customPanelGradientSwitch.connect(
        'notify::active',
        syncCustomColorControls
    );

    for (const key of [
        'dock-mode',
        'dock-panel-mode',
        DOCK_PANEL_HEIGHT_FOLLOW_KEY,
        'windows-xp-theme-enabled',
    ]) {
        connectSettings(settings, `changed::${key}`, syncAvailability);
    }
    connectSettings(
        settings,
        'changed::dock-panel-theme-follow-system',
        syncThemeControls
    );
    connectSettings(
        settings,
        'changed::dock-custom-panel-color-enabled',
        syncCustomColorControls
    );
    connectSettings(
        settings,
        'changed::dock-transparency-enabled',
        syncTransparencyControls
    );
    for (const key of ['dock-panel-blur-enabled', 'blur-my-shell-dock-mode']) {
        connectSettings(settings, `changed::${key}`, () => {
            syncTransparencyControls();
            syncCustomColorControls();
        });
    }
    syncAvailability();

    return {
        syncTransparency: syncTransparencyControls,
        syncCustomColor: syncCustomColorControls,
    };
}
