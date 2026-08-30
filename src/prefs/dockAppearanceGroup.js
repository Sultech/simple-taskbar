// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addColorRow,
    addComboRow,
    addSpinRow,
    createSwitchRow,
} from './preferencesWidgets.js';

export function addDockAppearanceGroup({
    page,
    settings,
    connectSettings,
    blurMyShellPanelBlurEnabled,
    dockModeGroup,
    dockPositionRow,
    dockMaxLengthRow,
}) {
    const group = new Adw.PreferencesGroup({
        title: _('Dock Appearance'),
        description: _('Configure the Dock independently of the main panel.'),
    });
    page.add(group);
    dockModeGroup.remove(dockMaxLengthRow);
    dockModeGroup.remove(dockPositionRow);
    group.add(dockMaxLengthRow);
    group.add(dockPositionRow);

    const dockAvailable = () => settings.get_boolean('dock-mode') &&
        !settings.get_boolean('windows-xp-theme-enabled');

    const themeExpander = new Adw.ExpanderRow({
        title: _('Theme'),
        subtitle: _('Choose the Dock colour scheme'),
    });
    group.add(themeExpander);

    const followSystemThemeSwitch = new Adw.SwitchRow({
        title: _('Follow System Theme'),
        subtitle: _('Match the active GNOME Shell theme'),
        active: settings.get_boolean('dock-panel-theme-follow-system'),
    });
    themeExpander.add_row(followSystemThemeSwitch);
    settings.bind(
        'dock-panel-theme-follow-system',
        followSystemThemeSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const dockThemeRow = addComboRow(
        themeExpander,
        settings,
        {
            key: 'dock-panel-theme',
            title: _('Dock Theme'),
            subtitle: _('Choose the colour scheme when system matching is off'),
            choices: [
                {value: 'light', label: _('Light')},
                {value: 'dark', label: _('Dark')},
            ],
            addRow: row => themeExpander.add_row(row),
        },
        connectSettings
    );

    addSpinRow(
        themeExpander,
        settings,
        {
            key: 'dock-corner-radius',
            title: _('Dock Corner Radius'),
            subtitle: _(
                'Applies to the floating Dock without blur and with Dynamic Blur; Static Blur is not supported'
            ),
            lower: 0,
            upper: 64,
            addRow: row => themeExpander.add_row(row),
        },
        connectSettings
    );

    const transparencySwitchSubtitle = _(
        'Make the Dock background transparent'
    );
    const panelBlurTransparencySubtitle = _(
        'Disable Blur My Shell panel blur to use this option'
    );
    const transparencyExpander = new Adw.ExpanderRow({
        title: _('Transparency'),
        subtitle: _('Control the Dock background transparency'),
    });
    group.add(transparencyExpander);

    const transparencySwitch = new Adw.SwitchRow({
        title: _('Enable Transparency'),
        subtitle: transparencySwitchSubtitle,
        active: settings.get_boolean('dock-transparency-enabled'),
    });
    transparencyExpander.add_row(transparencySwitch);
    settings.bind(
        'dock-transparency-enabled',
        transparencySwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const dockPanelBlurSwitch = createSwitchRow(settings, {
        key: 'dock-panel-blur-enabled',
        title: _('Blur Dock with Blur My Shell'),
        subtitle: _('Apply Blur My Shell panel blur to the Dock'),
    });
    transparencyExpander.add_row(dockPanelBlurSwitch);

    const transparencyRowSubtitle = _(
        '0% is opaque and 100% is fully transparent'
    );
    const transparencyRow = addSpinRow(
        transparencyExpander,
        settings,
        {
            key: 'dock-transparency-level',
            title: _('Transparency'),
            subtitle: transparencyRowSubtitle,
            lower: 0,
            upper: 100,
            addRow: row => transparencyExpander.add_row(row),
        },
        connectSettings
    );

    const customPanelColorSubtitle = _(
        'Use a chosen color instead of the light or dark theme color'
    );
    const customPanelColorSwitch = new Adw.SwitchRow({
        title: _('Custom Dock Color'),
        subtitle: customPanelColorSubtitle,
        active: settings.get_boolean('dock-custom-panel-color-enabled'),
    });
    themeExpander.add_row(customPanelColorSwitch);
    settings.bind(
        'dock-custom-panel-color-enabled',
        customPanelColorSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const customPanelColorRow = addColorRow(
        themeExpander,
        settings,
        {
            key: 'dock-custom-panel-color',
            title: _('Dock Color'),
            addRow: row => themeExpander.add_row(row),
        },
        connectSettings
    );
    const customPanelGradientSwitch = new Adw.SwitchRow({
        title: _('Use Dock Gradient'),
        subtitle: _('Blend the Dock color with a second color'),
        active: settings.get_boolean(
            'dock-custom-panel-gradient-enabled'
        ),
    });
    themeExpander.add_row(customPanelGradientSwitch);
    settings.bind(
        'dock-custom-panel-gradient-enabled',
        customPanelGradientSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const customPanelGradientColorRow = addColorRow(
        themeExpander,
        settings,
        {
            key: 'dock-custom-panel-gradient-color',
            title: _('Dock Gradient Color'),
            addRow: row => themeExpander.add_row(row),
        },
        connectSettings
    );
    const customPanelGradientDirectionRow = addComboRow(
        themeExpander,
        settings,
        {
            key: 'dock-custom-panel-gradient-direction',
            title: _('Dock Gradient Direction'),
            subtitle: _('Choose how the gradient flows'),
            choices: [
                {value: 'vertical', label: _('Vertical')},
                {value: 'horizontal', label: _('Horizontal')},
            ],
            addRow: row => themeExpander.add_row(row),
        },
        connectSettings
    );
    const customPanelTextColorSubtitle = _(
        'White text uses the dark Dock theme; black text uses the light Dock theme'
    );
    const customPanelTextColorRow = addComboRow(
        themeExpander,
        settings,
        {
            key: 'dock-panel-theme',
            title: _('Dock Text Color'),
            subtitle: customPanelTextColorSubtitle,
            choices: [
                {value: 'dark', label: _('White')},
                {value: 'light', label: _('Black')},
            ],
            addRow: row => themeExpander.add_row(row),
        },
        connectSettings
    );

    const bordersExpander = new Adw.ExpanderRow({
        title: _('Borders'),
        subtitle: _('Choose which borders appear around the Dock'),
    });
    group.add(bordersExpander);

    const darkPanelBorderSwitch = new Adw.SwitchRow({
        title: _('Show Border in Dark Mode'),
        subtitle: _('Display a thin border along the Dock’s workspace-facing edge'),
        active: settings.get_boolean('dock-panel-border-enabled'),
    });
    bordersExpander.add_row(darkPanelBorderSwitch);
    settings.bind(
        'dock-panel-border-enabled',
        darkPanelBorderSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const lightPanelBorderSwitch = new Adw.SwitchRow({
        title: _('Show Border in Light Mode'),
        subtitle: _('Display a thin border along the Dock’s workspace-facing edge'),
        active: settings.get_boolean('dock-panel-border-light-enabled'),
    });
    bordersExpander.add_row(lightPanelBorderSwitch);
    settings.bind(
        'dock-panel-border-light-enabled',
        lightPanelBorderSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const syncThemeControls = () => {
        const available = dockAvailable();
        followSystemThemeSwitch.sensitive = available;
        dockThemeRow.sensitive = available &&
            !followSystemThemeSwitch.active;
    };
    const syncTransparencyControls = () => {
        const panelBlurAvailable = blurMyShellPanelBlurEnabled();
        const blocked = settings.get_boolean('dock-panel-blur-enabled') &&
            panelBlurAvailable;
        const available = dockAvailable();
        dockPanelBlurSwitch.sensitive = available && panelBlurAvailable;
        transparencySwitch.sensitive = available && !blocked;
        transparencySwitch.subtitle = blocked
            ? panelBlurTransparencySubtitle
            : transparencySwitchSubtitle;
        transparencyRow.sensitive = available &&
            !blocked && transparencySwitch.active;
        transparencyRow.subtitle = blocked
            ? panelBlurTransparencySubtitle
            : transparencyRowSubtitle;
    };
    const syncCustomColorControls = () => {
        const blocked = settings.get_boolean('dock-panel-blur-enabled') &&
            blurMyShellPanelBlurEnabled();
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
            ? panelBlurTransparencySubtitle
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
            ? panelBlurTransparencySubtitle
            : customPanelTextColorSubtitle;
    };
    const syncAvailability = () => {
        const available = dockAvailable();
        group.sensitive = available;
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
    connectSettings(
        settings,
        'changed::dock-panel-blur-enabled',
        () => {
            syncTransparencyControls();
            syncCustomColorControls();
        }
    );
    syncAvailability();

    return {
        syncTransparency: syncTransparencyControls,
        syncCustomColor: syncCustomColorControls,
    };
}
