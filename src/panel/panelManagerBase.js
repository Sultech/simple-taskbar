// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

export class PanelManagerBase {
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
        this._panels = null;
    }

    hasPanelAt(x, y) {
        return this._panels.some(panel => panel.containsPoint(x, y));
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
}
