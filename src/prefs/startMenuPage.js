// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {panelApplicationSettings} from '../shared/defaultPanelWindowSettings.js';
import {isDefaultPanelWithoutDock} from '../shared/panelModeProfiles.js';
import {
    START_BUTTON_LOCATION_KEY,
    dynamicTaskbarEnabled,
    panelStartButtonPosition,
    startButtonAlignmentKey,
    startButtonInPanel,
} from '../shared/taskbarPanelModes.js';
import {
    getStartIconDisplayName,
    StartIconChooserDialog,
} from './startIconChooser.js';
import {axisPanelPositions} from './panelAxis.js';
import {activePanelPosition} from '../shared/panelPositionUtils.js';
import {openCustomShortcutDialog} from './preferencesDialogs.js';
import {SettingsSubpage} from './settingsSubpage.js';
import {
    addComboRow,
    addToggleChoiceRow,
    createSwitchRow,
    setButtonIcon,
} from './preferencesWidgets.js';
import {taskManagerCandidates} from '../shared/taskManagerUtils.js';
import {addSliderRow} from './sliderRow.js';

export function addStartMenuPage({
    window,
    page: startMenuPage,
    taskbarPage,
    dockPage,
    settings,
    connectSettings,
    extensionPath,
    panelPositions,
    blurMyShellPanelBlurEnabled,
    blurMyShellPopupBlurEnabled,
}) {
    const startButtonHubGroup = new Adw.PreferencesGroup({
        title: _('Start Button'),
    });
    startMenuPage.add(startButtonHubGroup);
    const startButtonSubpage = new SettingsSubpage(window, startButtonHubGroup, {
        title: _('Start Button Options'),
        subtitle: _('Alignment, padding, icon, and separator'),
        iconName: 'start-here-symbolic',
    });

    const startMenuHubGroup = new Adw.PreferencesGroup({
        title: _('Eleven-style Start Menu'),
        description: _('Configure the optional Eleven-style application menu.'),
    });
    startMenuPage.add(startMenuHubGroup);

    const showRequestedPage = () => {
        const target = settings.get_string('target-prefs-page');
        if (target)
            window.pop_subpage();
        if (target === 'start-menu')
            window.set_visible_page(startMenuPage);
        else if (target === 'taskbar')
            window.set_visible_page(taskbarPage);
        else if (target === 'dock')
            window.set_visible_page(dockPage);

        if (target)
            settings.set_string('target-prefs-page', '');
    };
    connectSettings(
        settings,
        'changed::target-prefs-page',
        showRequestedPage
    );
    showRequestedPage();

    const startButtonAlignmentGroup = startButtonSubpage.addGroup({
        title: _('Start Button Alignment'),
        description: _(
            'Choose the Start button position or follow application alignment'
        ),
    });

    const followAppAlignmentKey = () =>
        startButtonAlignmentKey(settings, 'start-button-follow-app-alignment');
    const startPositionKey = () =>
        startButtonAlignmentKey(settings, 'start-button-position');
    const effectiveStartButtonPosition = () => panelStartButtonPosition(
        startButtonInPanel(settings) ? panelApplicationSettings(settings) : settings
    );
    const startButtonPositionKeys = [
        'taskbar-dynamic',
        'app-alignment',
        'start-button-position',
        'default-panel-start-button-position',
        'default-panel-window-app-alignment',
        'default-panel-show-running-windows',
        'dock-mode',
        'dock-panel-mode',
        'default-gnome-panel',
        START_BUTTON_LOCATION_KEY,
    ];
    const followAppAlignmentSwitch = new Adw.SwitchRow({
        title: _('Follow Application Alignment'),
        subtitle: _('Move the Start button with the application icons'),
        active: settings.get_boolean(followAppAlignmentKey()),
    });
    startButtonAlignmentGroup.add(followAppAlignmentSwitch);
    followAppAlignmentSwitch.connect('notify::active', widget => {
        if (settings.get_boolean(followAppAlignmentKey()) !== widget.active)
            settings.set_boolean(followAppAlignmentKey(), widget.active);
    });
    for (const key of [
        'start-button-follow-app-alignment',
        'default-panel-start-button-follow-app-alignment',
        START_BUTTON_LOCATION_KEY,
        'default-gnome-panel',
    ]) {
        connectSettings(settings, `changed::${key}`, () => {
            followAppAlignmentSwitch.active = settings.get_boolean(followAppAlignmentKey());
        });
    }

    const startPositionRow = addComboRow(
        startButtonAlignmentGroup,
        settings,
        {
            key: 'start-button-position',
            getValue: () => dynamicTaskbarEnabled(settings)
                ? 'center' : settings.get_string(startPositionKey()),
            setValue: value => settings.set_string(startPositionKey(), value),
            title: _('Manual Alignment'),
            subtitle: _(
                'Used when the Start button does not follow applications'
            ),
            choices: panelPositions,
            choicesProvider: () => axisPanelPositions(
                startButtonInPanel(settings)
                    ? settings.get_string('panel-position')
                    : activePanelPosition(settings),
                panelPositions
            ),
            choicesChangedKeys: [
                'panel-position',
                'dock-position',
                'dock-mode',
                'taskbar-dynamic',
                'default-gnome-panel',
                START_BUTTON_LOCATION_KEY,
                'default-panel-start-button-position',
            ],
            addRow: row => startButtonAlignmentGroup.add(row),
        },
        connectSettings
    );
    const startLocationRow = addComboRow(
        startButtonAlignmentGroup,
        settings,
        {
            key: START_BUTTON_LOCATION_KEY,
            title: _('Location'),
            choices: [],
            choicesProvider: () => [
                {
                    value: 'dock',
                    label: settings.get_boolean('dock-mode') ? _('Dock') : _('Hidden'),
                },
                {value: 'panel', label: _('Panel')},
            ],
            choicesChangedKeys: ['dock-mode'],
            addRow: row => startButtonAlignmentGroup.add(row),
        },
        connectSettings
    );
    const updateStartPositionRow = () => {
        const defaultPanel = isDefaultPanelWithoutDock(settings);
        const windowsXpTheme = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const dockMode = settings.get_boolean('dock-mode');
        const dockPanelMode = settings.get_boolean('dock-panel-mode');
        const inPanel = startButtonInPanel(settings);
        startPositionRow.sensitive =
            !windowsXpTheme && !dynamicTaskbarEnabled(settings) &&
            !followAppAlignmentSwitch.active &&
            (inPanel || (!defaultPanel && (!dockMode || dockPanelMode)));
        followAppAlignmentSwitch.sensitive =
            (inPanel || !defaultPanel) && !windowsXpTheme && !dynamicTaskbarEnabled(settings);
        startLocationRow.sensitive = settings.get_boolean('default-gnome-panel');
        startLocationRow.subtitle = dockMode
            ? _('Place the Start button in the Dock or the panel in Default Panel mode')
            : _('The Dock is off, so the Start button is hidden unless it is in the panel');
        startButtonAlignmentGroup.sensitive = !windowsXpTheme;
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
    connectSettings(settings, 'changed::taskbar-dynamic', updateStartPositionRow);
    connectSettings(settings, 'changed::dock-mode', updateStartPositionRow);
    connectSettings(settings, `changed::${START_BUTTON_LOCATION_KEY}`, updateStartPositionRow);
    connectSettings(
        settings,
        'changed::dock-panel-mode',
        updateStartPositionRow
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        updateStartPositionRow
    );
    updateStartPositionRow();

    const startButtonAppearanceGroup = startButtonSubpage.addGroup({
        title: _('Start Button Appearance'),
        description: _('Configure padding, separators, icons, and button visibility'),
    });

    const startButtonPaddingRow = addSliderRow(
        startButtonAppearanceGroup,
        settings,
        {
            key: 'start-button-padding',
            title: _('Start Button Padding'),
            subtitle: _(
                'Space between the Start icon and the panel edge in pixels when positioned at either end'
            ),
            lower: 0,
            upper: 20,
            addRow: row => startButtonAppearanceGroup.add(row),
        },
        connectSettings
    );
    const updateStartButtonPaddingRow = () => {
        const defaultPanel = isDefaultPanelWithoutDock(settings);
        const dockMode = settings.get_boolean('dock-mode');
        const dockPanelMode = settings.get_boolean('dock-panel-mode');
        const windowsXpTheme = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const inPanel = startButtonInPanel(settings);
        const startButtonPosition = effectiveStartButtonPosition();
        const available = (startButtonPosition === 'left' ||
            startButtonPosition === 'right') &&
            (inPanel || !dockMode || dockPanelMode);
        startButtonPaddingRow.sensitive =
            (inPanel || !defaultPanel) && !windowsXpTheme && available;
    };
    followAppAlignmentSwitch.connect(
        'notify::active',
        updateStartButtonPaddingRow
    );
    for (const key of startButtonPositionKeys) {
        connectSettings(
            settings,
            `changed::${key}`,
            updateStartButtonPaddingRow
        );
    }
    updateStartButtonPaddingRow();

    const startButtonSeparatorSwitch = createSwitchRow(settings, {
        key: 'show-start-button-separator',
        title: _('Show Start Button Separator'),
        subtitle: _('Show a line between the Start button and applications'),
    });

    const customIconRow = new Adw.ActionRow({
        title: _('Custom Start Button Icon'),
    });
    const clearCustomIconButton = new Gtk.Button({
        tooltip_text: _('Use the built-in icon'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(clearCustomIconButton, 'edit-clear-symbolic');
    const chooseCustomIconButton = new Gtk.Button({
        label: _('Choose…'),
        valign: Gtk.Align.CENTER,
    });
    customIconRow.add_suffix(clearCustomIconButton);
    customIconRow.add_suffix(chooseCustomIconButton);
    customIconRow.activatable_widget = chooseCustomIconButton;
    startButtonAppearanceGroup.add(customIconRow);
    startButtonAppearanceGroup.add(startButtonSeparatorSwitch);

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
        updateStartButtonPaddingRow();
        startButtonSeparatorSwitch.sensitive = !enabled;
        customIconRow.sensitive = !enabled;
        startButtonAppearanceGroup.sensitive = !enabled;
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
    startMenuHubGroup.add(windowsStartMenuSwitch);
    const menuOptionsSubpage = new SettingsSubpage(window, startMenuHubGroup, {
        title: _('Start Menu Options'),
        subtitle: _('Configure Start Menu content and behavior'),
        iconName: 'view-grid-symbolic',
    });
    const menuAppearanceSubpage = new SettingsSubpage(window, startMenuHubGroup, {
        title: _('Start Menu Appearance'),
        subtitle: _('Configure the Start Menu theme and transparency'),
        iconName: 'preferences-color-symbolic',
    });
    const foldersSubpage = new SettingsSubpage(window, startMenuHubGroup, {
        title: _('Folder Shortcuts'),
        subtitle: _('Choose which folders appear beside the Settings icon'),
        iconName: 'folder-symbolic',
    });
    const contextMenuSubpage = new SettingsSubpage(window, startMenuHubGroup, {
        title: _('Start Button Context Menu'),
        subtitle: _('Choose which shortcuts appear in the Start button’s context menu'),
        iconName: 'open-menu-symbolic',
    });
    const keyboardSubpage = new SettingsSubpage(window, startMenuHubGroup, {
        title: _('Keyboard Shortcuts'),
        subtitle: _('Configure Start menu shortcuts'),
        iconName: 'preferences-desktop-keyboard-shortcuts-symbolic',
    });
    const startMenuKeybindingsGroup = keyboardSubpage.addGroup({
        title: _('Keyboard Shortcuts'),
        description: _('Configure Start menu shortcuts.'),
    });
    settings.bind(
        'windows-start-menu-enabled',
        windowsStartMenuSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const startMenuOptionsGroup = menuOptionsSubpage.addGroup({
        title: _('Start Menu Options'),
        description: _('Configure Start Menu content and behavior'),
    });

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
    const runningIndicatorsSwitch = new Adw.SwitchRow({
        title: _('Show Running App Indicators'),
        subtitle: _('Show taskbar-style indicators below running application icons'),
        active: settings.get_boolean(
            'start-menu-running-indicators'
        ),
    });
    settings.bind(
        'start-menu-running-indicators',
        runningIndicatorsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    startMenuOptionsGroup.add(recommendedAppsSwitch);
    startMenuOptionsGroup.add(powerOptionsSwitch);
    startMenuOptionsGroup.add(openAllAppsSwitch);
    startMenuOptionsGroup.add(profilePictureSwitch);
    startMenuOptionsGroup.add(hidePinnedAppTitlesSwitch);
    startMenuOptionsGroup.add(runningIndicatorsSwitch);
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
    const updateRunningIndicatorsSwitch = () => {
        runningIndicatorsSwitch.sensitive = windowsStartMenuSwitch.active &&
            !settings.get_boolean('windows-xp-theme-enabled');
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateRunningIndicatorsSwitch
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        updateRunningIndicatorsSwitch
    );
    updateRunningIndicatorsSwitch();

    const appCategoriesSwitch = new Adw.SwitchRow({
        title: _('Organize All Apps into Categories'),
        subtitle: _('Browse applications by category in the Start menu'),
        active: settings.get_boolean(
            'start-menu-app-categories'
        ),
    });
    startMenuOptionsGroup.add(appCategoriesSwitch);
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
        title: _('Show App Grid Button'),
        subtitle: _('Show a Start button that opens the GNOME app grid when the Eleven-style Start Menu is disabled'),
        active: settings.get_boolean('gnome-start-button-visible'),
    });
    startButtonAppearanceGroup.add(gnomeStartButtonVisibleSwitch);
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
        title: _('Follow Taskbar/Dock Theme'),
        subtitle: _('Use the taskbar or Dock’s effective light or dark appearance'),
        active: settings.get_boolean(
            'start-menu-follow-panel-theme'
        ),
    });
    const startMenuAppearanceGroup = menuAppearanceSubpage.addGroup({
        title: _('Start Menu Appearance'),
        description: _('Configure the Start Menu theme and transparency'),
    });

    const startMenuFoldersGroup = foldersSubpage.addGroup({
        title: _('Folder Shortcuts'),
        description: _('Choose which folders appear beside the Settings icon'),
    });
    const startMenuLocationsSwitch = new Adw.SwitchRow({
        title: _('Show Folder Shortcuts'),
        subtitle: _('Show selected folders beside the Settings icon in the Start Menu'),
        active: settings.get_boolean('start-menu-show-locations'),
    });
    startMenuFoldersGroup.add(startMenuLocationsSwitch);
    settings.bind(
        'start-menu-show-locations',
        startMenuLocationsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const startMenuFolderRows = [];
    for (const option of [
        {
            key: 'start-menu-show-home',
            title: _('Home'),
            subtitle: _('Add the Home folder'),
        },
        {
            key: 'start-menu-show-desktop',
            title: _('Desktop'),
            subtitle: _('Add the Desktop folder'),
        },
        {
            key: 'start-menu-show-documents',
            title: _('Documents'),
            subtitle: _('Add the Documents folder'),
        },
        {
            key: 'start-menu-show-downloads',
            title: _('Downloads'),
            subtitle: _('Add the Downloads folder'),
        },
        {
            key: 'start-menu-show-music',
            title: _('Music'),
            subtitle: _('Add the Music folder'),
        },
        {
            key: 'start-menu-show-pictures',
            title: _('Pictures'),
            subtitle: _('Add the Pictures folder'),
        },
        {
            key: 'start-menu-show-videos',
            title: _('Videos'),
            subtitle: _('Add the Videos folder'),
        },
    ]) {
        const row = createSwitchRow(settings, option);
        startMenuFoldersGroup.add(row);
        startMenuFolderRows.push(row);
    }
    const updateStartMenuLocationControls = () => {
        startMenuFoldersGroup.sensitive = windowsStartMenuSwitch.active;
        for (const row of startMenuFolderRows)
            row.sensitive = startMenuLocationsSwitch.active;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateStartMenuLocationControls
    );
    startMenuLocationsSwitch.connect(
        'notify::active',
        updateStartMenuLocationControls
    );
    updateStartMenuLocationControls();

    const hasDesktopApp = appId =>
        Boolean(Gio.DesktopAppInfo.new(appId));
    const hasSettingsApp = hasDesktopApp('org.gnome.Settings.desktop');
    const hasTerminalApp = hasDesktopApp('org.gnome.Console.desktop') ||
        hasDesktopApp('org.gnome.Terminal.desktop');
    const hasTaskManagerApp = taskManagerCandidates(
        settings.get_string('task-manager-app')
    ).some(appId => appId && hasDesktopApp(appId));
    const hasFileManager = Boolean(
        Gio.app_info_get_default_for_type('inode/directory', false)
    );
    const contextMenuOptions = [
        {
            key: 'start-menu-context-installed-apps',
            title: _('Installed Apps'),
            subtitle: _('Open installed applications in Settings'),
            available: hasSettingsApp,
        },
        {
            key: 'start-menu-context-event-viewer',
            title: _('Event Viewer'),
            subtitle: _('Open system logs'),
            available: hasDesktopApp('org.gnome.Logs.desktop'),
        },
        {
            key: 'start-menu-context-system',
            title: _('System'),
            subtitle: _('Open system information in Settings'),
            available: hasSettingsApp,
        },
        {
            key: 'start-menu-context-network',
            title: _('Network Connections'),
            subtitle: _('Open network settings'),
            available: hasSettingsApp,
        },
        {
            key: 'start-menu-context-disk-management',
            title: _('Disk Management'),
            subtitle: _('Open GNOME Disks'),
            available: hasDesktopApp('org.gnome.DiskUtility.desktop'),
        },
        {
            key: 'start-menu-context-terminal',
            title: _('Terminal'),
            subtitle: _('Open the available terminal application'),
            available: hasTerminalApp,
        },
        {
            key: 'start-menu-context-task-manager',
            title: _('Task Manager'),
            subtitle: _('Open the configured task manager'),
            available: hasTaskManagerApp,
        },
        {
            key: 'start-menu-context-file-manager',
            title: _('File Explorer'),
            subtitle: _('Open the default file manager'),
            available: hasFileManager,
        },
        {
            key: 'start-menu-context-run',
            title: _('Run'),
            subtitle: _('Open the Run Command dialog'),
            available: true,
        },
        {
            key: 'start-menu-context-show-desktop',
            title: _('Desktop'),
            subtitle: _('Show the desktop'),
            available: true,
        },
    ];
    const startMenuContextMenuGroup = contextMenuSubpage.addGroup({
        title: _('Start Button Context Menu'),
        description: _(
            'Choose which shortcuts appear in the Start button’s context menu'
        ),
    });
    const startMenuContextMenuSwitch = createSwitchRow(settings, {
        key: 'start-menu-context-menu-enabled',
        title: _('Show Context Menu Shortcuts'),
        subtitle: _('Add selected system shortcuts to the Start button context menu'),
    });
    startMenuContextMenuGroup.add(startMenuContextMenuSwitch);
    const startMenuContextMenuRows = [];
    for (const option of contextMenuOptions) {
        if (!option.available)
            continue;

        const row = createSwitchRow(settings, option);
        startMenuContextMenuGroup.add(row);
        startMenuContextMenuRows.push(row);
    }
    const updateStartMenuContextMenuControls = () => {
        startMenuContextMenuGroup.sensitive = windowsStartMenuSwitch.active;
        const sensitive = windowsStartMenuSwitch.active &&
            startMenuContextMenuSwitch.active;
        for (const row of startMenuContextMenuRows)
            row.sensitive = sensitive;
    };
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateStartMenuContextMenuControls
    );
    startMenuContextMenuSwitch.connect(
        'notify::active',
        updateStartMenuContextMenuControls
    );
    updateStartMenuContextMenuControls();

    startMenuAppearanceGroup.add(followPanelThemeSwitch);
    settings.bind(
        'start-menu-follow-panel-theme',
        followPanelThemeSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

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
            addRow: row => startMenuAppearanceGroup.add(row),
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
    const followPanelTransparencySwitch = new Adw.SwitchRow({
        title: _('Follow Taskbar Transparency'),
        subtitle: followPanelTransparencySubtitle,
        active: settings.get_boolean(
            'start-menu-follow-panel-transparency'
        ),
    });
    startMenuAppearanceGroup.add(followPanelTransparencySwitch);
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
    startMenuOptionsGroup.add(centerStartMenuRow);
    settings.bind(
        'start-menu-monitor-centered',
        centerStartMenuRow,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const updateCenterStartMenuRow = () => {
        let centered = effectiveStartButtonPosition() === 'center';
        if (settings.get_boolean('dock-mode') &&
            !settings.get_boolean('dock-panel-mode') &&
            !startButtonInPanel(settings)) {
            centered = true;
        }
        centerStartMenuRow.sensitive =
            windowsStartMenuSwitch.active && centered;
    };
    for (const key of startButtonPositionKeys)
        connectSettings(settings, `changed::${key}`, updateCenterStartMenuRow);
    followAppAlignmentSwitch.connect(
        'notify::active',
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

    const customShortcutLabel = new Gtk.ShortcutLabel({
        disabled_text: _('Not set'),
        valign: Gtk.Align.CENTER,
    });
    const editCustomShortcutButton = new Gtk.Button({
        tooltip_text: _('Set custom shortcut'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(editCustomShortcutButton, 'document-edit-symbolic');
    const clearCustomShortcutButton = new Gtk.Button({
        tooltip_text: _('Clear custom shortcut'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(clearCustomShortcutButton, 'edit-clear-symbolic');
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

    const syncStartMenuAvailability = () => {
        const available = !isDefaultPanelWithoutDock(settings) || startButtonInPanel(settings);
        startMenuHubGroup.sensitive = available;
        startMenuPage.description = available
            ? ''
            : _('Set the Start button location to Panel to use the Start Menu in Default GNOME Panel mode.');
    };
    for (const key of ['default-gnome-panel', 'dock-mode', START_BUTTON_LOCATION_KEY])
        connectSettings(settings, `changed::${key}`, syncStartMenuAvailability);
    syncStartMenuAvailability();

    return {
        followAppAlignmentSwitch,
        syncTransparency: updateStartMenuTransparencyRow,
        windowsStartMenuSwitch,
    };
}
