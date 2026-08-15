// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {SecondaryPanelController} from './secondaryPanelController.js';

export class SecondaryPanelManager {
    constructor({
        extensionDir,
        settings,
        appSystem,
        tracker,
        favorites,
        spreadAppWindows,
        openPreferences,
    }) {
        this._extensionDir = extensionDir;
        this._settings = settings;
        this._appSystem = appSystem;
        this._tracker = tracker;
        this._favorites = favorites;
        this._spreadAppWindows = spreadAppWindows;
        this._openPreferences = openPreferences;
        this._signalHolder = new TransientSignalHolder();
        this._panels = [];
        this._rebuildId = 0;
    }

    enable() {
        this._settings.connectObject(
            'changed::multi-monitor-panels', () => this._queueRebuild(),
            'changed::panel-position', () => this._queueRebuild(),
            this._signalHolder
        );
        Main.layoutManager.connectObject(
            'monitors-changed', () => this._queueRebuild(),
            this._signalHolder
        );
        this._rebuild();
    }

    destroy() {
        if (this._rebuildId) {
            GLib.Source.remove(this._rebuildId);
            this._rebuildId = 0;
        }
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._destroyPanels();
        this._extensionDir = null;
        this._settings = null;
        this._appSystem = null;
        this._tracker = null;
        this._favorites = null;
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
                spreadAppWindows: this._spreadAppWindows,
                monitor,
                openPreferences: this._openPreferences,
            });
            this._panels.push(panel);
            panel.enable();
        }
    }

    _destroyPanels() {
        for (const panel of this._panels)
            panel.destroy();
        this._panels = [];
    }
}
