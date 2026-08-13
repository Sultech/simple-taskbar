// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DEFAULT_PANEL_ITEM_ORDER} from './panelItemOrder.js';
import {
    BLUR_MY_SHELL_UUID,
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from './blurMyShellUtils.js';
import {resolveTaskManagerAppId} from './taskManagerUtils.js';
import {applyDefaultTaskbarSettings} from './taskbarDefaults.js';
import {confirmReset} from './prefs/preferencesDialogs.js';
import {
    addColorRow,
    addComboRow,
    addSpinRow,
} from './prefs/preferencesWidgets.js';
import {addPanelAppearancePage} from './prefs/panelAppearancePage.js';
import {addPanelItemsPage} from './prefs/panelItemsPage.js';
import {addStartMenuPage} from './prefs/startMenuPage.js';
import {addWindowSwitchingPage} from './prefs/windowSwitchingPage.js';

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

        addWindowSwitchingPage(window, window._settings);

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

        const startMenu = addStartMenuPage({
            window,
            page: startMenuPage,
            settings: window._settings,
            extensionPath: this.path,
            panelPositions,
            advancedStartMenuGroup,
            advancedFileManagerGroup,
            blurMyShellPanelBlurEnabled,
            blurMyShellPopupBlurEnabled,
        });
        const followAppAlignmentSwitch =
            startMenu.followAppAlignmentSwitch;
        const windowsStartMenuSwitch =
            startMenu.windowsStartMenuSwitch;
        syncStartMenuTransparencyControl = startMenu.syncTransparency;

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

        const panelButtonPaddingRow = addSpinRow(
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

        const iconSizeRow = addSpinRow(
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
        const iconSpacingRow = addSpinRow(
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
        const indicatorStyleRow = addComboRow(
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
        const focusedIndicatorColorRow = addColorRow(
            advancedAppearanceGroup,
            window._settings,
            {
                key: 'focused-indicator-color',
                title: _('Focused Indicator Color'),
            }
        );
        const unfocusedIndicatorColorRow = addColorRow(
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
        const appAlignmentRow = addComboRow(
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
        const combineAppButtonsRow = addComboRow(
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

        const applicationOverflowStyleRow = addComboRow(
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

        const panelAppearance = addPanelAppearancePage({
            page,
            settings: window._settings,
            createSettings: () => this.getSettings(),
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
        });
        syncPanelTransparencyControls =
            panelAppearance.syncTransparency;
        syncCustomPanelColorControls =
            panelAppearance.syncCustomColor;

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

        const hotEdgePressureRow = addSpinRow(
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

        const workspaceScrollDelayRow = addSpinRow(
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
        const taskManagerAppRow = addComboRow(
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

        addPanelItemsPage({
            window,
            settings: window._settings,
            page,
            panelPositions,
            windowsStartMenuSwitch,
            followAppAlignmentSwitch,
        });

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
            confirmReset(window, () => this.getSettings());
        });
        resetRow.add_suffix(resetButton);
        resetRow.activatable_widget = resetButton;
        resetGroup.add(resetRow);
    }

}
