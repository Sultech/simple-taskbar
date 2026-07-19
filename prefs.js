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

const MIN_PANEL_HEIGHT = 32;
const MAX_ICON_SIZE = 48;
const ICON_VERTICAL_RESERVE = 14;

export default class SimpleTaskbarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();
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

        const startMenuPage = new Adw.PreferencesPage({
            title: _('Start Menu'),
            icon_name: 'view-app-grid-symbolic',
        });
        window.add(startMenuPage);

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

        const showRequestedPage = () => {
            const target = window._settings.get_string('target-prefs-page');
            if (target === 'start-menu')
                window.set_visible_page(startMenuPage);

            if (target)
                window._settings.set_string('target-prefs-page', '');
        };
        window._settings.connect(
            'changed::target-prefs-page',
            showRequestedPage
        );
        showRequestedPage();

        const panelModeGroup = new Adw.PreferencesGroup({
            title: _('Panel Mode'),
        });
        page.add(panelModeGroup);

        const defaultGnomePanelSwitch = new Adw.SwitchRow({
            title: _('Default GNOME Panel'),
            subtitle: _('Hide taskbar applications and use the original Dash in Overview'),
            active: window._settings.get_boolean('default-gnome-panel'),
        });
        panelModeGroup.add(defaultGnomePanelSwitch);

        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Application Icons'),
            description: _('Change the size, spacing, and placement of taskbar icons.'),
        });
        page.add(appearanceGroup);

        this._addSpinRow(appearanceGroup, window._settings, {
            key: 'icon-size',
            title: _('Icon Size'),
            subtitle: _('The panel grows automatically when larger icons need more room'),
            lower: 16,
            upper: MAX_ICON_SIZE,
        });
        this._addSpinRow(appearanceGroup, window._settings, {
            key: 'icon-spacing',
            title: _('Icon Spacing'),
            subtitle: _('Space between application buttons'),
            lower: 0,
            upper: 16,
        });
        this._addComboRow(appearanceGroup, window._settings, {
            key: 'app-alignment',
            title: _('Icon Alignment'),
            subtitle: _('Place application icons at the left or center'),
            choices: panelPositions.slice(0, 2),
        });

        const hidePinnedAppsSwitch = new Adw.SwitchRow({
            title: _('Hide Pinned Applications'),
            subtitle: _('Show pinned taskbar applications only while they are running'),
            active: window._settings.get_boolean(
                'hide-pinned-taskbar-apps'
            ),
        });
        appearanceGroup.add(hidePinnedAppsSwitch);
        window._settings.bind(
            'hide-pinned-taskbar-apps',
            hidePinnedAppsSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const isolateWorkspacesSwitch = new Adw.SwitchRow({
            title: _('Isolate Workspaces'),
            subtitle: _('Show running applications from the current workspace only'),
            active: window._settings.get_boolean('isolate-workspaces'),
        });
        appearanceGroup.add(isolateWorkspacesSwitch);
        window._settings.bind(
            'isolate-workspaces',
            isolateWorkspacesSwitch,
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

        let syncingDefaultGnomePanel = false;
        const syncDefaultGnomePanel = () => {
            const enabled = window._settings.get_boolean(
                'default-gnome-panel'
            );
            syncingDefaultGnomePanel = true;
            defaultGnomePanelSwitch.active = enabled;
            appearanceGroup.sensitive = !enabled;
            appearanceGroup.description = enabled
                ? _('Application icons are unavailable in Default GNOME Panel mode.')
                : _('Change the size, spacing, and placement of taskbar icons.');
            syncingDefaultGnomePanel = false;
        };

        const setDefaultGnomePanel = enabled => {
            // Apply the mode and layout together.
            const settings = this.getSettings();
            settings.delay();
            settings.set_boolean('default-gnome-panel', enabled);
            if (enabled) {
                settings.set_int('panel-height', 32);
                settings.set_string('panel-position', 'top');
                settings.set_boolean('activities-button-visible', true);
                settings.set_string('clock-position', 'center');
                settings.set_string('system-menu-position', 'right');
                settings.set_boolean('multi-monitor-panels', true);
                settings.set_boolean('windows-start-menu-enabled', false);
                settings.set_boolean('gnome-start-button-visible', false);
            } else {
                settings.set_int('icon-size', 28);
                settings.set_int('icon-spacing', 5);
                settings.set_int('panel-height', 44);
                settings.set_string('panel-position', 'bottom');
                settings.set_string('app-alignment', 'center');
                settings.set_string('start-button-position', 'center');
                settings.set_int('start-button-padding', 4);
                settings.set_string('clock-position', 'right');
                settings.set_string('system-menu-position', 'right');
                settings.set_boolean('activities-button-visible', true);
                settings.set_boolean('multi-monitor-panels', true);
                settings.set_boolean('windows-start-menu-enabled', true);
                settings.set_boolean('gnome-start-button-visible', true);
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

        this._addSpinRow(panelAppearanceGroup, window._settings, {
            key: 'panel-height',
            title: _('Panel Height'),
            subtitle: _('Oversized icons shrink automatically when the panel is reduced'),
            lower: MIN_PANEL_HEIGHT,
            upper: 80,
        });
        this._addComboRow(panelAppearanceGroup, window._settings, {
            key: 'panel-position',
            title: _('Panel Position'),
            subtitle: _('Place the taskbar at the top or bottom of the screen'),
            choices: [
                {value: 'top', label: _('Top')},
                {value: 'bottom', label: _('Bottom')},
            ],
        });

        const fitPanelToIcons = () => {
            if (window._settings.get_boolean('default-gnome-panel'))
                return;

            const iconSize = window._settings.get_int('icon-size');
            const panelHeight = window._settings.get_int('panel-height');
            const minimumPanelHeight = iconSize + ICON_VERTICAL_RESERVE;
            if (panelHeight < minimumPanelHeight)
                window._settings.set_int('panel-height', minimumPanelHeight);
        };
        const fitIconsToPanel = () => {
            if (window._settings.get_boolean('default-gnome-panel'))
                return;

            const iconSize = window._settings.get_int('icon-size');
            const panelHeight = window._settings.get_int('panel-height');
            const maximumIconSize = panelHeight - ICON_VERTICAL_RESERVE;
            if (iconSize > maximumIconSize)
                window._settings.set_int('icon-size', maximumIconSize);
        };
        window._settings.connect('changed::icon-size', fitPanelToIcons);
        window._settings.connect('changed::panel-height', fitIconsToPanel);

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
        });

        const transparencySwitch = new Adw.SwitchRow({
            title: _('Enable Transparency'),
            subtitle: _('Make the taskbar background transparent'),
            active: window._settings.get_boolean('transparency-enabled'),
        });
        panelAppearanceGroup.add(transparencySwitch);
        window._settings.bind(
            'transparency-enabled',
            transparencySwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const transparencyRow = this._addSpinRow(
            panelAppearanceGroup,
            window._settings,
            {
                key: 'transparency-level',
                title: _('Transparency'),
                subtitle: _('0% is opaque and 100% is fully transparent'),
                lower: 0,
                upper: 100,
            }
        );
        transparencyRow.sensitive = transparencySwitch.active;
        transparencySwitch.connect('notify::active', widget => {
            transparencyRow.sensitive = widget.active;
        });

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

        const panelMenuClickOnlySwitch = new Adw.SwitchRow({
            title: _('Panel Menus Require Click'),
            subtitle: _('Switch between clock, system, and tray menus only when clicked'),
            active: window._settings.get_boolean('panel-menu-click-only'),
        });
        behaviorGroup.add(panelMenuClickOnlySwitch);
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
        behaviorGroup.add(notificationBannerSwitch);
        window._settings.bind(
            'notification-banner-bottom-end',
            notificationBannerSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const taskManagerApps = Gio.AppInfo.get_all()
            .filter(app => app.should_show() && app.get_id())
            .map(app => ({
                value: app.get_id(),
                label: app.get_display_name() ?? app.get_name() ?? app.get_id(),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const configuredTaskManager = window._settings.get_string(
            'task-manager-app'
        );
        if (!taskManagerApps.some(app =>
            app.value === configuredTaskManager)) {
            taskManagerApps.unshift({
                value: configuredTaskManager,
                label: _('%s (Unavailable)').replace(
                    '%s',
                    configuredTaskManager
                ),
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
            }
        );
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

        const panelGroup = new Adw.PreferencesGroup({
            title: _('Panel Items'),
            description: _('Choose where taskbar and system items appear.'),
        });
        page.add(panelGroup);

        const startPositionRow = this._addComboRow(startButtonGroup, window._settings, {
            key: 'start-button-position',
            title: _('Start Button'),
            subtitle: _('Place the Start button at the left edge or in the center'),
            choices: panelPositions.slice(0, 2),
        });

        this._addSpinRow(startButtonGroup, window._settings, {
            key: 'start-button-padding',
            title: _('Start Button Padding'),
            subtitle: _('Horizontal space around the Start icon in pixels'),
            lower: 0,
            upper: 20,
        });

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
                const file = location.includes('://')
                    ? Gio.File.new_for_uri(location)
                    : Gio.File.new_for_path(location);
                customIconRow.subtitle = file.get_basename() ?? location;
            } else {
                customIconRow.subtitle = _('Using the built-in icon');
            }
            clearCustomIconButton.visible = Boolean(location);
        };
        chooseCustomIconButton.connect('clicked', () => {
            this._selectStartButtonIcon(window);
        });
        clearCustomIconButton.connect('clicked', () => {
            window._settings.set_string('start-button-custom-icon', '');
        });
        window._settings.connect(
            'changed::start-button-custom-icon',
            updateCustomIconRow
        );
        updateCustomIconRow();

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
        startMenuThemeRow.sensitive = windowsStartMenuSwitch.active;
        windowsStartMenuSwitch.connect('notify::active', widget => {
            startMenuThemeRow.sensitive = widget.active;
        });

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
            const centered = window._settings.get_string('start-button-position') ===
                'center';
            centerStartMenuRow.sensitive =
                windowsStartMenuSwitch.active && centered;
        };
        startPositionRow.connect('notify::selected', updateCenterStartMenuRow);
        windowsStartMenuSwitch.connect(
            'notify::active',
            updateCenterStartMenuRow
        );
        updateCenterStartMenuRow();

        const superTabRow = new Adw.SwitchRow({
            title: _('Super+Tab Opens Start Menu'),
            subtitle: _('Use GNOME’s application-switch shortcut for the Eleven-style Start Menu while it is enabled'),
            active: window._settings.get_boolean('start-menu-super-tab'),
        });
        startMenuGroup.add(superTabRow);
        window._settings.bind(
            'start-menu-super-tab',
            superTabRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        const updateSuperTabRow = () => {
            superTabRow.sensitive = windowsStartMenuSwitch.active;
        };
        windowsStartMenuSwitch.connect(
            'notify::active',
            updateSuperTabRow
        );
        updateSuperTabRow();

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
        startMenuGroup.add(customShortcutRow);

        const updateCustomShortcutRow = () => {
            const [accelerator] = window._settings.get_strv(
                'start-menu-custom-hotkey'
            );
            customShortcutLabel.accelerator = accelerator ?? '';
            clearCustomShortcutButton.visible = Boolean(accelerator);
            customShortcutRow.sensitive =
                windowsStartMenuSwitch.active && !superTabRow.active;
            customShortcutRow.subtitle = superTabRow.active
                ? _('Turn off Super+Tab to use a custom shortcut')
                : _('Choose any unused keyboard shortcut; none is assigned by default');
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

        this._addComboRow(panelGroup, window._settings, {
            key: 'clock-position',
            title: _('Clock'),
            choices: panelPositions,
        });
        this._addComboRow(panelGroup, window._settings, {
            key: 'system-menu-position',
            title: _('System Menu'),
            subtitle: _('Quick Settings, volume, network, and power'),
            choices: panelPositions,
        });

        const folderMenuSwitch = new Adw.SwitchRow({
            title: _('Show Folder Menu'),
            subtitle: _('Place a selected folder on the right of the taskbar'),
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

        const resetGroup = new Adw.PreferencesGroup({
            title: _('Reset'),
        });
        page.add(resetGroup);

        const resetRow = new Adw.ActionRow({
            title: _('Reset All Settings'),
            subtitle: _('Restore defaults without changing pinned taskbar apps'),
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
            body: _('This will restore taskbar and Start menu settings, including pinned Start apps. Pinned taskbar apps and their order will be kept.'),
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
                if (key === 'start-menu-displaced-switch-applications')
                    continue;
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
                if (this._findShortcutConflict(accelerator)) {
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

    _selectStartButtonIcon(window) {
        const imageFilter = new Gtk.FileFilter({
            name: _('Image Files'),
        });
        for (const mimeType of [
            'image/png',
            'image/svg+xml',
            'image/jpeg',
            'image/webp',
            'image/gif',
        ])
            imageFilter.add_mime_type(mimeType);

        const filters = new Gio.ListStore({
            item_type: Gtk.FileFilter,
        });
        filters.append(imageFilter);
        const dialog = new Gtk.FileDialog({
            title: _('Choose a Start Button Icon'),
            filters,
            default_filter: imageFilter,
        });
        dialog.open(window, null, (source, result) => {
            let file;
            try {
                file = source.open_finish(result);
            } catch (_error) {
                return;
            }
            window._settings.set_string(
                'start-button-custom-icon',
                file.get_uri()
            );
        });
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

    _findShortcutConflict(accelerator) {
        const schemaIds = [
            'org.gnome.mutter.keybindings',
            'org.gnome.mutter.wayland.keybindings',
            'org.gnome.shell.keybindings',
            'org.gnome.desktop.wm.keybindings',
            'org.gnome.settings-daemon.plugins.media-keys',
        ];

        for (const schemaId of schemaIds) {
            let settings;
            try {
                settings = new Gio.Settings({schema_id: schemaId});
            } catch (_error) {
                continue;
            }

            for (const key of settings.settings_schema.list_keys()) {
                const value = settings.get_value(key);
                if (value.get_type_string() === 'as' &&
                    value.deep_unpack().includes(accelerator))
                    return true;
            }
        }
        return false;
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

    _addComboRow(group, settings, {key, title, subtitle = '', choices}) {
        const model = new Gtk.StringList();
        for (const choice of choices)
            model.append(choice.label);

        const row = new Adw.ComboRow({
            title,
            subtitle,
            model,
        });
        const currentValue = settings.get_string(key);
        const selected = choices.findIndex(choice => choice.value === currentValue);
        row.set_selected(Math.max(selected, 0));
        row.connect('notify::selected', widget => {
            const choice = choices[widget.get_selected()];
            if (choice)
                settings.set_string(key, choice.value);
        });
        settings.connect(`changed::${key}`, () => {
            const value = settings.get_string(key);
            const index = choices.findIndex(choice => choice.value === value);
            if (index >= 0 && row.get_selected() !== index)
                row.set_selected(index);
        });
        group.add(row);
        return row;
    }
}
