// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getStartIconDisplayName,
    StartIconChooserDialog,
} from './startIconChooser.js';
import {axisPanelPositions} from './panelAxis.js';
import {openCustomShortcutDialog} from './preferencesDialogs.js';
import {addComboRow, addSpinRow} from './preferencesWidgets.js';

export function addStartMenuPage({
    window,
    page: startMenuPage,
    settings,
    connectSettings,
    extensionPath,
    panelPositions,
    advancedStartMenuGroup,
    advancedFileManagerGroup,
    blurMyShellPanelBlurEnabled,
    blurMyShellPopupBlurEnabled,
}) {
    const startButtonGroup = new Adw.PreferencesGroup({
        title: _('Start Button'),
        description: _('Configure the Start button position and spacing.'),
    });
    startMenuPage.add(startButtonGroup);

    const startMenuGroup = new Adw.PreferencesGroup({
        title: _('Eleven-style Start Menu'),
        description: _('Configure the optional Eleven-style application menu.'),
    });
    startMenuPage.add(startMenuGroup);

    const startMenuKeybindingsGroup = new Adw.PreferencesGroup({
        title: _('Keyboard Shortcuts'),
        description: _('Configure Start menu shortcuts.'),
    });
    startMenuPage.add(startMenuKeybindingsGroup);

    const showRequestedPage = () => {
        const target = settings.get_string('target-prefs-page');
        if (target === 'start-menu')
            window.set_visible_page(startMenuPage);

        if (target)
            settings.set_string('target-prefs-page', '');
    };
    connectSettings(
        settings,
        'changed::target-prefs-page',
        showRequestedPage
    );
    showRequestedPage();

    const startPositionRow = addComboRow(
        startButtonGroup,
        settings,
        {
            key: 'start-button-position',
            title: _('Start Button'),
            subtitle: _('Choose the Start button alignment'),
            choices: panelPositions.slice(0, 2),
            choicesProvider: () =>
                axisPanelPositions(settings, panelPositions).slice(0, 2),
            choicesChangedKey: 'panel-position',
        },
        connectSettings
    );

    const followAppAlignmentSwitch = new Adw.SwitchRow({
        title: _('Follow Application Alignment'),
        subtitle: _('Move the Start button with the application buttons'),
        active: settings.get_boolean(
            'start-button-follow-app-alignment'
        ),
    });
    startButtonGroup.add(followAppAlignmentSwitch);
    settings.bind(
        'start-button-follow-app-alignment',
        followAppAlignmentSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const updateStartPositionRow = () => {
        const defaultPanel = settings.get_boolean('default-gnome-panel') &&
            !settings.get_boolean('dock-mode');
        const windowsXpTheme = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        startPositionRow.sensitive =
            !defaultPanel && !windowsXpTheme &&
            !followAppAlignmentSwitch.active;
        followAppAlignmentSwitch.sensitive =
            !defaultPanel && !windowsXpTheme;
    };
    followAppAlignmentSwitch.connect(
        'notify::active',
        updateStartPositionRow
    );
    connectSettings(
        settings,
        'changed::default-gnome-panel',
        updateStartPositionRow
    );
    connectSettings(settings, 'changed::dock-mode', updateStartPositionRow);
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        updateStartPositionRow
    );
    updateStartPositionRow();

    const startButtonPaddingRow = addSpinRow(
        startButtonGroup,
        settings,
        {
            key: 'start-button-padding',
            title: _('Start Button Padding'),
            subtitle: _('Horizontal space around the Start icon in pixels'),
            lower: 0,
            upper: 20,
        },
        connectSettings
    );

    const customIconRow = new Adw.ActionRow({
        title: _('Custom Start Button Icon'),
    });
    const clearCustomIconButton = new Gtk.Button({
        icon_name: 'edit-clear-symbolic',
        tooltip_text: _('Use the built-in icon'),
        valign: Gtk.Align.CENTER,
    });
    const chooseCustomIconButton = new Gtk.Button({
        label: _('Choose…'),
        valign: Gtk.Align.CENTER,
    });
    customIconRow.add_suffix(clearCustomIconButton);
    customIconRow.add_suffix(chooseCustomIconButton);
    customIconRow.activatable_widget = chooseCustomIconButton;
    startButtonGroup.add(customIconRow);

    const updateCustomIconRow = () => {
        const location = settings.get_string(
            'start-button-custom-icon'
        );
        if (location) {
            customIconRow.subtitle =
                getStartIconDisplayName(location);
        } else {
            customIconRow.subtitle = _('Using the built-in icon');
        }
        clearCustomIconButton.visible = Boolean(location);
    };
    chooseCustomIconButton.connect('clicked', () => {
        const dialog = new StartIconChooserDialog({
            extensionPath: extensionPath,
            settings: settings,
            parent: window,
        });
        dialog.present();
    });
    clearCustomIconButton.connect('clicked', () => {
        settings.set_string('start-button-custom-icon', '');
    });
    connectSettings(
        settings,
        'changed::start-button-custom-icon',
        updateCustomIconRow
    );
    updateCustomIconRow();

    const syncXpStartButtonControls = () => {
        const enabled = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        startButtonPaddingRow.sensitive = !enabled;
        customIconRow.sensitive = !enabled;
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncXpStartButtonControls
    );
    syncXpStartButtonControls();

    const windowsStartMenuSwitch = new Adw.SwitchRow({
        title: _('Eleven-style Start Menu'),
        subtitle: _('Replace the GNOME app grid with an Eleven-style menu'),
        active: settings.get_boolean('windows-start-menu-enabled'),
    });
    startMenuGroup.add(windowsStartMenuSwitch);
    settings.bind(
        'windows-start-menu-enabled',
        windowsStartMenuSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const profilePictureSwitch = new Adw.SwitchRow({
        title: _('Show Profile Picture'),
        subtitle: _('Use your account picture in the Start Menu'),
        active: settings.get_boolean(
            'start-menu-show-profile-picture'
        ),
    });
    settings.bind(
        'start-menu-show-profile-picture',
        profilePictureSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const updateProfilePictureSwitch = () => {
        profilePictureSwitch.sensitive = windowsStartMenuSwitch.active;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateProfilePictureSwitch
    );
    updateProfilePictureSwitch();

    const powerOptionsSwitch = new Adw.SwitchRow({
        title: _('Power Options in Start Menu'),
        subtitle: _(
            'Show power actions here instead of in Quick Settings'
        ),
        active: settings.get_boolean(
            'start-menu-power-options-enabled'
        ),
    });
    settings.bind(
        'start-menu-power-options-enabled',
        powerOptionsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const updatePowerOptionsSwitch = () => {
        powerOptionsSwitch.sensitive = windowsStartMenuSwitch.active;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updatePowerOptionsSwitch
    );
    updatePowerOptionsSwitch();

    const openAllAppsSwitch = new Adw.SwitchRow({
        title: _('Open All Apps by Default'),
        subtitle: _('Skip Pinned and open directly to applications and categories'),
        active: settings.get_boolean(
            'start-menu-open-all-apps'
        ),
    });
    settings.bind(
        'start-menu-open-all-apps',
        openAllAppsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const updateOpenAllAppsSwitch = () => {
        openAllAppsSwitch.sensitive = windowsStartMenuSwitch.active;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateOpenAllAppsSwitch
    );
    updateOpenAllAppsSwitch();

    const recommendedAppsSwitch = new Adw.SwitchRow({
        title: _('Show Recommended Apps'),
        subtitle: _('Display frequently used applications below pinned apps'),
        active: settings.get_boolean(
            'start-menu-recommended-apps'
        ),
    });
    settings.bind(
        'start-menu-recommended-apps',
        recommendedAppsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const hidePinnedAppTitlesSwitch = new Adw.SwitchRow({
        title: _('Hide Pinned App Titles'),
        subtitle: _(
            'Hide the names below pinned icons and show them in a tooltip when hovered'
        ),
        active: settings.get_boolean(
            'start-menu-hide-pinned-app-titles'
        ),
    });
    settings.bind(
        'start-menu-hide-pinned-app-titles',
        hidePinnedAppTitlesSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    advancedStartMenuGroup.add(recommendedAppsSwitch);
    advancedStartMenuGroup.add(powerOptionsSwitch);
    advancedStartMenuGroup.add(openAllAppsSwitch);
    advancedStartMenuGroup.add(profilePictureSwitch);
    advancedStartMenuGroup.add(hidePinnedAppTitlesSwitch);
    const updateRecommendedAppsSwitch = () => {
        const sensitive = windowsStartMenuSwitch.active &&
            !openAllAppsSwitch.active;
        recommendedAppsSwitch.sensitive = sensitive;
        hidePinnedAppTitlesSwitch.sensitive = sensitive;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateRecommendedAppsSwitch
    );
    openAllAppsSwitch.connect(
        'notify::active',
        updateRecommendedAppsSwitch
    );
    updateRecommendedAppsSwitch();

    const appCategoriesSwitch = new Adw.SwitchRow({
        title: _('Organize All Apps into Categories'),
        subtitle: _('Browse applications by category in the Start menu'),
        active: settings.get_boolean(
            'start-menu-app-categories'
        ),
    });
    startMenuGroup.add(appCategoriesSwitch);
    settings.bind(
        'start-menu-app-categories',
        appCategoriesSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const updateAppCategoriesSwitch = () => {
        appCategoriesSwitch.sensitive = windowsStartMenuSwitch.active;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateAppCategoriesSwitch
    );
    updateAppCategoriesSwitch();

    const gnomeStartButtonVisibleSwitch = new Adw.SwitchRow({
        title: _('Show Original GNOME Button'),
        subtitle: _('Show the Applications button when the Eleven-style Start Menu is disabled'),
        active: settings.get_boolean('gnome-start-button-visible'),
    });
    startButtonGroup.add(gnomeStartButtonVisibleSwitch);
    settings.bind(
        'gnome-start-button-visible',
        gnomeStartButtonVisibleSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const updateGnomeStartButtonVisibleSwitch = () => {
        gnomeStartButtonVisibleSwitch.sensitive =
            !windowsStartMenuSwitch.active;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateGnomeStartButtonVisibleSwitch
    );
    updateGnomeStartButtonVisibleSwitch();

    const followPanelThemeSwitch = new Adw.SwitchRow({
        title: _('Follow Panel Theme'),
        subtitle: _('Use the panel’s effective light or dark appearance'),
        active: settings.get_boolean(
            'start-menu-follow-panel-theme'
        ),
    });
    startMenuGroup.add(followPanelThemeSwitch);
    settings.bind(
        'start-menu-follow-panel-theme',
        followPanelThemeSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const startMenuThemeRow = addComboRow(
        startMenuGroup,
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
        'Use the panel’s configured transparency level'
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
    const followPanelTransparencySwitch = new Adw.SwitchRow({
        title: _('Follow Panel Transparency'),
        subtitle: followPanelTransparencySubtitle,
        active: settings.get_boolean(
            'start-menu-follow-panel-transparency'
        ),
    });
    advancedStartMenuGroup.add(followPanelTransparencySwitch);
    settings.bind(
        'start-menu-follow-panel-transparency',
        followPanelTransparencySwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
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

    const centerStartMenuRow = new Adw.SwitchRow({
        title: _('Center Start Menu on Monitor'),
        subtitle: _(
            'Place the menu at the true horizontal center instead of over the Start button'
        ),
        active: settings.get_boolean('start-menu-monitor-centered'),
    });
    startMenuGroup.add(centerStartMenuRow);
    settings.bind(
        'start-menu-monitor-centered',
        centerStartMenuRow,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const updateCenterStartMenuRow = () => {
        const centered = followAppAlignmentSwitch.active
            ? settings.get_string('app-alignment') === 'center'
            : settings.get_string('start-button-position') ===
                'center';
        centerStartMenuRow.sensitive =
            windowsStartMenuSwitch.active && centered;
    };
    connectSettings(
        settings,
        'changed::start-button-position',
        updateCenterStartMenuRow
    );
    followAppAlignmentSwitch.connect(
        'notify::active',
        updateCenterStartMenuRow
    );
    connectSettings(
        settings,
        'changed::app-alignment',
        updateCenterStartMenuRow
    );
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateCenterStartMenuRow
    );
    updateCenterStartMenuRow();

    const superKeyRow = new Adw.SwitchRow({
        title: _('Super Opens Start Menu'),
        subtitle: _('Use Super for the Start Menu and move Overview to Super+Tab'),
        active: settings.get_boolean('start-menu-super-key'),
    });
    startMenuKeybindingsGroup.add(superKeyRow);
    settings.bind(
        'start-menu-super-key',
        superKeyRow,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const superTabRow = new Adw.SwitchRow({
        title: _('Super+Tab Opens Start Menu'),
        subtitle: _(
            'Use GNOME’s application-switch shortcut for the Eleven-style Start Menu while it is enabled'
        ),
        active: settings.get_boolean('start-menu-super-tab'),
    });
    startMenuKeybindingsGroup.add(superTabRow);
    settings.bind(
        'start-menu-super-tab',
        superTabRow,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const updateSuperTabRow = () => {
        const windowsXpTheme = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        superKeyRow.sensitive = windowsStartMenuSwitch.active &&
            !windowsXpTheme;
        superTabRow.sensitive = windowsStartMenuSwitch.active &&
            !superKeyRow.active;
    };
    superKeyRow.connect('notify::active', () => {
        if (superKeyRow.active && superTabRow.active)
            settings.set_boolean('start-menu-super-tab', false);
        updateSuperTabRow();
    });
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateSuperTabRow
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        updateSuperTabRow
    );
    updateSuperTabRow();

    const superEFileManagerRow = new Adw.SwitchRow({
        title: _('Super+E Opens File Manager'),
        subtitle: _(
            'Open your home folder with the system’s default file manager'
        ),
        active: settings.get_boolean(
            'super-e-file-manager-enabled'
        ),
    });
    advancedFileManagerGroup.add(superEFileManagerRow);
    settings.bind(
        'super-e-file-manager-enabled',
        superEFileManagerRow,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const customShortcutLabel = new Gtk.ShortcutLabel({
        disabled_text: _('Not set'),
        valign: Gtk.Align.CENTER,
    });
    const editCustomShortcutButton = new Gtk.Button({
        icon_name: 'document-edit-symbolic',
        tooltip_text: _('Set custom shortcut'),
        valign: Gtk.Align.CENTER,
    });
    const clearCustomShortcutButton = new Gtk.Button({
        icon_name: 'edit-clear-symbolic',
        tooltip_text: _('Clear custom shortcut'),
        valign: Gtk.Align.CENTER,
    });
    const customShortcutRow = new Adw.ActionRow({
        title: _('Custom Start Menu Shortcut'),
        activatable_widget: editCustomShortcutButton,
    });
    customShortcutRow.add_suffix(customShortcutLabel);
    customShortcutRow.add_suffix(clearCustomShortcutButton);
    customShortcutRow.add_suffix(editCustomShortcutButton);
    startMenuKeybindingsGroup.add(customShortcutRow);

    const updateCustomShortcutRow = () => {
        const [accelerator] = settings.get_strv(
            'start-menu-custom-hotkey'
        );
        customShortcutLabel.accelerator = accelerator ?? '';
        clearCustomShortcutButton.visible = Boolean(accelerator);
        customShortcutRow.sensitive =
            windowsStartMenuSwitch.active && !superTabRow.active &&
            !superKeyRow.active;
        if (superKeyRow.active) {
            customShortcutRow.subtitle =
                _('Turn off the Super shortcut to use a custom shortcut');
        } else if (superTabRow.active) {
            customShortcutRow.subtitle =
                _('Turn off Super+Tab to use a custom shortcut');
        } else {
            customShortcutRow.subtitle =
                _('Choose any unused keyboard shortcut; none is assigned by default');
        }
    };

    editCustomShortcutButton.connect('clicked', () => {
        openCustomShortcutDialog(window);
    });
    clearCustomShortcutButton.connect('clicked', () => {
        settings.set_strv('start-menu-custom-hotkey', []);
    });
    connectSettings(
        settings,
        'changed::start-menu-custom-hotkey',
        updateCustomShortcutRow
    );
    superKeyRow.connect('notify::active', updateCustomShortcutRow);
    superTabRow.connect('notify::active', updateCustomShortcutRow);
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateCustomShortcutRow
    );
    updateCustomShortcutRow();

    return {
        followAppAlignmentSwitch,
        syncTransparency: updateStartMenuTransparencyRow,
        windowsStartMenuSwitch,
    };
}
