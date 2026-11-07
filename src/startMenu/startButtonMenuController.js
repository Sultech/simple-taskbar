// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {StartMenuController} from './startMenuController.js';
import {StartButtonContextMenuController} from './startButtonContextMenuController.js';
import {panelArrowSide, syncMenuArrowSide} from '../panel/panelMenuPositioner.js';
import {openPanelPopupMenu} from '../popupMenuUtils.js';
import {dynamicTaskbarEnabled} from '../shared/panelModeSettings.js';
import {setStylePseudoClass} from '../shared/styleUtils.js';

export class StartButtonMenuController {
    constructor({settings, actor, previewController, openPreferences, openFileManager,
        closeApp, getInterestingWindows, getPanelEdgeGap, getMonitor, getPanelHeight,
        toggleFromShortcut, toggleDesktop, onMenuOpenStateChanged, powerGIcon, settingsGIcon}) {
        this._settings = settings;
        this.actor = actor;
        this._previews = previewController;
        this._openPreferences = openPreferences;
        this._openFileManager = openFileManager;
        this._closeApp = closeApp;
        this._getInterestingWindows = getInterestingWindows;
        this._getPanelEdgeGap = getPanelEdgeGap;
        this._getMonitor = getMonitor;
        this._getPanelHeight = getPanelHeight;
        this._toggleFromShortcut = toggleFromShortcut;
        this._toggleDesktop = toggleDesktop;
        this._onMenuOpenStateChanged = onMenuOpenStateChanged;
        this._powerGIcon = powerGIcon;
        this._settingsGIcon = settingsGIcon;
        this._startOpenedOverview = false;
        this._startMenuController = null;
        this._openAfterOverviewIdleId = 0;
        this._openAfterOverviewHiddenId = 0;
        this._openAfterOverviewShowingId = 0;
        this._contextMenu = null;
        this._contextMenuController = null;
        this._menuManager = null;
    }

    enable() {
        if (this.windowsModeEnabled)
            this.ensureStartMenuController();
        this._createContextMenu();
        this._connectOverviewSignals();
    }

    get startMenu() {
        return this._startMenuController;
    }

    get contextMenu() {
        return this._contextMenu;
    }

    resetOverviewOrigin() {
        this._startOpenedOverview = false;
    }

    destroy() {
        this._cancelStartMenuAfterOverview();
        Main.overview.disconnectObject(this);
        this.actor.disconnectObject(this);
        this._contextMenu.disconnectObject(this);
        Main.overview.dash.showAppsButton.disconnectObject(this);
        this._setActivitiesOverviewState(Main.overview._shown);
        this._contextMenuController.destroy();
        this._contextMenuController = null;
        this._contextMenu.destroy();
        this._contextMenu = null;
        this._startMenuController?.destroy();
        this._startMenuController = null;
        this._menuManager = null;
        this._settings = null;
        this.actor = null;
        this._previews = null;
        this._openPreferences = null;
        this._openFileManager = null;
        this._closeApp = null;
        this._getInterestingWindows = null;
        this._getPanelEdgeGap = null;
        this._getMonitor = null;
        this._getPanelHeight = null;
        this._toggleFromShortcut = null;
        this._toggleDesktop = null;
        this._onMenuOpenStateChanged = null;
        this._powerGIcon = null;
        this._settingsGIcon = null;
    }

    _connectOverviewSignals() {
        const shellShowAppsButton = Main.overview.dash.showAppsButton;
        shellShowAppsButton.connectObject('notify::checked', () => {
            this.syncState();
            this.notifyMenuOpenStateChanged();
        }, this);
        Main.overview.connectObject('showing', () => {
            if (shellShowAppsButton.checked)
                this._setActivitiesOverviewState(false);
        }, this);
        Main.overview.connectObject('hidden', () => {
            this.actor.checked = this.windowsModeEnabled
                ? Boolean(this._startMenuController?.isOpen)
                : false;
            this._startOpenedOverview = false;
            this._setActivitiesOverviewState(false);
            this.notifyMenuOpenStateChanged();
        }, this);
    }

    get menuIsOpen() {
        return Boolean(
            this._startMenuController?.isOpen || this._contextMenu.isOpen
        );
    }

    toggleStartMenu() {
        if (!this.windowsModeEnabled)
            return;

        this._previews.hideTooltip(false);
        this._previews.hide();
        if (Main.overview.visible) {
            this._openStartMenuAfterOverview();
            Main.overview.hide();
            return;
        }
        this.ensureStartMenuController().toggle();
    }

    _openStartMenuAfterOverview() {
        this._cancelStartMenuAfterOverview();
        this._openAfterOverviewHiddenId = Main.overview.connect('hidden', () => {
            this._cancelStartMenuAfterOverview();
            this._openAfterOverviewIdleId = GLib.idle_add(
                GLib.PRIORITY_DEFAULT,
                () => {
                    this._openAfterOverviewIdleId = 0;
                    if (this.windowsModeEnabled)
                        this.ensureStartMenuController().open();
                    return GLib.SOURCE_REMOVE;
                }
            );
        });
        this._openAfterOverviewShowingId = Main.overview.connect(
            'showing', () => this._cancelStartMenuAfterOverview()
        );
    }

    _cancelStartMenuAfterOverview() {
        if (this._openAfterOverviewIdleId) {
            GLib.Source.remove(this._openAfterOverviewIdleId);
            this._openAfterOverviewIdleId = 0;
        }
        if (this._openAfterOverviewHiddenId) {
            Main.overview.disconnect(this._openAfterOverviewHiddenId);
            this._openAfterOverviewHiddenId = 0;
        }
        if (this._openAfterOverviewShowingId) {
            Main.overview.disconnect(this._openAfterOverviewShowingId);
            this._openAfterOverviewShowingId = 0;
        }
    }

    closeMenus() {
        this._startMenuController?.close();
        this._contextMenu.close();
    }

    _ensureMenuManager() {
        if (this._menuManager)
            return this._menuManager;

        this._menuManager = new PopupMenu.PopupMenuManager();
        this._menuManager._changeMenu = () => {};
        return this._menuManager;
    }

    ensureStartMenuController() {
        if (this._startMenuController)
            return this._startMenuController;

        this._ensureMenuManager();
        this._startMenuController = new StartMenuController(
            this.actor,
            this._settings,
            {
                onOpenStateChanged: open => {
                    if (this.windowsModeEnabled)
                        this.actor.checked = open;
                    this.notifyMenuOpenStateChanged();
                },
                menuManager: this._menuManager,
                onSourceContextMenu: () => this.openContextMenu(),
                closeApp: (app, timestamp) =>
                    this._closeApp(app, timestamp),
                getInterestingWindows: app =>
                    this._getInterestingWindows(app),
                powerGIcon: this._powerGIcon,
                settingsGIcon: this._settingsGIcon,
                getPanelEdgeGap: this._getPanelEdgeGap,
                getMonitor: this._getMonitor,
                getPanelHeight: this._getPanelHeight,
            }
        );
        return this._startMenuController;
    }

    _createContextMenu() {
        this._ensureMenuManager();
        const menu = new PopupMenu.PopupMenu(
            this.actor,
            0.5,
            panelArrowSide(this._settings)
        );
        this._contextMenuController = new StartButtonContextMenuController({
            settings: this._settings,
            menu,
            closeMenus: () => this.closeMenus(),
            openFileManager: () => this._openFileManager(),
            toggleDesktop: () => this._toggleDesktop(),
        });
        menu.addAction(_('Start Menu Settings'), () => {
            this._settings.set_string('target-prefs-page', 'start-menu');
            this._openPreferences();
        });
        if (this._settings.isDock) {
            menu.addAction(_('Dock Settings'), () => {
                this._settings.set_string('target-prefs-page', 'dock');
                this._openPreferences();
            });
        } else {
            menu.addAction(_('Taskbar Settings'), () => {
                this._settings.set_string('target-prefs-page', 'taskbar');
                this._openPreferences();
            });
        }
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        this._menuManager.addMenu(menu);
        this._contextMenu = menu;
        menu.connectObject('open-state-changed', () => {
            this.notifyMenuOpenStateChanged();
        }, this);

        this.actor.connectObject('event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
                event.get_button() !== Clutter.BUTTON_SECONDARY)
                return Clutter.EVENT_PROPAGATE;

            this.openContextMenu();
            return Clutter.EVENT_STOP;
        }, this);
        this.actor.connectObject('popup-menu', () => {
            this.openContextMenu();
            return Clutter.EVENT_STOP;
        }, this);
    }

    openContextMenu() {
        this._startMenuController?.close();
        this._previews.hideTooltip(false);
        this._previews.hide();
        syncMenuArrowSide(this._contextMenu, this._settings);
        this._contextMenuController.sync();
        openPanelPopupMenu(this._contextMenu, this.actor, dynamicTaskbarEnabled(this._settings));
    }

    notifyMenuOpenStateChanged() {
        const shellShowAppsButton = Main.overview.dash.showAppsButton;
        const open = this.windowsModeEnabled
            ? this.menuIsOpen
            : shellShowAppsButton.checked;
        this._onMenuOpenStateChanged(open);
    }

    toggleApplications() {
        if (this.windowsModeEnabled) {
            this.toggleStartMenu();
            return;
        }

        const shellShowAppsButton = Main.overview.dash.showAppsButton;

        if (this.actor.checked) {
            this._startOpenedOverview = !Main.overview.visible;
            if (!shellShowAppsButton.checked)
                shellShowAppsButton.checked = true;
            Main.overview.show(OverviewControls.ControlsState.APP_GRID);
        } else if (this._startOpenedOverview) {
            this._startOpenedOverview = false;
            Main.overview.hide();
        } else {
            if (shellShowAppsButton.checked)
                shellShowAppsButton.checked = false;
            else
                Main.overview.show(OverviewControls.ControlsState.WINDOW_PICKER);
        }
    }

    toggleApplicationsFromShortcut() {
        if (this._toggleFromShortcut) {
            this._toggleFromShortcut();
            return;
        }

        this.toggleApplications();
    }

    toggleOverviewFromShortcut() {
        this._startMenuController?.close();
        this._contextMenu.close();
        this._previews.hideTooltip(false);
        this._previews.hide();
        Main.overview.toggle();
    }

    syncState() {
        const shellShowAppsButton = Main.overview.dash.showAppsButton;
        const applicationsActive = shellShowAppsButton.checked;
        this.actor.checked = this.windowsModeEnabled
            ? Boolean(this._startMenuController?.isOpen)
            : applicationsActive;
        this._setActivitiesOverviewState(
            !applicationsActive && Main.overview._shown
        );
    }

    _setActivitiesOverviewState(active) {
        const activitiesButton = Main.panel.statusArea.activities;
        setStylePseudoClass(activitiesButton, 'checked', active);
    }

    get windowsModeEnabled() {
        return this._settings.get_boolean('windows-start-menu-enabled');
    }
}
