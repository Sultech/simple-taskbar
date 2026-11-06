// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {createSwitchRow, addToggleChoiceRow} from './preferencesWidgets.js';

export function addStartMenuAppearanceGroup({settings, connectSettings, menuAppearanceSubpage,
    windowsStartMenuSwitch, blurMyShellPanelBlurEnabled, blurMyShellPopupBlurEnabled}) {
    const followPanelThemeSwitch = createSwitchRow(settings, {
        key: 'start-menu-follow-panel-theme',
        title: _('Follow Taskbar/Dock Theme'),
        subtitle: _('Use the taskbar or Dock’s effective light or dark appearance'),
    });
    const startMenuAppearanceGroup = menuAppearanceSubpage.addGroup({
        title: _('Start Menu Appearance'),
        description: _('Configure the Start Menu theme and transparency'),
    });

    startMenuAppearanceGroup.add(followPanelThemeSwitch);

    const startMenuThemeRow = addToggleChoiceRow(
        startMenuAppearanceGroup,
        settings,
        {
            key: 'start-menu-theme',
            title: _('Start Menu Theme'),
            subtitle: _('Use a custom appearance or follow the GNOME Shell theme'),
            choices: [
                {value: 'dark', label: _('Dark')},
                {value: 'light', label: _('Light')},
                {value: 'shell', label: _('GNOME Shell')},
            ],
        },
        connectSettings
    );
    const updateStartMenuThemeRows = () => {
        followPanelThemeSwitch.sensitive = windowsStartMenuSwitch.active;
        startMenuThemeRow.sensitive = windowsStartMenuSwitch.active &&
            !followPanelThemeSwitch.active;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateStartMenuThemeRows
    );
    followPanelThemeSwitch.connect(
        'notify::active',
        updateStartMenuThemeRows
    );
    updateStartMenuThemeRows();

    const followPanelTransparencySubtitle = _(
        'Use the taskbar’s configured transparency level'
    );
    const panelBlurStartMenuTransparencySubtitle = _(
        'Disable Blur My Shell panel blur to use this option'
    );
    const popupBlurStartMenuTransparencySubtitle = _(
        'Disable Blur My Shell popup blur to use this option'
    );
    const panelAndPopupBlurStartMenuTransparencySubtitle = _(
        'Disable Blur My Shell panel and popup blur to use this option'
    );
    const followPanelTransparencySwitch = createSwitchRow(settings, {
        key: 'start-menu-follow-panel-transparency',
        title: _('Follow Taskbar Transparency'),
        subtitle: followPanelTransparencySubtitle,
    });
    startMenuAppearanceGroup.add(followPanelTransparencySwitch);
    const updateStartMenuTransparencyRow = () => {
        const panelBlur = blurMyShellPanelBlurEnabled();
        const popupBlur = blurMyShellPopupBlurEnabled();
        const blocked = panelBlur || popupBlur;
        const windowsXpThemeEnabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        followPanelTransparencySwitch.sensitive =
            windowsStartMenuSwitch.active && !blocked &&
            !windowsXpThemeEnabled;
        if (!blocked) {
            followPanelTransparencySwitch.subtitle =
                followPanelTransparencySubtitle;
        } else if (panelBlur && popupBlur) {
            followPanelTransparencySwitch.subtitle =
                panelAndPopupBlurStartMenuTransparencySubtitle;
        } else if (panelBlur) {
            followPanelTransparencySwitch.subtitle =
                panelBlurStartMenuTransparencySubtitle;
        } else {
            followPanelTransparencySwitch.subtitle =
                popupBlurStartMenuTransparencySubtitle;
        }
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateStartMenuTransparencyRow
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        updateStartMenuTransparencyRow
    );
    updateStartMenuTransparencyRow();

    return updateStartMenuTransparencyRow;
}
