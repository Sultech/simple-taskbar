// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getStartIconDisplayName,
    StartIconChooserDialog,
} from './prefs/startIconChooser.js';
import {normalizeAccelerator} from './keybindingUtils.js';
import {
    DEFAULT_PANEL_ITEM_ORDER,
    normalizePanelItemOrder,
} from './panelItemOrder.js';
import {
    BLUR_MY_SHELL_UUID,
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from './blurMyShellUtils.js';
import {resolveTaskManagerAppId} from './taskManagerUtils.js';
import {
    ICON_VERTICAL_RESERVE,
    MIN_PANEL_HEIGHT,
    STANDARD_MIN_PANEL_HEIGHT,
} from './panelSizing.js';
import {applyDefaultTaskbarSettings} from './taskbarDefaults.js';
import {
    applyWindowsXpThemeSettings,
    setWindowsXpThemeEnabled,
    WINDOWS_XP_ICON_SPACING,
} from './windowsXpTheme.js';

const MAX_ICON_SIZE = 48;
const GNOME_SHELL_SCHEMA = 'org.gnome.shell';
export default class SimpleTaskbarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(820, 740);
        window._settings = this.getSettings();
        const shellSettings = new Gio.Settings({
            schema_id: GNOME_SHELL_SCHEMA,
        });
        const blurMyShellSettings = getBlurMyShellSettings();
        let blurMyShellPanelSettings = null;
        let blurMyShellPopupSettings = null;
        if (blurMyShellSettings) {
            blurMyShellPanelSettings = getBlurMyShellChildSettings(
                blurMyShellSettings,
                'panel'
            );
            blurMyShellPopupSettings = getBlurMyShellChildSettings(
                blurMyShellSettings,
                'popup'
            );
        }
        const blurMyShellExtensionEnabled = () => {
            const enabledExtensions = shellSettings.get_strv(
                'enabled-extensions'
            );
            const disabledExtensions = shellSettings.get_strv(
                'disabled-extensions'
            );
            return enabledExtensions.includes(BLUR_MY_SHELL_UUID) &&
                !disabledExtensions.includes(BLUR_MY_SHELL_UUID);
        };
        const blurMyShellPanelBlurEnabled = () => {
            if (!blurMyShellPanelSettings ||
                !blurMyShellHasKey(blurMyShellPanelSettings, 'blur') ||
                !blurMyShellExtensionEnabled())
                return false;
            return blurMyShellPanelSettings.get_boolean('blur');
        };
        const blurMyShellPopupBlurEnabled = () => {
            if (!blurMyShellPopupSettings ||
                !blurMyShellHasKey(blurMyShellPopupSettings, 'blur') ||
                !blurMyShellExtensionEnabled())
                return false;
            return blurMyShellPopupSettings.get_boolean('blur');
        };
        let syncPanelTransparencyControls = () => {};
        let syncCustomPanelColorControls = () => {};
        let syncStartMenuTransparencyControl = () => {};
        const syncBlurMyShellTransparencyState = () => {
            syncPanelTransparencyControls();
            syncCustomPanelColorControls();
            syncStartMenuTransparencyControl();
        };
        if (blurMyShellPanelSettings &&
            blurMyShellHasKey(blurMyShellPanelSettings, 'blur')) {
            blurMyShellPanelSettings.connect(
                'changed::blur',
                syncBlurMyShellTransparencyState
            );
        }
        if (blurMyShellPopupSettings &&
            blurMyShellHasKey(blurMyShellPopupSettings, 'blur')) {
            blurMyShellPopupSettings.connect(
                'changed::blur',
                syncBlurMyShellTransparencyState
            );
        }
        for (const key of [
            'enabled-extensions',
            'disabled-extensions',
        ]) {
            shellSettings.connect(
                `changed::${key}`,
                syncBlurMyShellTransparencyState
            );
        }
        const panelPositions = [
            {value: 'left', label: _('Left')},
            {value: 'center', label: _('Center')},
            {value: 'right', label: _('Right')},
        ];

        const page = new Adw.PreferencesPage({
            title: _('Taskbar'),
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(page);

        const windowSwitchingPage = new Adw.PreferencesPage({
            title: _('Window Switching'),
            icon_name: 'focus-windows-symbolic',
        });
        window.add(windowSwitchingPage);

        const startMenuPage = new Adw.PreferencesPage({
            title: _('Start Menu'),
            icon_name: 'view-app-grid-symbolic',
        });
        window.add(startMenuPage);

        const advancedPage = new Adw.PreferencesPage({
            title: _('Advanced'),
            icon_name: 'applications-engineering-symbolic',
        });
        window.add(advancedPage);

        const advancedAppearanceGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _(
                'Less commonly used taskbar and indicator appearance options.'
            ),
        });
        advancedPage.add(advancedAppearanceGroup);

        const advancedAppBehaviorGroup = new Adw.PreferencesGroup({
            title: _('Application Behavior'),
            description: _(
                'Choose which applications appear and how they are grouped.'
            ),
        });
        advancedPage.add(advancedAppBehaviorGroup);

        const advancedBehaviorGroup = new Adw.PreferencesGroup({
            title: _('Taskbar Behavior'),
            description: _(
                'Less commonly used taskbar interaction options.'
            ),
        });
        advancedPage.add(advancedBehaviorGroup);

        const advancedFileManagerGroup = new Adw.PreferencesGroup({
            title: _('File Manager'),
            description: _(
                'File manager shortcuts and taskbar menu folders.'
            ),
        });
        advancedPage.add(advancedFileManagerGroup);

        const advancedStartMenuGroup = new Adw.PreferencesGroup({
            title: _('Start Menu'),
            description: _(
                'Less commonly used Start menu options.'
            ),
        });
        advancedPage.add(advancedStartMenuGroup);

        const gridAltTabGroup = new Adw.PreferencesGroup({
            title: _('Grid Alt-Tab'),
            description: _(
                'Switch directly between open windows using live previews.'
            ),
        });
        windowSwitchingPage.add(gridAltTabGroup);

        const gridAltTabSwitch = new Adw.SwitchRow({
            title: _('Enable Grid Alt-Tab'),
            subtitle: _(
                'Replace GNOME’s application switcher with a responsive window grid'
            ),
            active: window._settings.get_boolean('grid-alt-tab-enabled'),
        });
        gridAltTabGroup.add(gridAltTabSwitch);
        window._settings.bind(
            'grid-alt-tab-enabled',
            gridAltTabSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const gridAltTabCardSizeRow = this._addSpinRow(
            gridAltTabGroup,
            window._settings,
            {
                key: 'grid-alt-tab-max-card-size',
                title: _('Maximum Card Size'),
                subtitle: _(
                    'Largest preview height in pixels; widths follow each window’s shape'
                ),
                lower: 120,
                upper: 500,
                step: 10,
            }
        );
        const gridAltTabWorkspaceSwitch = new Adw.SwitchRow({
            title: _('Isolate Workspaces'),
            subtitle: _(
                'Show windows from the current workspace instead of all workspaces'
            ),
            active: window._settings.get_boolean(
                'grid-alt-tab-isolate-workspaces'
            ),
        });
        gridAltTabGroup.add(gridAltTabWorkspaceSwitch);
        window._settings.bind(
            'grid-alt-tab-isolate-workspaces',
            gridAltTabWorkspaceSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const gridAltTabMonitorSwitch = new Adw.SwitchRow({
            title: _('Isolate Monitors'),
            subtitle: _(
                'Show only windows from the monitor displaying the switcher'
            ),
            active: window._settings.get_boolean(
                'grid-alt-tab-isolate-monitors'
            ),
        });
        gridAltTabGroup.add(gridAltTabMonitorSwitch);
        window._settings.bind(
            'grid-alt-tab-isolate-monitors',
            gridAltTabMonitorSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const gridAltTabPrimaryMonitorSwitch = new Adw.SwitchRow({
            title: _('Show on Primary Monitor'),
            subtitle: _(
                'Always display the switcher on the primary monitor'
            ),
            active: window._settings.get_boolean(
                'grid-alt-tab-show-on-primary-monitor'
            ),
        });
        gridAltTabGroup.add(gridAltTabPrimaryMonitorSwitch);
        window._settings.bind(
            'grid-alt-tab-show-on-primary-monitor',
            gridAltTabPrimaryMonitorSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const updateGridAltTabOptionSensitivity = () => {
            const enabled = gridAltTabSwitch.active;
            gridAltTabCardSizeRow.sensitive = enabled;
            gridAltTabWorkspaceSwitch.sensitive = enabled;
            gridAltTabPrimaryMonitorSwitch.sensitive = enabled;
            gridAltTabMonitorSwitch.sensitive = enabled;
        };
        gridAltTabSwitch.connect(
            'notify::active',
            updateGridAltTabOptionSensitivity
        );
        updateGridAltTabOptionSensitivity();

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
            const target = window._settings.get_string('target-prefs-page');
            if (target === 'start-menu')
                window.set_visible_page(startMenuPage);

            if (target)
                window._settings.set_string('target-prefs-page', '');
        };
        let targetPageChangedId = window._settings.connect(
            'changed::target-prefs-page',
            showRequestedPage
        );
        window.connect('close-request', () => {
            if (!targetPageChangedId)
                return;

            window._settings.disconnect(targetPageChangedId);
            targetPageChangedId = 0;
        });
        showRequestedPage();

        const panelModeGroup = new Adw.PreferencesGroup({
            title: _('General'),
        });
        page.add(panelModeGroup);

        const defaultGnomePanelSwitch = new Adw.SwitchRow({
            title: _('Default GNOME Panel'),
            subtitle: _('Hide taskbar applications and use the original Dash in Overview'),
            active: window._settings.get_boolean('default-gnome-panel'),
        });
        panelModeGroup.add(defaultGnomePanelSwitch);

        const windowsXpThemeSwitch = new Adw.SwitchRow({
            title: _('Windows XP Theme'),
            subtitle: _('Apply a Windows XP-inspired taskbar style'),
            active: window._settings.get_boolean(
                'windows-xp-theme-enabled'
            ),
        });
        panelModeGroup.add(windowsXpThemeSwitch);

        const panelButtonPaddingRow = this._addSpinRow(
            panelModeGroup,
            window._settings,
            {
                key: 'panel-button-padding',
                title: _('Panel Button Padding'),
                subtitle: _(
                    'Horizontal space around panel buttons. Use -1 for automatic: Just Perfection’s value when it is configured, otherwise 3 px'
                ),
                lower: -1,
                upper: 20,
            }
        );

        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Application Icons'),
            description: _('Change the size, spacing, and placement of taskbar icons.'),
        });
        page.add(appearanceGroup);

        const iconSizeRow = this._addSpinRow(
            appearanceGroup,
            window._settings,
            {
                key: 'icon-size',
                title: _('Icon Size'),
                subtitle: _(
                    'The panel grows automatically when larger icons need more room'
                ),
                lower: 15,
                upper: MAX_ICON_SIZE,
            }
        );
        const iconSpacingRow = this._addSpinRow(
            appearanceGroup,
            window._settings,
            {
                key: 'icon-spacing',
                title: _('Icon Spacing'),
                subtitle: _('Space between application buttons'),
                lower: 0,
                upper: 16,
            }
        );
        const indicatorStyleRow = this._addComboRow(
            advancedAppearanceGroup,
            window._settings,
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
            }
        );
        const customIndicatorColorsSwitch = new Adw.SwitchRow({
            title: _('Custom Indicator Colors'),
            subtitle: _('Choose colors for running application indicators'),
            active: window._settings.get_boolean(
                'custom-indicator-colors-enabled'
            ),
        });
        advancedAppearanceGroup.add(customIndicatorColorsSwitch);
        window._settings.bind(
            'custom-indicator-colors-enabled',
            customIndicatorColorsSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const focusedIndicatorColorRow = this._addColorRow(
            advancedAppearanceGroup,
            window._settings,
            {
                key: 'focused-indicator-color',
                title: _('Focused Indicator Color'),
            }
        );
        const unfocusedIndicatorColorRow = this._addColorRow(
            advancedAppearanceGroup,
            window._settings,
            {
                key: 'unfocused-indicator-color',
                title: _('Unfocused Indicator Color'),
            }
        );
        const syncIndicatorControls = () => {
            const windowsXpThemeEnabled = window._settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            const enabled = customIndicatorColorsSwitch.active;
            indicatorStyleRow.sensitive = !windowsXpThemeEnabled;
            customIndicatorColorsSwitch.sensitive = !windowsXpThemeEnabled;
            focusedIndicatorColorRow.visible = enabled;
            unfocusedIndicatorColorRow.visible = enabled;
            focusedIndicatorColorRow.sensitive = !windowsXpThemeEnabled &&
                enabled;
            unfocusedIndicatorColorRow.sensitive =
                !windowsXpThemeEnabled && enabled;
        };
        customIndicatorColorsSwitch.connect(
            'notify::active',
            syncIndicatorControls
        );
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            syncIndicatorControls
        );
        syncIndicatorControls();
        const appAlignmentRow = this._addComboRow(
            appearanceGroup,
            window._settings,
            {
                key: 'app-alignment',
                title: _('Icon Alignment'),
                subtitle: _(
                    'Place application icons at the left or center'
                ),
                choices: panelPositions.slice(0, 2),
            }
        );

        const hidePinnedAppsSwitch = new Adw.SwitchRow({
            title: _('Hide Pinned Applications'),
            subtitle: _('Show pinned taskbar applications only while they are running'),
            active: window._settings.get_boolean(
                'hide-pinned-taskbar-apps'
            ),
        });
        advancedAppBehaviorGroup.add(hidePinnedAppsSwitch);
        window._settings.bind(
            'hide-pinned-taskbar-apps',
            hidePinnedAppsSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const pinnedAppsAsLaunchersSwitch = new Adw.SwitchRow({
            title: _('Use Pinned Apps as Application Launchers'),
            subtitle: _(
                'Keep pinned applications as launchers and show running applications separately'
            ),
            active: window._settings.get_boolean(
                'use-pinned-apps-as-launchers'
            ),
        });
        advancedAppBehaviorGroup.add(pinnedAppsAsLaunchersSwitch);
        window._settings.bind(
            'use-pinned-apps-as-launchers',
            pinnedAppsAsLaunchersSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const combineAppButtonsChoices = [
            {value: 'always', label: _('Always')},
            {value: 'when-full', label: _('Only When Full')},
            {value: 'never', label: _('Never')},
        ];
        const windowsXpCombineAppButtonsChoices = [
            {value: 'when-full', label: _('Only When Full')},
            {value: 'never', label: _('Never')},
        ];
        const combineAppButtonsRow = this._addComboRow(
            advancedAppBehaviorGroup,
            window._settings,
            {
                key: 'combine-app-buttons-mode',
                title: _('Combine Application Buttons'),
                subtitle: _('Choose when windows share one taskbar button'),
                choices: combineAppButtonsChoices,
                choicesProvider: () =>
                    window._settings.get_boolean(
                        'windows-xp-theme-enabled'
                    )
                        ? windowsXpCombineAppButtonsChoices
                        : combineAppButtonsChoices,
                choicesChangedKey: 'windows-xp-theme-enabled',
            }
        );

        const applicationOverflowSwitch = new Adw.SwitchRow({
            title: _('Application Overflow'),
            subtitle: _(
                'Show application buttons that do not fit in an overflow popup instead of scrolling the taskbar'
            ),
            active: window._settings.get_boolean(
                'application-overflow-enabled'
            ),
        });
        advancedAppBehaviorGroup.add(applicationOverflowSwitch);
        window._settings.bind(
            'application-overflow-enabled',
            applicationOverflowSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const applicationOverflowStyleRow = this._addComboRow(
            advancedAppBehaviorGroup,
            window._settings,
            {
                key: 'application-overflow-style',
                title: _('Overflow Style'),
                choices: [
                    {value: 'taskbar', label: _('Taskbar Flyout')},
                    {value: 'list', label: _('Application List')},
                ],
            }
        );
        applicationOverflowStyleRow.sensitive =
            applicationOverflowSwitch.active;
        applicationOverflowSwitch.connect('notify::active', widget => {
            applicationOverflowStyleRow.sensitive = widget.active;
        });

        const hideAppLabelsSwitch = new Adw.SwitchRow({
            title: _('Hide App Labels'),
            subtitle: _('Show only icons on separate window buttons'),
            active: window._settings.get_boolean('hide-app-labels'),
        });
        advancedAppBehaviorGroup.add(hideAppLabelsSwitch);
        window._settings.bind(
            'hide-app-labels',
            hideAppLabelsSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const syncLabelSensitivity = () => {
            hideAppLabelsSwitch.sensitive =
                !window._settings.get_boolean(
                    'windows-xp-theme-enabled'
                ) && window._settings.get_string(
                    'combine-app-buttons-mode'
                ) !== 'always';
        };
        combineAppButtonsRow.connect('notify::selected', () => {
            syncLabelSensitivity();
        });
        syncLabelSensitivity();

        const isolateWorkspacesSwitch = new Adw.SwitchRow({
            title: _('Isolate Workspaces'),
            subtitle: _('Show running applications from the current workspace only'),
            active: window._settings.get_boolean('isolate-workspaces'),
        });
        advancedAppBehaviorGroup.add(isolateWorkspacesSwitch);
        window._settings.bind(
            'isolate-workspaces',
            isolateWorkspacesSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const isolateMonitorsSwitch = new Adw.SwitchRow({
            title: _('Isolate Monitors'),
            subtitle: _('Show running applications only on the taskbar for their monitor'),
            active: window._settings.get_boolean('isolate-monitors'),
        });
        advancedAppBehaviorGroup.add(isolateMonitorsSwitch);
        window._settings.bind(
            'isolate-monitors',
            isolateMonitorsSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const multiWindowSpreadSwitch = new Adw.SwitchRow({
            title: _('Spread Multiple Windows'),
            subtitle: _('Click an app with multiple windows to show only its windows in Overview, across all workspaces'),
            active: window._settings.get_boolean(
                'multi-window-click-spread'
            ),
        });
        appearanceGroup.add(multiWindowSpreadSwitch);
        window._settings.bind(
            'multi-window-click-spread',
            multiWindowSpreadSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const nautilusPlacesSwitch = new Adw.SwitchRow({
            title: _('Nautilus Folder Shortcuts'),
            subtitle: _('Show common folders in the Files taskbar menu'),
            active: window._settings.get_boolean(
                'nautilus-places-enabled'
            ),
        });
        advancedFileManagerGroup.add(nautilusPlacesSwitch);
        window._settings.bind(
            'nautilus-places-enabled',
            nautilusPlacesSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        let syncingDefaultGnomePanel = false;
        const syncDefaultGnomePanel = () => {
            const enabled = window._settings.get_boolean(
                'default-gnome-panel'
            );
            syncingDefaultGnomePanel = true;
            defaultGnomePanelSwitch.active = enabled;
            appearanceGroup.sensitive = !enabled;
            startMenuPage.sensitive = !enabled;
            advancedAppBehaviorGroup.sensitive = !enabled;
            advancedStartMenuGroup.sensitive = !enabled;
            for (const row of [
                indicatorStyleRow,
                customIndicatorColorsSwitch,
                focusedIndicatorColorRow,
                unfocusedIndicatorColorRow,
                nautilusPlacesSwitch,
            ])
                row.sensitive = !enabled;
            appearanceGroup.description = enabled
                ? _('Application icons are unavailable in Default GNOME Panel mode.')
                : _('Change the size, spacing, and placement of taskbar icons.');
            advancedAppBehaviorGroup.description = enabled
                ? _('Application options are unavailable in Default GNOME Panel mode.')
                : _('Choose which applications appear and how they are grouped.');
            syncingDefaultGnomePanel = false;
        };

        const setDefaultGnomePanel = enabled => {
            // Apply the mode and layout together.
            const settings = this.getSettings();
            settings.delay();
            settings.set_boolean('default-gnome-panel', enabled);
            if (enabled) {
                settings.set_boolean('windows-xp-theme-enabled', false);
                settings.set_int('panel-height', 32);
                settings.set_int('panel-button-padding', 12);
                settings.set_string('panel-position', 'top');
                settings.set_boolean('activities-button-visible', true);
                settings.set_string('activities-button-position', 'left');
                settings.set_string('clock-position', 'center');
                settings.set_string('system-menu-position', 'right');
                settings.set_string('folder-menu-position', 'right');
                settings.set_string('tray-overflow-position', 'right');
                settings.set_strv(
                    'panel-item-order',
                    DEFAULT_PANEL_ITEM_ORDER
                );
                settings.set_boolean('multi-monitor-panels', true);
                settings.set_boolean('windows-start-menu-enabled', false);
                settings.set_boolean('gnome-start-button-visible', false);
                settings.set_boolean('show-desktop-button-visible', false);
                settings.set_boolean('panel-border-enabled', false);
                settings.set_boolean('panel-border-light-enabled', false);
            } else {
                applyDefaultTaskbarSettings(settings);
            }
            settings.apply();
        };

        defaultGnomePanelSwitch.connect(
            'notify::active',
            () => {
                if (syncingDefaultGnomePanel)
                    return;

                const enabled = defaultGnomePanelSwitch.active;
                if (enabled === window._settings.get_boolean(
                    'default-gnome-panel'
                )) {
                    return;
                }
                setDefaultGnomePanel(enabled);
                syncDefaultGnomePanel();
            }
        );
        window._settings.connect(
            'changed::default-gnome-panel',
            syncDefaultGnomePanel
        );
        syncDefaultGnomePanel();

        const panelAppearanceGroup = new Adw.PreferencesGroup({
            title: _('Panel Appearance'),
            description: _('Change the taskbar height, colour scheme, and transparency.'),
        });
        page.add(panelAppearanceGroup);

        const panelHeightRow = this._addSpinRow(
            panelAppearanceGroup,
            window._settings,
            {
                key: 'panel-height',
                title: _('Panel Height'),
                subtitle: _(
                    'Oversized icons shrink automatically when the panel is reduced'
                ),
                lower: MIN_PANEL_HEIGHT,
                upper: 80,
            }
        );
        const panelPositionRow = this._addComboRow(
            panelAppearanceGroup,
            window._settings,
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
            }
        );

        const fitPanelToIcons = () => {
            if (window._settings.get_boolean('default-gnome-panel') ||
                window._settings.get_boolean('windows-xp-theme-enabled')) {
                return;
            }

            const iconSize = window._settings.get_int('icon-size');
            const panelHeight = window._settings.get_int('panel-height');
            const minimumPanelHeight = iconSize + ICON_VERTICAL_RESERVE;
            if (panelHeight < minimumPanelHeight)
                window._settings.set_int('panel-height', minimumPanelHeight);
        };
        const fitIconsToPanel = () => {
            if (window._settings.get_boolean('default-gnome-panel') ||
                window._settings.get_boolean('windows-xp-theme-enabled')) {
                return;
            }

            const iconSize = window._settings.get_int('icon-size');
            const panelHeight = window._settings.get_int('panel-height');
            if (panelHeight < STANDARD_MIN_PANEL_HEIGHT) {
                window._settings.set_int(
                    'panel-height',
                    STANDARD_MIN_PANEL_HEIGHT
                );
                return;
            }
            const maximumIconSize = panelHeight - ICON_VERTICAL_RESERVE;
            if (iconSize > maximumIconSize)
                window._settings.set_int('icon-size', maximumIconSize);
        };
        window._settings.connect('changed::icon-size', fitPanelToIcons);
        window._settings.connect('changed::panel-height', fitIconsToPanel);

        let syncingWindowsXpTheme = false;
        const syncWindowsXpTheme = () => {
            const enabled = window._settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            if (enabled) {
                if (window._settings.get_boolean('default-gnome-panel')) {
                    window._settings.set_boolean(
                        'default-gnome-panel',
                        false
                    );
                }
                applyWindowsXpThemeSettings(window._settings);
            }
            syncingWindowsXpTheme = true;
            windowsXpThemeSwitch.active = enabled;
            panelHeightRow.get_adjustment().set_lower(
                enabled ? MIN_PANEL_HEIGHT : STANDARD_MIN_PANEL_HEIGHT
            );
            iconSpacingRow.get_adjustment().set_lower(
                enabled ? WINDOWS_XP_ICON_SPACING : 0
            );
            const iconSpacing = window._settings.get_int('icon-spacing');
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
            const settings = this.getSettings();
            settings.delay();
            setWindowsXpThemeEnabled(settings, enabled);
            settings.apply();
        };
        windowsXpThemeSwitch.connect('notify::active', () => {
            if (syncingWindowsXpTheme)
                return;

            const enabled = windowsXpThemeSwitch.active;
            if (enabled === window._settings.get_boolean(
                'windows-xp-theme-enabled'
            )) {
                return;
            }
            setWindowsXpTheme(enabled);
            syncWindowsXpTheme();
        });
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            syncWindowsXpTheme
        );
        window._settings.connect('changed::icon-size', syncWindowsXpTheme);
        window._settings.connect('changed::icon-spacing', syncWindowsXpTheme);
        window._settings.connect('changed::panel-height', syncWindowsXpTheme);
        window._settings.connect('changed::panel-position', syncWindowsXpTheme);
        window._settings.connect(
            'changed::panel-button-padding',
            syncWindowsXpTheme
        );
        window._settings.connect(
            'changed::custom-indicator-colors-enabled',
            syncWindowsXpTheme
        );
        window._settings.connect(
            'changed::custom-panel-color-enabled',
            syncWindowsXpTheme
        );
        window._settings.connect(
            'changed::activities-button-position',
            syncWindowsXpTheme
        );
        window._settings.connect('changed::app-alignment', syncWindowsXpTheme);
        window._settings.connect(
            'changed::start-button-position',
            syncWindowsXpTheme
        );
        window._settings.connect(
            'changed::use-pinned-apps-as-launchers',
            syncWindowsXpTheme
        );
        window._settings.connect(
            'changed::combine-app-buttons-mode',
            syncWindowsXpTheme
        );
        window._settings.connect(
            'changed::application-overflow-enabled',
            syncWindowsXpTheme
        );
        window._settings.connect(
            'changed::hide-app-labels',
            syncWindowsXpTheme
        );
        syncWindowsXpTheme();

        // Normalize any incompatible values written outside preferences.
        fitPanelToIcons();

        const followSystemThemeSwitch = new Adw.SwitchRow({
            title: _('Follow System Theme'),
            subtitle: _('Match the active GNOME Shell theme, independently of application colours'),
            active: window._settings.get_boolean('panel-theme-follow-system'),
        });
        panelAppearanceGroup.add(followSystemThemeSwitch);
        window._settings.bind(
            'panel-theme-follow-system',
            followSystemThemeSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const panelThemeRow = this._addComboRow(
            panelAppearanceGroup,
            window._settings,
            {
                key: 'panel-theme',
                title: _('Taskbar Theme'),
                subtitle: _('Choose the colour scheme when system matching is off'),
                choices: [
                    {value: 'light', label: _('Light')},
                    {value: 'dark', label: _('Dark')},
                ],
            }
        );
        panelThemeRow.sensitive = !followSystemThemeSwitch.active;
        followSystemThemeSwitch.connect('notify::active', widget => {
            panelThemeRow.sensitive = !widget.active;
            if (widget.active)
                window._settings.set_boolean(
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
            active: window._settings.get_boolean('transparency-enabled'),
        });
        panelAppearanceGroup.add(transparencySwitch);
        window._settings.bind(
            'transparency-enabled',
            transparencySwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const transparencyRowSubtitle = _(
            '0% is opaque and 100% is fully transparent'
        );
        const transparencyRow = this._addSpinRow(
            panelAppearanceGroup,
            window._settings,
            {
                key: 'transparency-level',
                title: _('Transparency'),
                subtitle: transparencyRowSubtitle,
                lower: 0,
                upper: 100,
            }
        );
        const updatePanelTransparencyControls = () => {
            const blocked = blurMyShellPanelBlurEnabled();
            const windowsXpThemeEnabled = window._settings.get_boolean(
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
        syncPanelTransparencyControls = updatePanelTransparencyControls;
        transparencySwitch.connect(
            'notify::active',
            updatePanelTransparencyControls
        );
        window._settings.connect(
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
            active: window._settings.get_boolean(
                'custom-panel-color-enabled'
            ),
        });
        advancedAppearanceGroup.add(customPanelColorSwitch);
        window._settings.bind(
            'custom-panel-color-enabled',
            customPanelColorSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const customPanelColorRow = this._addColorRow(
            advancedAppearanceGroup,
            window._settings,
            {
                key: 'custom-panel-color',
                title: _('Taskbar Color'),
            }
        );
        const customPanelTextColorSubtitle = _(
            'White text uses the dark panel theme; black text uses the light panel theme'
        );
        const customPanelTextColorRow = this._addComboRow(
            advancedAppearanceGroup,
            window._settings,
            {
                key: 'panel-theme',
                title: _('Taskbar Text Color'),
                subtitle: customPanelTextColorSubtitle,
                choices: [
                    {value: 'dark', label: _('White')},
                    {value: 'light', label: _('Black')},
                ],
            }
        );
        customPanelTextColorRow.connect('notify::selected', () => {
            if (window._settings.get_boolean('panel-theme-follow-system')) {
                window._settings.set_boolean(
                    'panel-theme-follow-system',
                    false
                );
            }
        });
        const updateCustomPanelColorControls = () => {
            const blocked = blurMyShellPanelBlurEnabled();
            const windowsXpThemeEnabled = window._settings.get_boolean(
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
        syncCustomPanelColorControls = updateCustomPanelColorControls;
        const syncPanelThemeControls = () => {
            const windowsXpThemeEnabled = window._settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            followSystemThemeSwitch.sensitive = !windowsXpThemeEnabled;
            panelThemeRow.sensitive = !windowsXpThemeEnabled &&
                !followSystemThemeSwitch.active;
        };
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            () => {
                syncPanelThemeControls();
                syncCustomPanelColorControls();
            }
        );
        window._settings.connect(
            'changed::panel-theme-follow-system',
            syncPanelThemeControls
        );
        syncPanelThemeControls();
        customPanelColorSwitch.connect(
            'notify::active',
            widget => {
                if (widget.active &&
                    window._settings.get_boolean(
                        'panel-theme-follow-system'
                    )) {
                    window._settings.set_boolean(
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
            active: window._settings.get_boolean('panel-border-enabled'),
        });
        panelAppearanceGroup.add(darkPanelBorderSwitch);
        window._settings.bind(
            'panel-border-enabled',
            darkPanelBorderSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const lightPanelBorderSwitch = new Adw.SwitchRow({
            title: _('Show Border in Light Mode'),
            subtitle: _('Display a thin border along the panel’s workspace-facing edge'),
            active: window._settings.get_boolean(
                'panel-border-light-enabled'
            ),
        });
        panelAppearanceGroup.add(lightPanelBorderSwitch);
        window._settings.bind(
            'panel-border-light-enabled',
            lightPanelBorderSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const syncPanelBorderControls = () => {
            const enabled = !window._settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            darkPanelBorderSwitch.sensitive = enabled;
            lightPanelBorderSwitch.sensitive = enabled;
        };
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            syncPanelBorderControls
        );
        syncPanelBorderControls();

        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Taskbar Behavior'),
        });
        page.add(behaviorGroup);

        const panelAutoHideSwitch = new Adw.SwitchRow({
            title: _('Auto-hide Panel'),
            subtitle: _('Reveal the taskbar when the pointer reaches its screen edge'),
            active: window._settings.get_boolean('panel-autohide-enabled'),
        });
        behaviorGroup.add(panelAutoHideSwitch);
        window._settings.bind(
            'panel-autohide-enabled',
            panelAutoHideSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const hotEdgeOverviewSwitch = new Adw.SwitchRow({
            title: _('Bottom Hot Edge'),
            subtitle: _('Push the pointer against the bottom screen edge to toggle Overview'),
            active: window._settings.get_boolean(
                'hot-edge-overview-enabled'
            ),
        });
        behaviorGroup.add(hotEdgeOverviewSwitch);
        window._settings.bind(
            'hot-edge-overview-enabled',
            hotEdgeOverviewSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const hotEdgePressureRow = this._addSpinRow(
            behaviorGroup,
            window._settings,
            {
                key: 'hot-edge-pressure-threshold',
                title: _('Activation Pressure'),
                subtitle: _(
                    'Pixels the pointer must travel past the bottom edge before Overview activates'
                ),
                lower: 0,
                upper: 500,
                step: 25,
            }
        );

        const hotEdgeAnimationSwitch = new Adw.SwitchRow({
            title: _('Hot Edge Animation'),
            subtitle: _('Show a ripple when the bottom hot edge activates'),
            active: window._settings.get_boolean(
                'hot-edge-animation-enabled'
            ),
        });
        window._settings.bind(
            'hot-edge-animation-enabled',
            hotEdgeAnimationSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const updateHotEdgeAnimationSwitch = () => {
            hotEdgeAnimationSwitch.sensitive = hotEdgeOverviewSwitch.active;
            hotEdgePressureRow.visible = hotEdgeOverviewSwitch.active;
        };
        hotEdgeOverviewSwitch.connect(
            'notify::active',
            updateHotEdgeAnimationSwitch
        );
        updateHotEdgeAnimationSwitch();

        const workspaceScrollSwitch = new Adw.SwitchRow({
            title: _('Workspace Scroll'),
            subtitle: _('Scroll over empty taskbar space to switch workspaces'),
            active: window._settings.get_boolean('workspace-scroll-enabled'),
        });
        behaviorGroup.add(workspaceScrollSwitch);
        window._settings.bind(
            'workspace-scroll-enabled',
            workspaceScrollSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const workspaceScrollDelayRow = this._addSpinRow(
            behaviorGroup,
            window._settings,
            {
                key: 'workspace-scroll-delay',
                title: _('Workspace Scroll Delay'),
                subtitle: _('Minimum delay between workspace changes in milliseconds'),
                lower: 5,
                upper: 250,
                step: 5,
            }
        );
        workspaceScrollDelayRow.sensitive = workspaceScrollSwitch.active;
        workspaceScrollSwitch.connect('notify::active', widget => {
            workspaceScrollDelayRow.sensitive = widget.active;
        });

        const middleClickCloseAppsSwitch = new Adw.SwitchRow({
            title: _('Middle Click Closes Applications'),
            subtitle: _('Close all application windows instead of opening a new window'),
            active: window._settings.get_boolean('middle-click-close-apps'),
        });
        advancedAppBehaviorGroup.add(middleClickCloseAppsSwitch);
        window._settings.bind(
            'middle-click-close-apps',
            middleClickCloseAppsSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const panelMenuClickOnlySwitch = new Adw.SwitchRow({
            title: _('Panel Menus Require Click'),
            subtitle: _('Switch between clock, system, and tray menus only when clicked'),
            active: window._settings.get_boolean('panel-menu-click-only'),
        });
        advancedBehaviorGroup.add(panelMenuClickOnlySwitch);
        window._settings.bind(
            'panel-menu-click-only',
            panelMenuClickOnlySwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const notificationBannerSwitch = new Adw.SwitchRow({
            title: _('Taskbar-aligned Notification Banners'),
            subtitle: _('Follow the taskbar edge and the clock’s horizontal position'),
            active: window._settings.get_boolean(
                'notification-banner-bottom-end'
            ),
        });
        advancedBehaviorGroup.add(notificationBannerSwitch);
        advancedBehaviorGroup.add(hotEdgeAnimationSwitch);
        window._settings.bind(
            'notification-banner-bottom-end',
            notificationBannerSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const allTaskManagerApps = Gio.AppInfo.get_all();
        const taskManagerApps = allTaskManagerApps
            .filter(app => app.should_show() && app.get_id())
            .map(app => ({
                value: app.get_id(),
                label: app.get_display_name() ?? app.get_name() ?? app.get_id(),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const configuredTaskManager = window._settings.get_string(
            'task-manager-app'
        );
        const availableTaskManagerIds = new Set(
            allTaskManagerApps
                .map(app => app.get_id())
                .filter(Boolean)
        );
        const effectiveTaskManager = resolveTaskManagerAppId(
            configuredTaskManager,
            availableTaskManagerIds
        );
        if (!taskManagerApps.some(app =>
            app.value === configuredTaskManager)) {
            taskManagerApps.unshift({
                value: configuredTaskManager,
                label: _('Automatic Fallback'),
            });
        }
        const taskManagerAppRow = this._addComboRow(
            behaviorGroup,
            window._settings,
            {
                key: 'task-manager-app',
                title: _('Task Manager Application'),
                subtitle: _('Application opened from the taskbar context menu'),
                choices: taskManagerApps,
                initialValue: effectiveTaskManager ?? configuredTaskManager,
            }
        );
        taskManagerAppRow.expression = Gtk.PropertyExpression.new(
            Gtk.StringObject.$gtype,
            null,
            'string'
        );
        taskManagerAppRow.search_match_mode =
            Gtk.StringFilterMatchMode.SUBSTRING;
        taskManagerAppRow.enable_search = true;

        const multiMonitorPanelsSwitch = new Adw.SwitchRow({
            title: _('Show Taskbar on All Monitors'),
            subtitle: _('Show Activities, applications, clock, and system menu on every monitor'),
            active: window._settings.get_boolean('multi-monitor-panels'),
        });
        behaviorGroup.add(multiMonitorPanelsSwitch);
        window._settings.bind(
            'multi-monitor-panels',
            multiMonitorPanelsSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const syncMonitorIsolationSensitivity = () => {
            isolateMonitorsSwitch.sensitive =
                window._settings.get_boolean('multi-monitor-panels');
        };
        window._settings.connect(
            'changed::multi-monitor-panels',
            syncMonitorIsolationSensitivity
        );
        syncMonitorIsolationSensitivity();

        const panelGroup = new Adw.PreferencesGroup({
            title: _('Panel Items'),
            description: _('Choose which optional panel items appear.'),
        });
        page.add(panelGroup);

        const startPositionRow = this._addComboRow(
            startButtonGroup,
            window._settings,
            {
                key: 'start-button-position',
                title: _('Start Button'),
                subtitle: _(
                    'Place the Start button at the left edge or in the center'
                ),
                choices: panelPositions.slice(0, 2),
            }
        );

        const followAppAlignmentSwitch = new Adw.SwitchRow({
            title: _('Follow Application Alignment'),
            subtitle: _('Move the Start button with the application buttons'),
            active: window._settings.get_boolean(
                'start-button-follow-app-alignment'
            ),
        });
        startButtonGroup.add(followAppAlignmentSwitch);
        window._settings.bind(
            'start-button-follow-app-alignment',
            followAppAlignmentSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const updateStartPositionRow = () => {
            const defaultPanel = window._settings.get_boolean(
                'default-gnome-panel'
            );
            const windowsXpTheme = window._settings.get_boolean(
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
        window._settings.connect(
            'changed::default-gnome-panel',
            updateStartPositionRow
        );
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            updateStartPositionRow
        );
        updateStartPositionRow();

        const startButtonPaddingRow = this._addSpinRow(
            startButtonGroup,
            window._settings,
            {
                key: 'start-button-padding',
                title: _('Start Button Padding'),
                subtitle: _('Horizontal space around the Start icon in pixels'),
                lower: 0,
                upper: 20,
            }
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
            const location = window._settings.get_string(
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
                extensionPath: this.path,
                settings: window._settings,
                parent: window,
            });
            dialog.present();
        });
        clearCustomIconButton.connect('clicked', () => {
            window._settings.set_string('start-button-custom-icon', '');
        });
        window._settings.connect(
            'changed::start-button-custom-icon',
            updateCustomIconRow
        );
        updateCustomIconRow();

        const syncXpStartButtonControls = () => {
            const enabled = window._settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            startButtonPaddingRow.sensitive = !enabled;
            customIconRow.sensitive = !enabled;
        };
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            syncXpStartButtonControls
        );
        syncXpStartButtonControls();

        const windowsStartMenuSwitch = new Adw.SwitchRow({
            title: _('Eleven-style Start Menu'),
            subtitle: _('Replace the GNOME app grid with an Eleven-style menu'),
            active: window._settings.get_boolean('windows-start-menu-enabled'),
        });
        startMenuGroup.add(windowsStartMenuSwitch);
        window._settings.bind(
            'windows-start-menu-enabled',
            windowsStartMenuSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const profilePictureSwitch = new Adw.SwitchRow({
            title: _('Show Profile Picture'),
            subtitle: _('Use your account picture in the Start Menu'),
            active: window._settings.get_boolean(
                'start-menu-show-profile-picture'
            ),
        });
        window._settings.bind(
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
            active: window._settings.get_boolean(
                'start-menu-power-options-enabled'
            ),
        });
        window._settings.bind(
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
            active: window._settings.get_boolean(
                'start-menu-open-all-apps'
            ),
        });
        window._settings.bind(
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
            active: window._settings.get_boolean(
                'start-menu-recommended-apps'
            ),
        });
        window._settings.bind(
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
            active: window._settings.get_boolean(
                'start-menu-hide-pinned-app-titles'
            ),
        });
        window._settings.bind(
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
            active: window._settings.get_boolean(
                'start-menu-app-categories'
            ),
        });
        startMenuGroup.add(appCategoriesSwitch);
        window._settings.bind(
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
            active: window._settings.get_boolean('gnome-start-button-visible'),
        });
        startButtonGroup.add(gnomeStartButtonVisibleSwitch);
        window._settings.bind(
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
            active: window._settings.get_boolean(
                'start-menu-follow-panel-theme'
            ),
        });
        startMenuGroup.add(followPanelThemeSwitch);
        window._settings.bind(
            'start-menu-follow-panel-theme',
            followPanelThemeSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const startMenuThemeRow = this._addComboRow(
            startMenuGroup,
            window._settings,
            {
                key: 'start-menu-theme',
                title: _('Start Menu Theme'),
                subtitle: _('Use a custom appearance or follow the GNOME Shell theme'),
                choices: [
                    {value: 'dark', label: _('Dark')},
                    {value: 'light', label: _('Light')},
                    {value: 'shell', label: _('GNOME Shell')},
                ],
            }
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
            active: window._settings.get_boolean(
                'start-menu-follow-panel-transparency'
            ),
        });
        advancedStartMenuGroup.add(followPanelTransparencySwitch);
        window._settings.bind(
            'start-menu-follow-panel-transparency',
            followPanelTransparencySwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const updateStartMenuTransparencyRow = () => {
            const panelBlur = blurMyShellPanelBlurEnabled();
            const popupBlur = blurMyShellPopupBlurEnabled();
            const blocked = panelBlur || popupBlur;
            const windowsXpThemeEnabled = window._settings.get_boolean(
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
        syncStartMenuTransparencyControl = updateStartMenuTransparencyRow;
        windowsStartMenuSwitch.connect(
            'notify::active',
            updateStartMenuTransparencyRow
        );
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            updateStartMenuTransparencyRow
        );
        updateStartMenuTransparencyRow();

        const centerStartMenuRow = new Adw.SwitchRow({
            title: _('Center Start Menu on Monitor'),
            subtitle: _('Place the menu at the true horizontal center instead of over the Start button'),
            active: window._settings.get_boolean('start-menu-monitor-centered'),
        });
        startMenuGroup.add(centerStartMenuRow);
        window._settings.bind(
            'start-menu-monitor-centered',
            centerStartMenuRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const updateCenterStartMenuRow = () => {
            const centered = followAppAlignmentSwitch.active
                ? window._settings.get_string('app-alignment') === 'center'
                : window._settings.get_string('start-button-position') ===
                    'center';
            centerStartMenuRow.sensitive =
                windowsStartMenuSwitch.active && centered;
        };
        window._settings.connect(
            'changed::start-button-position',
            updateCenterStartMenuRow
        );
        followAppAlignmentSwitch.connect(
            'notify::active',
            updateCenterStartMenuRow
        );
        window._settings.connect(
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
            active: window._settings.get_boolean('start-menu-super-key'),
        });
        startMenuKeybindingsGroup.add(superKeyRow);
        window._settings.bind(
            'start-menu-super-key',
            superKeyRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const superTabRow = new Adw.SwitchRow({
            title: _('Super+Tab Opens Start Menu'),
            subtitle: _('Use GNOME’s application-switch shortcut for the Eleven-style Start Menu while it is enabled'),
            active: window._settings.get_boolean('start-menu-super-tab'),
        });
        startMenuKeybindingsGroup.add(superTabRow);
        window._settings.bind(
            'start-menu-super-tab',
            superTabRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const updateSuperTabRow = () => {
            const windowsXpTheme = window._settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            superKeyRow.sensitive = windowsStartMenuSwitch.active &&
                !windowsXpTheme;
            superTabRow.sensitive = windowsStartMenuSwitch.active &&
                !superKeyRow.active;
        };
        superKeyRow.connect('notify::active', () => {
            if (superKeyRow.active && superTabRow.active)
                window._settings.set_boolean('start-menu-super-tab', false);
            updateSuperTabRow();
        });
        windowsStartMenuSwitch.connect(
            'notify::active',
            updateSuperTabRow
        );
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            updateSuperTabRow
        );
        updateSuperTabRow();

        const superEFileManagerRow = new Adw.SwitchRow({
            title: _('Super+E Opens File Manager'),
            subtitle: _(
                'Open your home folder with the system’s default file manager'
            ),
            active: window._settings.get_boolean(
                'super-e-file-manager-enabled'
            ),
        });
        advancedFileManagerGroup.add(superEFileManagerRow);
        window._settings.bind(
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
            const [accelerator] = window._settings.get_strv(
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
            this._openCustomShortcutDialog(window);
        });
        clearCustomShortcutButton.connect('clicked', () => {
            window._settings.set_strv('start-menu-custom-hotkey', []);
        });
        window._settings.connect(
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

        const activitiesButtonSwitch = new Adw.SwitchRow({
            title: _('Show Activities Button'),
            subtitle: _('Display GNOME’s workspace overview button on the taskbar'),
            active: window._settings.get_boolean('activities-button-visible'),
        });
        panelGroup.add(activitiesButtonSwitch);
        window._settings.bind(
            'activities-button-visible',
            activitiesButtonSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const showDesktopSwitch = new Adw.SwitchRow({
            title: _('Show Desktop Button'),
            subtitle: _('Display a button that minimizes or restores all windows'),
            active: window._settings.get_boolean(
                'show-desktop-button-visible'
            ),
        });
        panelGroup.add(showDesktopSwitch);
        window._settings.bind(
            'show-desktop-button-visible',
            showDesktopSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const volumeMixerSwitch = new Adw.SwitchRow({
            title: _('Application Volume Mixer'),
            subtitle: _('Add per-application volume controls to Quick Settings'),
            active: window._settings.get_boolean('volume-mixer-enabled'),
        });
        panelGroup.add(volumeMixerSwitch);
        window._settings.bind(
            'volume-mixer-enabled',
            volumeMixerSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const trayOverflowSwitch = new Adw.SwitchRow({
            title: _('Collect Tray Icons'),
            subtitle: _('Gather application tray icons behind a panel arrow'),
            active: window._settings.get_boolean('tray-overflow-enabled'),
        });
        panelGroup.add(trayOverflowSwitch);
        window._settings.bind(
            'tray-overflow-enabled',
            trayOverflowSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const folderMenuSwitch = new Adw.SwitchRow({
            title: _('Show Folder Menu'),
            subtitle: _('Show a selected folder on the taskbar'),
            active: window._settings.get_boolean('folder-menu-enabled'),
        });
        panelGroup.add(folderMenuSwitch);
        window._settings.bind(
            'folder-menu-enabled',
            folderMenuSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const folderMenuRow = new Adw.ActionRow({
            title: _('Folder Menu Location'),
        });
        const chooseFolderButton = new Gtk.Button({
            label: _('Choose…'),
            valign: Gtk.Align.CENTER,
        });
        folderMenuRow.add_suffix(chooseFolderButton);
        folderMenuRow.activatable_widget = chooseFolderButton;
        panelGroup.add(folderMenuRow);

        const updateFolderMenuRow = () => {
            const location = window._settings.get_string('folder-menu-uri');
            if (location) {
                const file = location.includes('://')
                    ? Gio.File.new_for_uri(location)
                    : Gio.File.new_for_path(location);
                folderMenuRow.subtitle = file.get_parse_name();
            } else {
                folderMenuRow.subtitle = _('No folder selected');
            }
            folderMenuRow.sensitive = folderMenuSwitch.active;
        };
        chooseFolderButton.connect('clicked', () => {
            this._selectFolderMenuLocation(window);
        });
        window._settings.connect(
            'changed::folder-menu-uri',
            updateFolderMenuRow
        );
        folderMenuSwitch.connect('notify::active', updateFolderMenuRow);
        updateFolderMenuRow();

        const panelOrderGroups = new Map([
            ['left', new Adw.PreferencesGroup({
                title: _('Left Items'),
                description: _(
                    'Move items only within their current panel position.'
                ),
            })],
            ['center', new Adw.PreferencesGroup({
                title: _('Center Items'),
            })],
            ['right', new Adw.PreferencesGroup({
                title: _('Right Items'),
            })],
        ]);
        for (const group of panelOrderGroups.values())
            page.add(group);

        const panelOrderDefinitions = new Map([
            ['left-box', {
                title: _('Left Box'),
                subtitle: _('Other GNOME Shell and extension items'),
                choices: [panelPositions[0]],
                fixedPosition: 'left',
            }],
            ['center-box', {
                title: _('Center Box'),
                subtitle: _('Other GNOME Shell and extension items'),
                choices: [panelPositions[1]],
                fixedPosition: 'center',
            }],
            ['right-box', {
                title: _('Right Box'),
                subtitle: _('Other GNOME Shell and extension items'),
                choices: [panelPositions[2]],
                fixedPosition: 'right',
            }],
            ['start-button', {
                key: 'start-button-position',
                title: _('Start Button'),
                subtitle: _('Eleven-style or original GNOME Start button'),
                choices: panelPositions.slice(0, 2),
            }],
            ['activities', {
                key: 'activities-button-position',
                title: _('Activities'),
                subtitle: _('GNOME workspace overview button'),
                choices: panelPositions,
            }],
            ['applications', {
                key: 'app-alignment',
                title: _('Applications'),
                subtitle: _('Taskbar application buttons'),
                choices: panelPositions.slice(0, 2),
            }],
            ['folder-menu', {
                key: 'folder-menu-position',
                title: _('Folder Menu'),
                subtitle: _('Selected folder shortcuts'),
                choices: panelPositions,
            }],
            ['tray-overflow', {
                key: 'tray-overflow-position',
                title: _('Tray icons'),
                subtitle: _('Gather application tray icons behind a panel arrow'),
                choices: panelPositions,
            }],
            ['system-menu', {
                key: 'system-menu-position',
                title: _('System Menu'),
                subtitle: _('Quick Settings, volume, network, and power'),
                choices: panelPositions,
            }],
            ['clock', {
                key: 'clock-position',
                title: _('Clock'),
                choices: panelPositions,
            }],
            ['show-desktop', {
                key: 'show-desktop-button-position',
                title: _('Show Desktop Button'),
                subtitle: _('Minimize or restore all windows'),
                choices: panelPositions.filter(
                    position => position.value !== 'center'
                ),
            }],
        ]);
        const panelOrderRows = new Map();
        for (const id of DEFAULT_PANEL_ITEM_ORDER) {
            const controls = this._createPanelOrderRow(
                window._settings,
                panelOrderDefinitions.get(id)
            );
            panelOrderRows.set(id, controls);
        }
        const activitiesPanelPositions = panelPositions.filter(
            position => position.value !== 'center'
        );
        const syncActivitiesPositionChoices = () => {
            const choices = window._settings.get_boolean(
                'windows-xp-theme-enabled'
            ) ? activitiesPanelPositions : panelPositions;
            panelOrderRows.get('activities').setChoices(choices);
        };
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            syncActivitiesPositionChoices
        );
        syncActivitiesPositionChoices();

        const getPanelItemPosition = id => {
            const definition = panelOrderDefinitions.get(id);
            if (definition.fixedPosition)
                return definition.fixedPosition;

            if (id === 'start-button' &&
                followAppAlignmentSwitch.active) {
                return window._settings.get_string('app-alignment');
            }

            return window._settings.get_string(definition.key);
        };
        const isPanelItemLocked = id => {
            if (window._settings.get_boolean('windows-xp-theme-enabled')) {
                return [
                    'right-box',
                    'start-button',
                    'activities',
                    'applications',
                    'show-desktop',
                    'tray-overflow',
                    'system-menu',
                    'clock',
                ].includes(id);
            }
            if (window._settings.get_boolean('default-gnome-panel'))
                return id === 'start-button' || id === 'applications';
            return false;
        };
        const syncPanelItemOrder = () => {
            const stored = window._settings.get_strv('panel-item-order');
            const order = normalizePanelItemOrder(stored);
            if (stored.length !== order.length ||
                stored.some((id, index) => id !== order[index])) {
                window._settings.set_strv('panel-item-order', order);
                return;
            }

            for (const controls of panelOrderRows.values()) {
                if (controls.group) {
                    controls.group.remove(controls.row);
                    controls.group = null;
                }
            }

            const positionOrders = new Map([
                ['left', []],
                ['center', []],
                ['right', []],
            ]);
            for (const id of order) {
                const controls = panelOrderRows.get(id);
                const position = getPanelItemPosition(id);
                const group = panelOrderGroups.get(position);
                controls.syncPosition(position);
                group.add(controls.row);
                controls.group = group;
                positionOrders.get(position).push(id);
            }
            for (const positionOrder of positionOrders.values()) {
                for (const [index, id] of positionOrder.entries()) {
                    const controls = panelOrderRows.get(id);
                    const previousId = positionOrder[index - 1];
                    const nextId = positionOrder[index + 1];
                    controls.upButton.sensitive =
                        index > 0 &&
                        !isPanelItemLocked(id) &&
                        !isPanelItemLocked(previousId);
                    controls.downButton.sensitive =
                        index < positionOrder.length - 1 &&
                        !isPanelItemLocked(id) &&
                        !isPanelItemLocked(nextId);
                }
            }
        };
        const movePanelItem = (id, offset) => {
            if (isPanelItemLocked(id))
                return;

            const order = normalizePanelItemOrder(
                window._settings.get_strv('panel-item-order')
            );
            const position = getPanelItemPosition(id);
            const positionOrder = order.filter(
                candidate => getPanelItemPosition(candidate) === position
            );
            const index = positionOrder.indexOf(id);
            const targetIndex = index + offset;
            if (index < 0 || targetIndex < 0 ||
                targetIndex >= positionOrder.length) {
                return;
            }

            const otherId = positionOrder[targetIndex];
            if (isPanelItemLocked(otherId))
                return;

            const orderIndex = order.indexOf(id);
            const otherOrderIndex = order.indexOf(otherId);
            [order[orderIndex], order[otherOrderIndex]] =
                [order[otherOrderIndex], order[orderIndex]];
            window._settings.set_strv('panel-item-order', order);
        };
        for (const [id, controls] of panelOrderRows) {
            controls.upButton.connect('clicked', () => {
                movePanelItem(id, -1);
            });
            controls.downButton.connect('clicked', () => {
                movePanelItem(id, 1);
            });
        }
        window._settings.connect(
            'changed::panel-item-order',
            syncPanelItemOrder
        );
        for (const definition of panelOrderDefinitions.values()) {
            if (definition.fixedPosition)
                continue;

            window._settings.connect(
                `changed::${definition.key}`,
                syncPanelItemOrder
            );
        }

        const syncPanelPositionSensitivity = () => {
            const defaultPanel = window._settings.get_boolean(
                'default-gnome-panel'
            );
            const windowsXpTheme = window._settings.get_boolean(
                'windows-xp-theme-enabled'
            );
            windowsStartMenuSwitch.sensitive = !windowsXpTheme;
            panelOrderRows.get('start-button').positionDropDown.sensitive =
                !defaultPanel && !windowsXpTheme &&
                !followAppAlignmentSwitch.active;
            panelOrderRows.get('applications').positionDropDown.sensitive =
                !defaultPanel && !windowsXpTheme;
            panelOrderRows.get('system-menu').positionDropDown.sensitive =
                !windowsXpTheme;
            panelOrderRows.get('clock').positionDropDown.sensitive =
                !windowsXpTheme;
            panelOrderRows.get('activities').positionDropDown.sensitive =
                activitiesButtonSwitch.active;
            panelOrderRows.get('folder-menu').positionDropDown.sensitive =
                !windowsXpTheme && folderMenuSwitch.active;
            panelOrderRows.get('tray-overflow').positionDropDown.sensitive =
                !windowsXpTheme && trayOverflowSwitch.active;
            panelOrderRows.get('show-desktop').positionDropDown.sensitive =
                !windowsXpTheme && showDesktopSwitch.active;
        };
        followAppAlignmentSwitch.connect(
            'notify::active',
            () => {
                syncPanelPositionSensitivity();
                syncPanelItemOrder();
            }
        );
        activitiesButtonSwitch.connect(
            'notify::active',
            syncPanelPositionSensitivity
        );
        folderMenuSwitch.connect(
            'notify::active',
            syncPanelPositionSensitivity
        );
        trayOverflowSwitch.connect(
            'notify::active',
            syncPanelPositionSensitivity
        );
        showDesktopSwitch.connect(
            'notify::active',
            syncPanelPositionSensitivity
        );
        window._settings.connect(
            'changed::default-gnome-panel',
            () => {
                syncPanelItemOrder();
                syncPanelPositionSensitivity();
            }
        );
        window._settings.connect(
            'changed::windows-xp-theme-enabled',
            () => {
                syncPanelItemOrder();
                syncPanelPositionSensitivity();
            }
        );
        syncPanelItemOrder();
        syncPanelPositionSensitivity();

        const resetGroup = new Adw.PreferencesGroup({
            title: _('Reset'),
        });
        page.add(resetGroup);

        const resetRow = new Adw.ActionRow({
            title: _('Reset All Settings'),
            subtitle: _('Restore defaults without changing pinned taskbar or Start Menu apps'),
        });
        const resetButton = new Gtk.Button({
            label: _('Reset…'),
            valign: Gtk.Align.CENTER,
        });
        resetButton.add_css_class('destructive-action');
        resetButton.connect('clicked', () => {
            this._confirmReset(window);
        });
        resetRow.add_suffix(resetButton);
        resetRow.activatable_widget = resetButton;
        resetGroup.add(resetRow);
    }

    _confirmReset(window) {
        const dialog = new Adw.AlertDialog({
            heading: _('Reset all settings?'),
            body: _('This will restore taskbar and Start Menu settings. Pinned taskbar and Start Menu apps, including their order, will be kept.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset'));
        dialog.set_response_appearance(
            'reset',
            Adw.ResponseAppearance.DESTRUCTIVE
        );
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.choose(window, null, (source, result) => {
            let response;
            try {
                response = source.choose_finish(result);
            } catch (error) {
                console.error(error);
                return;
            }
            if (response !== 'reset')
                return;

            // delay() is permanent for a Gio.Settings instance. Use a
            // temporary instance so the preferences window keeps writing
            // subsequent changes immediately after the reset.
            const resetSettings = this.getSettings();
            resetSettings.delay();
            for (const key of resetSettings.settings_schema.list_keys()) {
                if (key === 'start-menu-displaced-overlay-key' ||
                    key === 'start-menu-pinned-apps') {
                    continue;
                }
                resetSettings.reset(key);
            }
            resetSettings.apply();
        });
    }

    _openCustomShortcutDialog(window) {
        const dialog = new Adw.Window({
            title: _('Set Custom Shortcut'),
            transient_for: window,
            modal: true,
            resizable: false,
            default_width: 420,
            default_height: 230,
        });
        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });
        content.append(new Adw.HeaderBar());
        const statusPage = new Adw.StatusPage({
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            title: _('Press a keyboard shortcut'),
            description: _('Press Backspace to clear it, or Escape to cancel.'),
            vexpand: true,
        });
        content.append(statusPage);
        dialog.content = content;

        const keyController = new Gtk.EventControllerKey();
        dialog.add_controller(keyController);
        keyController.connect(
            'key-pressed',
            (controller, keyval, _keycode, state) => {
                let modifiers = state &
                    Gtk.accelerator_get_default_mod_mask();
                modifiers &= ~Gdk.ModifierType.LOCK_MASK;

                if (keyval === Gdk.KEY_Escape) {
                    dialog.close();
                    return Gdk.EVENT_STOP;
                }
                if (keyval === Gdk.KEY_BackSpace && modifiers === 0) {
                    window._settings.set_strv(
                        'start-menu-custom-hotkey',
                        []
                    );
                    dialog.close();
                    return Gdk.EVENT_STOP;
                }

                const event = controller.get_current_event();
                if (event?.is_modifier())
                    return Gdk.EVENT_STOP;

                let normalizedKeyval = Gdk.keyval_to_lower(keyval);
                if (normalizedKeyval === Gdk.KEY_ISO_Left_Tab)
                    normalizedKeyval = Gdk.KEY_Tab;
                if (normalizedKeyval !== keyval)
                    modifiers |= Gdk.ModifierType.SHIFT_MASK;

                const valid = Gtk.accelerator_valid(
                    normalizedKeyval,
                    modifiers
                ) || (normalizedKeyval === Gdk.KEY_Tab && modifiers !== 0);
                if (!valid) {
                    statusPage.description = _(
                        'That shortcut needs a modifier key. Try another shortcut.'
                    );
                    return Gdk.EVENT_STOP;
                }

                const accelerator = Gtk.accelerator_name(
                    normalizedKeyval,
                    modifiers
                );
                if (this._findManagedShortcutConflict(
                    window._settings,
                    accelerator
                )) {
                    statusPage.description = _(
                        'That shortcut is already in use. Press a different shortcut.'
                    );
                    return Gdk.EVENT_STOP;
                }

                window._settings.set_strv(
                    'start-menu-custom-hotkey',
                    [accelerator]
                );
                dialog.close();
                return Gdk.EVENT_STOP;
            }
        );
        dialog.present();
    }

    _selectFolderMenuLocation(window) {
        const dialog = new Gtk.FileDialog({
            title: _('Choose a Folder'),
        });
        const currentLocation = window._settings.get_string(
            'folder-menu-uri'
        );
        if (currentLocation) {
            dialog.initial_folder = currentLocation.includes('://')
                ? Gio.File.new_for_uri(currentLocation)
                : Gio.File.new_for_path(currentLocation);
        }
        dialog.select_folder(window, null, (source, result) => {
            let folder;
            try {
                folder = source.select_folder_finish(result);
            } catch (_error) {
                return;
            }
            window._settings.set_string('folder-menu-uri', folder.get_uri());
        });
    }

    _findManagedShortcutConflict(settings, accelerator) {
        const managed = [];
        if (settings.get_boolean('grid-alt-tab-enabled')) {
            managed.push(
                ...settings.get_strv('grid-alt-tab-hotkey'),
                ...settings.get_strv(
                    'grid-alt-tab-backward-hotkey'
                )
            );
        }
        if (settings.get_boolean('super-e-file-manager-enabled')) {
            managed.push(
                ...settings.get_strv('super-e-file-manager-hotkey')
            );
        }
        const startMenuAvailable =
            settings.get_boolean('windows-start-menu-enabled') &&
            !settings.get_boolean('default-gnome-panel');
        if (startMenuAvailable &&
            (settings.get_boolean('start-menu-super-key') ||
                settings.get_boolean('start-menu-super-tab'))) {
            managed.push(
                ...settings.get_strv('start-menu-super-tab-hotkey')
            );
        }

        const normalized = normalizeAccelerator(accelerator);
        return managed.some(candidate =>
            normalizeAccelerator(candidate) === normalized);
    }

    _addSpinRow(group, settings, {
        key,
        title,
        subtitle,
        lower,
        upper,
        step = 1,
    }) {
        const row = Adw.SpinRow.new_with_range(lower, upper, step);
        row.title = title;
        row.subtitle = subtitle;
        row.set_value(settings.get_int(key));
        row.connect('notify::value', widget => {
            settings.set_int(key, Math.round(widget.get_value()));
        });
        settings.connect(`changed::${key}`, () => {
            const value = settings.get_int(key);
            if (row.get_value() !== value)
                row.set_value(value);
        });
        group.add(row);
        return row;
    }

    _createPanelOrderRow(settings, {
        key,
        title,
        subtitle = '',
        choices,
        fixedPosition = null,
    }) {
        let currentChoices = choices;
        const createModel = availableChoices => {
            const model = new Gtk.StringList();
            for (const choice of availableChoices)
                model.append(choice.label);
            return model;
        };
        const positionDropDown = new Gtk.DropDown({
            model: createModel(currentChoices),
            tooltip_text: _('Panel Position'),
            valign: Gtk.Align.CENTER,
        });
        let syncingPosition = false;
        const syncPosition = value => {
            const index = currentChoices.findIndex(
                choice => choice.value === value
            );
            if (index < 0 || positionDropDown.selected === index)
                return;

            syncingPosition = true;
            positionDropDown.selected = index;
            syncingPosition = false;
        };
        const setChoices = availableChoices => {
            currentChoices = availableChoices;
            syncingPosition = true;
            positionDropDown.set_model(createModel(currentChoices));
            const index = currentChoices.findIndex(
                choice => choice.value === settings.get_string(key)
            );
            positionDropDown.selected = index < 0 ? 0 : index;
            syncingPosition = false;
        };
        if (fixedPosition) {
            syncPosition(fixedPosition);
            positionDropDown.sensitive = false;
        } else {
            syncPosition(settings.get_string(key));
            positionDropDown.connect('notify::selected', widget => {
                if (syncingPosition)
                    return;

                const choice = currentChoices[widget.selected];
                if (choice)
                    settings.set_string(key, choice.value);
            });
            settings.connect(`changed::${key}`, () => {
                syncPosition(settings.get_string(key));
            });
        }

        const upButton = new Gtk.Button({
            icon_name: 'go-up-symbolic',
            tooltip_text: _('Move Up'),
            valign: Gtk.Align.CENTER,
        });
        const downButton = new Gtk.Button({
            icon_name: 'go-down-symbolic',
            tooltip_text: _('Move Down'),
            valign: Gtk.Align.CENTER,
        });
        upButton.add_css_class('flat');
        downButton.add_css_class('flat');
        const moveBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            valign: Gtk.Align.CENTER,
        });
        moveBox.append(upButton);
        moveBox.append(downButton);

        const row = new Adw.ActionRow({title, subtitle});
        row.add_prefix(moveBox);
        row.add_suffix(positionDropDown);
        row.activatable_widget = positionDropDown;

        return {
            row,
            positionDropDown,
            upButton,
            downButton,
            setChoices,
            syncPosition,
            group: null,
        };
    }

    _addComboRow(group, settings, {
        key,
        title,
        subtitle = '',
        choices,
        initialValue = null,
        choicesProvider = () => choices,
        choicesChangedKey = null,
    }) {
        const createModel = availableChoices => {
            const model = new Gtk.StringList();
            for (const choice of availableChoices)
                model.append(choice.label);
            return model;
        };
        let currentChoices = choicesProvider();
        let syncingChoices = false;

        const row = new Adw.ComboRow({
            title,
            subtitle,
            model: createModel(currentChoices),
        });
        const currentValue = initialValue ?? settings.get_string(key);
        const selected = currentChoices.findIndex(
            choice => choice.value === currentValue
        );
        row.set_selected(Math.max(selected, 0));
        row.connect('notify::selected', widget => {
            if (syncingChoices)
                return;

            const choice = currentChoices[widget.get_selected()];
            if (choice)
                settings.set_string(key, choice.value);
        });
        settings.connect(`changed::${key}`, () => {
            const value = settings.get_string(key);
            const index = currentChoices.findIndex(
                choice => choice.value === value
            );
            if (index >= 0 && row.get_selected() !== index)
                row.set_selected(index);
        });
        if (choicesChangedKey) {
            settings.connect(`changed::${choicesChangedKey}`, () => {
                currentChoices = choicesProvider();
                syncingChoices = true;
                row.set_model(createModel(currentChoices));
                const value = settings.get_string(key);
                const index = currentChoices.findIndex(
                    choice => choice.value === value
                );
                row.set_selected(Math.max(index, 0));
                syncingChoices = false;
            });
        }
        group.add(row);
        return row;
    }

    _addColorRow(group, settings, {key, title}) {
        const dialog = new Gtk.ColorDialog({title});
        const button = new Gtk.ColorDialogButton({
            dialog,
            valign: Gtk.Align.CENTER,
        });
        const row = new Adw.ActionRow({title});
        row.add_suffix(button);
        row.activatable_widget = button;

        let syncing = false;
        const syncColor = () => {
            const color = new Gdk.RGBA();
            color.parse(settings.get_string(key));
            syncing = true;
            button.rgba = color;
            syncing = false;
        };
        button.connect('notify::rgba', () => {
            if (!syncing)
                settings.set_string(key, button.rgba.to_string());
        });
        settings.connect(`changed::${key}`, syncColor);
        syncColor();
        group.add(row);
        return row;
    }
}
