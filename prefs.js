// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addApplicationIconsGroup} from './src/prefs/applicationIconsGroup.js';
import {addDockAppearanceGroup} from './src/prefs/dockAppearanceGroup.js';
import {addDockBehaviorGroup} from './src/prefs/dockBehaviorGroup.js';
import {addTaskbarBehaviorGroup} from './src/prefs/taskbarBehaviorGroup.js';
import {createBlurMyShellState} from './src/prefs/blurMyShellState.js';
import {addPanelAppearancePage} from './src/prefs/panelAppearancePage.js';
import {addPanelItemsPage} from './src/prefs/panelItemsPage.js';
import {addDockItemsPage} from './src/prefs/dockItemsPage.js';
import {addLocationsGroup} from './src/prefs/locationsGroup.js';
import {addStartMenuPage} from './src/prefs/startMenuPage.js';
import {SettingsSignalTracker} from './src/prefs/settingsSignalTracker.js';
import {addGeneralPage} from './src/prefs/generalPage.js';
import {addDockHub, addTaskbarHub} from './src/prefs/panelSettingsHubs.js';
import {addAboutPage} from './src/prefs/aboutPage.js';
import {createRoutedSettings} from './src/shared/routedSettings.js';
export default class SimpleTaskbarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        Gtk.IconTheme.get_for_display(window.get_display()).add_search_path(
            `${this.path}/icons/scalable/actions`
        );
        window.set_default_size(640, 740);
        const createSettings = () => createRoutedSettings(this.getSettings(),
            this.getSettings(`${this.metadata['settings-schema']}.legacy`));
        window._settings = createSettings();
        const settings = window._settings;
        const settingsSignalTracker = new SettingsSignalTracker();
        window.connect('close-request', () => settingsSignalTracker.destroy());
        const connectSettings = (object, signal, callback) =>
            settingsSignalTracker.connect(object, signal, callback);
        const blurMyShell = createBlurMyShellState(connectSettings);
        const blurMyShellPanelBlurEnabled =
            blurMyShell.blurMyShellPanelBlurEnabled;
        const panelPositions = [
            {value: 'left', label: _('Left')},
            {value: 'center', label: _('Center')},
            {value: 'right', label: _('Right')},
        ];

        addGeneralPage({window, settings, createSettings, connectSettings});

        const taskbarPage = new Adw.PreferencesPage({
            title: _('Taskbar'),
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(taskbarPage);
        const taskbar = addTaskbarHub({window, page: taskbarPage});

        const dockPage = new Adw.PreferencesPage({
            title: _('Dock'),
            icon_name: 'simple-taskbar-dock-symbolic',
        });
        window.add(dockPage);
        const dock = addDockHub({window, page: dockPage, settings, connectSettings});

        const startMenuPage = new Adw.PreferencesPage({
            title: _('Start Menu'),
            icon_name: 'view-app-grid-symbolic',
        });
        window.add(startMenuPage);
        const startMenu = addStartMenuPage({
            window,
            page: startMenuPage,
            taskbarPage,
            dockPage,
            settings,
            extensionPath: this.path,
            panelPositions,
            blurMyShellPanelBlurEnabled,
            blurMyShellPopupBlurEnabled: blurMyShell.blurMyShellPopupBlurEnabled,
            connectSettings,
        });
        blurMyShell.setStartMenuSync(startMenu.syncTransparency);

        const icons = addApplicationIconsGroup({
            pages: taskbar,
            dockPages: dock,
            settings,
            connectSettings,
            panelPositions,
        });

        const panelAppearance = addPanelAppearancePage({
            sizePage: taskbar.size,
            appearancePage: taskbar.appearance,
            settings,
            connectSettings,
            createSettings,
            blurMyShellPanelBlurEnabled,
            iconSizeRow: icons.iconSizeRow,
            iconSpacingRow: icons.iconSpacingRow,
            iconEdgePaddingRow: icons.iconEdgePaddingRow,
            appAlignmentRow: icons.appAlignmentRow,
            combineAppButtonsRow: icons.combineAppButtonsRow,
            syncLabelSensitivity: icons.syncLabelSensitivity,
        });
        blurMyShell.setPanelSyncs(
            panelAppearance.syncTransparency,
            panelAppearance.syncCustomColor
        );

        const dockAppearance = addDockAppearanceGroup({
            sizePage: dock.size,
            appearancePage: dock.appearance,
            settings,
            connectSettings,
            createSettings,
            blurMyShellPanelBlurEnabled,
            blurMyShellDockBlurEnabled: blurMyShell.blurMyShellDockBlurEnabled,
        });
        blurMyShell.setDockPanelSyncs(
            dockAppearance.syncTransparency,
            dockAppearance.syncCustomColor
        );

        addTaskbarBehaviorGroup({
            visibilityPage: taskbar.visibility,
            behaviorPage: taskbar.behavior,
            settings,
            connectSettings,
            isolateMonitorsSwitch: icons.isolateMonitorsSwitch,
        });
        addDockBehaviorGroup({
            visibilityPage: dock.visibility,
            behaviorPage: dock.behavior,
            settings,
            connectSettings,
        });

        addPanelItemsPage({
            window,
            settings,
            connectSettings,
            page: taskbar.items,
            panelPositions,
            windowsStartMenuSwitch: startMenu.windowsStartMenuSwitch,
            followAppAlignmentSwitch: startMenu.followAppAlignmentSwitch,
        });
        addDockItemsPage({
            page: dock.items,
            settings,
            connectSettings,
            panelPositions,
        });

        addLocationsGroup({
            page: taskbar.locations,
            dockPage: dock.locations,
            settings,
            connectSettings,
        });

        addAboutPage(window, this.path);
    }
}
