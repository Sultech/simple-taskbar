// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {BLUR_MY_SHELL_UUID} from '../shared/blurMyShellUtils.js';
import {
    getPanelBlur,
    refreshPanelBlurVisibility,
} from '../integration/blurMyShellRuntime.js';
import {SecondaryPanelController} from './secondaryPanelController.js';

export class SecondaryPanelManager {
    constructor({
        extensionDir,
        settings,
        appSystem,
        tracker,
        favorites,
        notificationBadgeModel,
        spreadAppWindows,
        openPreferences,
    }) {
        this._extensionDir = extensionDir;
        this._settings = settings;
        this._appSystem = appSystem;
        this._tracker = tracker;
        this._favorites = favorites;
        this._notificationBadgeModel = notificationBadgeModel;
        this._spreadAppWindows = spreadAppWindows;
        this._openPreferences = openPreferences;
        this._signalHolder = new TransientSignalHolder();
        this._panels = [];
        this._rebuildId = 0;
        this._blurMyShellSyncId = 0;
    }

    enable() {
        this._settings.connectObject(
            'changed::multi-monitor-panels', () => this._queueRebuild(),
            this._signalHolder
        );
        Main.layoutManager.connectObject(
            'monitors-changed', () => this._queueRebuild(),
            this._signalHolder
        );
        Main.extensionManager.connectObject(
            'extension-state-changed',
            (_manager, extension) => {
                if (extension.uuid === BLUR_MY_SHELL_UUID)
                    this._queueBlurMyShellSync();
            },
            this._signalHolder
        );
        this._rebuild();
    }

    destroy() {
        if (this._rebuildId) {
            GLib.Source.remove(this._rebuildId);
            this._rebuildId = 0;
        }
        if (this._blurMyShellSyncId) {
            GLib.Source.remove(this._blurMyShellSyncId);
            this._blurMyShellSyncId = 0;
        }
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._destroyPanels();
        this._extensionDir = null;
        this._settings = null;
        this._appSystem = null;
        this._tracker = null;
        this._favorites = null;
        this._notificationBadgeModel = null;
        this._spreadAppWindows = null;
        this._openPreferences = null;
    }

    hasPanelAt(x, y) {
        return this._panels.some(panel => panel.containsPoint(x, y));
    }

    toggleStartMenuAt(x, y) {
        const target = this._panels.find(panel => panel.containsPoint(x, y));
        if (!target)
            return false;

        for (const panel of this._panels) {
            if (panel !== target)
                panel.closeStartMenus();
        }
        target.toggleStartMenu();
        return true;
    }

    closeStartMenus() {
        for (const panel of this._panels)
            panel.closeStartMenus();
    }

    closePanelMenus() {
        for (const panel of this._panels)
            panel.closePanelMenu();
    }

    _queueRebuild() {
        if (this._rebuildId)
            return;

        this._rebuildId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._rebuildId = 0;
                this._rebuild();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _rebuild() {
        this._destroyPanels();
        if (!this._settings.get_boolean('multi-monitor-panels'))
            return;

        const primaryMonitor = Main.layoutManager.primaryMonitor;
        for (const monitor of Main.layoutManager.monitors) {
            if (monitor === primaryMonitor)
                continue;

            const panel = new SecondaryPanelController({
                extensionDir: this._extensionDir,
                settings: this._settings,
                appSystem: this._appSystem,
                tracker: this._tracker,
                favorites: this._favorites,
                notificationBadgeModel: this._notificationBadgeModel,
                spreadAppWindows: this._spreadAppWindows,
                monitor,
                openPreferences: this._openPreferences,
            });
            this._panels.push(panel);
            panel.enable();
        }
        this._queueBlurMyShellSync();
    }

    _destroyPanels() {
        for (const panel of this._panels)
            panel.destroy();
        this._panels = [];
    }

    _queueBlurMyShellSync() {
        if (this._blurMyShellSyncId)
            return;

        this._blurMyShellSyncId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._blurMyShellSyncId = 0;
                this._syncBlurMyShell();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _syncBlurMyShell() {
        if (this._panels.length === 0)
            return;

        const panelBlur = getPanelBlur();
        if (!panelBlur)
            return;

        for (const panel of this._panels)
            panelBlur.maybe_blur_panel(panel.actor);

        if (!Main.overview.visibleTarget)
            refreshPanelBlurVisibility(panelBlur);

        for (const panel of this._panels)
            panel.syncTheme();
    }
}
