// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    ICON_VERTICAL_RESERVE,
    MIN_PANEL_HEIGHT,
    STANDARD_MIN_PANEL_HEIGHT,
} from '../shared/panelSizing.js';
import {
    applyWindowsXpThemeSettings,
    setWindowsXpThemeEnabled,
    WINDOWS_XP_ICON_SPACING,
} from '../shared/windowsXpTheme.js';
import {
    addColorRow,
    addComboRow,
    addSpinRow,
} from './preferencesWidgets.js';

export function addPanelAppearancePage({
    page,
    settings,
    connectSettings,
    createSettings,
    advancedAppearanceGroup,
    blurMyShellPanelBlurEnabled,
    windowsXpThemeSwitch,
    iconSizeRow,
    iconSpacingRow,
    panelButtonPaddingRow,
    defaultGnomePanelSwitch,
    appAlignmentRow,
    pinnedAppsAsLaunchersSwitch,
    combineAppButtonsRow,
    applicationOverflowSwitch,
    syncLabelSensitivity,
}) {
    const panelAppearanceGroup = new Adw.PreferencesGroup({
        title: _('Panel Appearance'),
        description: _('Change the taskbar height, colour scheme, and transparency.'),
    });
    page.add(panelAppearanceGroup);

    const panelHeightRow = addSpinRow(
        panelAppearanceGroup,
        settings,
        {
            key: 'panel-height',
            title: _('Panel Height'),
            subtitle: _(
                'Oversized icons shrink automatically when the panel is reduced'
            ),
            lower: MIN_PANEL_HEIGHT,
            upper: 80,
        },
        connectSettings
    );
    const panelPositionRow = addComboRow(
        panelAppearanceGroup,
        settings,
        {
            key: 'panel-position',
            title: _('Panel Position'),
            subtitle: _(
                'Place the taskbar at the top or bottom of the screen'
            ),
            choices: [
                {value: 'top', label: _('Top')},
                {value: 'bottom', label: _('Bottom')},
            ],
        },
        connectSettings
    );

    const fitPanelToIcons = () => {
        if (settings.get_boolean('default-gnome-panel') ||
            settings.get_boolean('windows-xp-theme-enabled')) {
            return;
        }

        const iconSize = settings.get_int('icon-size');
        const panelHeight = settings.get_int('panel-height');
        const minimumPanelHeight = iconSize + ICON_VERTICAL_RESERVE;
        if (panelHeight < minimumPanelHeight)
            settings.set_int('panel-height', minimumPanelHeight);
    };
    const fitIconsToPanel = () => {
        if (settings.get_boolean('default-gnome-panel') ||
            settings.get_boolean('windows-xp-theme-enabled')) {
            return;
        }

        const iconSize = settings.get_int('icon-size');
        const panelHeight = settings.get_int('panel-height');
        if (panelHeight < STANDARD_MIN_PANEL_HEIGHT) {
            settings.set_int(
                'panel-height',
                STANDARD_MIN_PANEL_HEIGHT
            );
            return;
        }
        const maximumIconSize = panelHeight - ICON_VERTICAL_RESERVE;
        if (iconSize > maximumIconSize)
            settings.set_int('icon-size', maximumIconSize);
    };
    connectSettings(settings, 'changed::icon-size', fitPanelToIcons);
    connectSettings(settings, 'changed::panel-height', fitIconsToPanel);

    let syncingWindowsXpTheme = false;
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
        syncingWindowsXpTheme = true;
        windowsXpThemeSwitch.active = enabled;
        panelHeightRow.get_adjustment().set_lower(
            enabled ? MIN_PANEL_HEIGHT : STANDARD_MIN_PANEL_HEIGHT
        );
        iconSpacingRow.get_adjustment().set_lower(
            enabled ? WINDOWS_XP_ICON_SPACING : 0
        );
        const iconSpacing = settings.get_int('icon-spacing');
        if (iconSpacingRow.get_value() !== iconSpacing)
            iconSpacingRow.set_value(iconSpacing);
        iconSizeRow.sensitive = !enabled;
        iconSpacingRow.sensitive = !enabled;
        panelButtonPaddingRow.sensitive = !enabled;
        panelHeightRow.sensitive = !enabled;
        panelPositionRow.sensitive = !enabled;
        defaultGnomePanelSwitch.sensitive = !enabled;
        appAlignmentRow.sensitive = !enabled;
        pinnedAppsAsLaunchersSwitch.sensitive = !enabled;
        combineAppButtonsRow.sensitive = true;
        applicationOverflowSwitch.sensitive = !enabled;
        syncLabelSensitivity();
        syncingWindowsXpTheme = false;
    };
    const setWindowsXpTheme = enabled => {
        const settings = createSettings();
        settings.delay();
        setWindowsXpThemeEnabled(settings, enabled);
        settings.apply();
    };
    windowsXpThemeSwitch.connect('notify::active', () => {
        if (syncingWindowsXpTheme)
            return;

        const enabled = windowsXpThemeSwitch.active;
        if (enabled === settings.get_boolean(
            'windows-xp-theme-enabled'
        )) {
            return;
        }
        setWindowsXpTheme(enabled);
        syncWindowsXpTheme();
    });
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncWindowsXpTheme
    );
    connectSettings(settings, 'changed::icon-size', syncWindowsXpTheme);
    connectSettings(settings, 'changed::icon-spacing', syncWindowsXpTheme);
    connectSettings(settings, 'changed::panel-height', syncWindowsXpTheme);
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
        'changed::application-overflow-enabled',
        syncWindowsXpTheme
    );
    connectSettings(
        settings,
        'changed::hide-app-labels',
        syncWindowsXpTheme
    );
    syncWindowsXpTheme();
    fitPanelToIcons();

    const followSystemThemeSwitch = new Adw.SwitchRow({
        title: _('Follow System Theme'),
        subtitle: _('Match the active GNOME Shell theme, independently of application colours'),
        active: settings.get_boolean('panel-theme-follow-system'),
    });
    panelAppearanceGroup.add(followSystemThemeSwitch);
    settings.bind(
        'panel-theme-follow-system',
        followSystemThemeSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const panelThemeRow = addComboRow(
        panelAppearanceGroup,
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
    panelThemeRow.sensitive = !followSystemThemeSwitch.active;
    followSystemThemeSwitch.connect('notify::active', widget => {
        panelThemeRow.sensitive = !widget.active;
        if (widget.active)
            settings.set_boolean(
                'custom-panel-color-enabled',
                false
            );
    });

    const transparencySwitchSubtitle = _(
        'Make the taskbar background transparent'
    );
    const panelBlurTransparencySubtitle = _(
        'Disable Blur My Shell panel blur to use this option'
    );
    const transparencySwitch = new Adw.SwitchRow({
        title: _('Enable Transparency'),
        subtitle: transparencySwitchSubtitle,
        active: settings.get_boolean('transparency-enabled'),
    });
    panelAppearanceGroup.add(transparencySwitch);
    settings.bind(
        'transparency-enabled',
        transparencySwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const transparencyRowSubtitle = _(
        '0% is opaque and 100% is fully transparent'
    );
    const transparencyRow = addSpinRow(
        panelAppearanceGroup,
        settings,
        {
            key: 'transparency-level',
            title: _('Transparency'),
            subtitle: transparencyRowSubtitle,
            lower: 0,
            upper: 100,
        },
        connectSettings
    );
    const updatePanelTransparencyControls = () => {
        const blocked = blurMyShellPanelBlurEnabled();
        const windowsXpThemeEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
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
    };
    transparencySwitch.connect(
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
    const customPanelColorSwitch = new Adw.SwitchRow({
        title: _('Custom Taskbar Color'),
        subtitle: customPanelColorSubtitle,
        active: settings.get_boolean(
            'custom-panel-color-enabled'
        ),
    });
    advancedAppearanceGroup.add(customPanelColorSwitch);
    settings.bind(
        'custom-panel-color-enabled',
        customPanelColorSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const customPanelColorRow = addColorRow(
        advancedAppearanceGroup,
        settings,
        {
            key: 'custom-panel-color',
            title: _('Taskbar Color'),
        },
        connectSettings
    );
    const customPanelTextColorSubtitle = _(
        'White text uses the dark panel theme; black text uses the light panel theme'
    );
    const customPanelTextColorRow = addComboRow(
        advancedAppearanceGroup,
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
    customPanelTextColorRow.connect('notify::selected', () => {
        if (settings.get_boolean('panel-theme-follow-system')) {
            settings.set_boolean(
                'panel-theme-follow-system',
                false
            );
        }
    });
    const updateCustomPanelColorControls = () => {
        const blocked = blurMyShellPanelBlurEnabled();
        const windowsXpThemeEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        customPanelColorSwitch.sensitive = !blocked &&
            !windowsXpThemeEnabled;
        customPanelColorSwitch.subtitle = blocked
            ? panelBlurTransparencySubtitle
            : customPanelColorSubtitle;
        customPanelColorRow.visible = customPanelColorSwitch.active;
        customPanelColorRow.sensitive = !blocked &&
            !windowsXpThemeEnabled &&
            customPanelColorSwitch.active;
        customPanelTextColorRow.visible = customPanelColorSwitch.active;
        customPanelTextColorRow.sensitive = !blocked &&
            !windowsXpThemeEnabled &&
            customPanelColorSwitch.active;
        customPanelTextColorRow.subtitle = blocked
            ? panelBlurTransparencySubtitle
            : customPanelTextColorSubtitle;
    };
    const syncPanelThemeControls = () => {
        const windowsXpThemeEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
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
    updateCustomPanelColorControls();

    const darkPanelBorderSwitch = new Adw.SwitchRow({
        title: _('Show Border in Dark Mode'),
        subtitle: _('Display a thin border along the panel’s workspace-facing edge'),
        active: settings.get_boolean('panel-border-enabled'),
    });
    panelAppearanceGroup.add(darkPanelBorderSwitch);
    settings.bind(
        'panel-border-enabled',
        darkPanelBorderSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const lightPanelBorderSwitch = new Adw.SwitchRow({
        title: _('Show Border in Light Mode'),
        subtitle: _('Display a thin border along the panel’s workspace-facing edge'),
        active: settings.get_boolean(
            'panel-border-light-enabled'
        ),
    });
    panelAppearanceGroup.add(lightPanelBorderSwitch);
    settings.bind(
        'panel-border-light-enabled',
        lightPanelBorderSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const syncPanelBorderControls = () => {
        const enabled = !settings.get_boolean(
            'windows-xp-theme-enabled'
        );
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
