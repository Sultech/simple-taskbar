// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    createSwitchExpanderRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {
    addBordersGroup,
    addCustomColorRows,
    addThemeRows,
    addTransparencyRows,
} from './panelPreferenceRows.js';
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
import {addFloatingPanelRow} from './floatingPanelRow.js';
import {DOCK_FLOATING_KEYS, dockFloatingEnabled} from '../shared/panelModeSettings.js';

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

    addFloatingPanelRow(group, settings, connectSettings, true);
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
    const fullWidthSidePaddingRow = addSliderRow(group, settings, {
        key: 'dock-full-width-side-padding',
        unit: 'px',
        title: _('Side Padding'),
        subtitle: _('Space inside both ends of the full-width Dock'),
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

    const {followSwitch: followSystemThemeSwitch, themeRow: dockThemeRow} = addThemeRows(
        themeGroup, settings, connectSettings, {
            keyPrefix: 'dock-',
            followSubtitle: _('Match the active GNOME Shell theme'),
            themeTitle: _('Dock Theme'),
            onFollowChanged: () => {
                syncThemeControls();
                syncCustomColorControls();
            },
        });

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
        sidePaddingRow.visible = enabled;
        fullWidthSidePaddingRow.visible = !enabled;
        cornerRadiusRow.sensitive = enabled;
    };
    for (const key of DOCK_FLOATING_KEYS)
        connectSettings(settings, `changed::${key}`, syncLayoutControls);
    syncLayoutControls();

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

    const dockPanelBlurSwitch = createSwitchRow(settings, {
        key: 'dock-panel-blur-enabled',
        title: _('Blur Dock with Blur My Shell'),
        subtitle: dockBlurSubtitles.panel.blur,
    });
    const transparency = addTransparencyRows(transparencyGroup, settings, connectSettings, {
        keyPrefix: 'dock-',
        switchSubtitle: _('Make the Dock background transparent'),
        optionsTitle: _('Dock Dynamic Transparency Options'),
        addAfterSwitch: () => transparencyGroup.add(dockPanelBlurSwitch),
        onChanged: () => syncTransparencyControls(),
    });

    const customColor = addCustomColorRows(themeGroup, settings, connectSettings, {
        keyPrefix: 'dock-',
        switchTitle: _('Custom Dock Color'),
        colorTitle: _('Dock Color'),
        gradientTitle: _('Use Dock Gradient'),
        gradientSubtitle: _('Blend the Dock color with a second color'),
        gradientColorTitle: _('Dock Gradient Color'),
        gradientDirectionTitle: _('Dock Gradient Direction'),
        textColorTitle: _('Dock Text Color'),
        textColorSubtitle: _('White text uses the dark Dock theme; black text uses the light Dock theme'),
        onChanged: () => {
            syncThemeControls();
            syncCustomColorControls();
        },
    });

    const bordersGroup = addBordersGroup(appearancePage, settings, {
        keyPrefix: 'dock-',
        subtitle: _('Display a thin border along the Dock’s workspace-facing edge'),
    });

    const syncThemeControls = () => {
        const available = dockAvailable();
        followSystemThemeSwitch.sensitive = available;
        dockThemeRow.sensitive = available &&
            !followSystemThemeSwitch.active;
    };
    const syncTransparencyControls = () => {
        const blocked = dockBlurBlocksAppearance();
        const available = dockAvailable();
        const {blur: blurSubtitle, blocked: blockedText} = dockBlurSubtitles[dockBlurMode()];
        dockPanelBlurSwitch.sensitive = available && dockBlurAvailable();
        dockPanelBlurSwitch.subtitle = blurSubtitle;
        transparency.sync(available, blocked, blockedText);
    };
    const syncCustomColorControls = () => customColor.sync(
        dockAvailable(),
        dockBlurBlocksAppearance(),
        dockBlurSubtitles[dockBlurMode()].blocked
    );
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
