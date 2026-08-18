// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addResetGroup} from './src/prefs/preferencesDialogs.js';
import {addAdvancedPage} from './src/prefs/advancedPage.js';
import {
    addPanelModeGroup,
    connectDefaultGnomePanelSync,
} from './src/prefs/panelModeGroup.js';
import {addApplicationIconsGroup} from './src/prefs/applicationIconsGroup.js';
import {addAppBehaviorGroup} from './src/prefs/appBehaviorGroup.js';
import {addTaskbarBehaviorGroup} from './src/prefs/taskbarBehaviorGroup.js';
import {createBlurMyShellState} from './src/prefs/blurMyShellState.js';
import {addPanelAppearancePage} from './src/prefs/panelAppearancePage.js';
import {addPanelItemsPage} from './src/prefs/panelItemsPage.js';
import {addStartMenuPage} from './src/prefs/startMenuPage.js';
import {SettingsSignalTracker} from './src/prefs/settingsSignalTracker.js';
import {addWindowSwitchingPage} from './src/prefs/windowSwitchingPage.js';

export default class SimpleTaskbarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(820, 740);
        window._settings = this.getSettings();
        const settingsSignalTracker = new SettingsSignalTracker();
        window.connect('close-request', () => settingsSignalTracker.destroy());
        const connectSettings = (settings, signal, callback) =>
            settingsSignalTracker.connect(settings, signal, callback);
        const blurMyShell = createBlurMyShellState(connectSettings);
        const blurMyShellPanelBlurEnabled =
            blurMyShell.blurMyShellPanelBlurEnabled;
        const blurMyShellPopupBlurEnabled =
            blurMyShell.blurMyShellPopupBlurEnabled;
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

        addWindowSwitchingPage(
            window,
            window._settings,
            connectSettings
        );

        const startMenuPage = new Adw.PreferencesPage({
            title: _('Start Menu'),
            icon_name: 'view-app-grid-symbolic',
        });
        window.add(startMenuPage);

        const {
            advancedAppearanceGroup,
            advancedAppBehaviorGroup,
            advancedBehaviorGroup,
            advancedFileManagerGroup,
            advancedStartMenuGroup,
        } = addAdvancedPage(window);

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
            connectSettings,
        });
        const followAppAlignmentSwitch =
            startMenu.followAppAlignmentSwitch;
        const windowsStartMenuSwitch =
            startMenu.windowsStartMenuSwitch;
        blurMyShell.setStartMenuSync(startMenu.syncTransparency);

        const panelMode = addPanelModeGroup({
            page,
            settings: window._settings,
            connectSettings,
        });
        const defaultGnomePanelSwitch = panelMode.defaultGnomePanelSwitch;
        const windowsXpThemeSwitch = panelMode.windowsXpThemeSwitch;
        const panelButtonPaddingRow = panelMode.panelButtonPaddingRow;

        const icons = addApplicationIconsGroup({
            page,
            settings: window._settings,
            connectSettings,
            panelPositions,
            advancedAppearanceGroup,
        });
        const appearanceGroup = icons.appearanceGroup;
        const iconSizeRow = icons.iconSizeRow;
        const iconSpacingRow = icons.iconSpacingRow;
        const appAlignmentRow = icons.appAlignmentRow;

        const appBehavior = addAppBehaviorGroup({
            settings: window._settings,
            connectSettings,
            advancedAppBehaviorGroup,
            advancedFileManagerGroup,
        });
        const pinnedAppsAsLaunchersSwitch =
            appBehavior.pinnedAppsAsLaunchersSwitch;
        const combineAppButtonsRow = appBehavior.combineAppButtonsRow;
        const applicationOverflowSwitch =
            appBehavior.applicationOverflowSwitch;
        const isolateMonitorsSwitch = appBehavior.isolateMonitorsSwitch;
        const nautilusPlacesSwitch = appBehavior.nautilusPlacesSwitch;
        const syncLabelSensitivity = appBehavior.syncLabelSensitivity;

        connectDefaultGnomePanelSync({
            settings: window._settings,
            createSettings: () => this.getSettings(),
            connectSettings,
            defaultGnomePanelSwitch,
            appearanceGroup,
            startMenuPage,
            advancedAppBehaviorGroup,
            advancedStartMenuGroup,
            nautilusPlacesSwitch,
        });

        const panelAppearance = addPanelAppearancePage({
            page,
            settings: window._settings,
            connectSettings,
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
        blurMyShell.setPanelSyncs(
            panelAppearance.syncTransparency,
            panelAppearance.syncCustomColor
        );

        addTaskbarBehaviorGroup({
            page,
            settings: window._settings,
            connectSettings,
            advancedBehaviorGroup,
            isolateMonitorsSwitch,
        });

        addPanelItemsPage({
            window,
            settings: window._settings,
            connectSettings,
            page,
            panelPositions,
            windowsStartMenuSwitch,
            followAppAlignmentSwitch,
        });

        addResetGroup(page, window, () => this.getSettings());
    }
}
