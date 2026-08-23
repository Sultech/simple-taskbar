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
} from './preferencesWidgets.js';

const MAX_ICON_SIZE = 63;

export function addApplicationIconsGroup({
    page,
    dockPage,
    settings,
    connectSettings,
    panelPositions,
    advancedAppearanceGroup,
}) {
    const appearanceGroup = new Adw.PreferencesGroup({
        title: _('Application Icons'),
        description: _('Change the size, spacing, and placement of taskbar icons.'),
    });
    page.add(appearanceGroup);
    let appearanceGroupOnDockPage = false;
    const syncAppearanceGroupPage = () => {
        const dockModeEnabled = settings.get_boolean('dock-mode');
        if (dockModeEnabled === appearanceGroupOnDockPage)
            return;

        if (dockModeEnabled) {
            page.remove(appearanceGroup);
            dockPage.insert(appearanceGroup, 1);
        } else {
            dockPage.remove(appearanceGroup);
            page.insert(appearanceGroup, 1);
        }
        appearanceGroupOnDockPage = dockModeEnabled;
    };

    const iconSizeRow = addSpinRow(
        appearanceGroup,
        settings,
        {
            key: 'icon-size',
            title: _('Icon Size'),
            subtitle: _(
                'The panel grows automatically when larger icons need more room'
            ),
            lower: 15,
            upper: MAX_ICON_SIZE,
        },
        connectSettings
    );
    const dockMinIconSizeRow = addSpinRow(
        appearanceGroup,
        settings,
        {
            key: 'dock-min-icon-size',
            title: _('Minimum Icon Size'),
            subtitle: _(
                'Smallest application icon size used when space is limited'
            ),
            lower: 15,
            upper: MAX_ICON_SIZE,
        },
        connectSettings
    );
    const iconSpacingRow = addSpinRow(
        appearanceGroup,
        settings,
        {
            key: 'icon-spacing',
            title: _('Icon Spacing'),
            subtitle: _('Space between application buttons'),
            lower: 0,
            upper: 16,
        },
        connectSettings
    );
    const indicatorStyleRow = addComboRow(
        advancedAppearanceGroup,
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
    advancedAppearanceGroup.add(customIndicatorColorsSwitch);
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
    advancedAppearanceGroup.add(matchIconColorSwitch);
    settings.bind(
        'match-icon-color',
        matchIconColorSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const focusedIndicatorColorRow = addColorRow(
        advancedAppearanceGroup,
        settings,
        {
            key: 'focused-indicator-color',
            title: _('Focused Indicator Color'),
        },
        connectSettings
    );
    const unfocusedIndicatorColorRow = addColorRow(
        advancedAppearanceGroup,
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
    connectSettings(settings, 'changed::dock-mode', syncAppearanceGroupPage);
    const syncMinimumIconSize = () => {
        const enabled = !settings.get_boolean('windows-xp-theme-enabled') &&
            (!settings.get_boolean('default-gnome-panel') ||
                settings.get_boolean('dock-mode'));
        dockMinIconSizeRow.visible = enabled;
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
    syncAppearanceGroupPage();
    syncIndicatorControls();
    syncMinimumIconSize();
    const appAlignmentRow = addComboRow(
        appearanceGroup,
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

    const windowPreviewsSwitch = new Adw.SwitchRow({
        title: _('Window Previews'),
        subtitle: _('Show live window previews when hovering application icons'),
        active: settings.get_boolean('window-previews-enabled'),
    });
    appearanceGroup.add(windowPreviewsSwitch);
    settings.bind(
        'window-previews-enabled',
        windowPreviewsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const multiWindowSpreadSwitch = new Adw.SwitchRow({
        title: _('Spread Multiple Windows'),
        subtitle: _('Click an app with multiple windows to show only its windows in Overview, across all workspaces'),
        active: settings.get_boolean(
            'multi-window-click-spread'
        ),
    });
    appearanceGroup.add(multiWindowSpreadSwitch);
    settings.bind(
        'multi-window-click-spread',
        multiWindowSpreadSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    return {
        appearanceGroup,
        iconSizeRow,
        iconSpacingRow,
        appAlignmentRow,
    };
}
