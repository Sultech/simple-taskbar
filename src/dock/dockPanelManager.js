// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {
    BLUR_MY_SHELL_UUID,
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from '../shared/blurMyShellUtils.js';
import {
    getPanelBlur,
    hidePanelBlurForPanel,
    refreshPanelBlurVisibility,
} from '../integration/blurMyShellRuntime.js';
import {SecondaryPanelController} from '../secondaryPanel/secondaryPanelController.js';
import {alternativePanelPosition} from '../shared/panelPositionUtils.js';
import {DockPanelSettings} from './dockPanelSettings.js';

const DOCK_PANEL_ITEM_IDS = new Set([
    'start-button',
    'applications',
]);
const BLUR_MY_SHELL_RESET_SYNC_DELAY = 2;

export class DockPanelManager {
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
        this._blurMyShellSyncId = 0;
        this._blurMyShellResetSyncId = 0;
    }

    enable() {
        this._settings.connectObject(
            'changed::dock-mode', () => this._queueRebuild(),
            'changed::dock-position', () => this._queueRebuild(),
            'changed::dock-panel-mode', () => this._queueRebuild(),
            'changed::dock-multi-monitor-panels',
            () => this._queueRebuild(),
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
        const panelSettings = getBlurMyShellChildSettings(
            getBlurMyShellSettings(),
            'panel'
        );
        for (const key of ['corner-radius', 'pipeline', 'static-blur']) {
            if (!blurMyShellHasKey(panelSettings, key))
                continue;

            panelSettings.connectObject(
                `changed::${key}`,
                () => {
                    if (key === 'static-blur')
                        this._queueBlurMyShellSyncAfterReset();
                    else
                        this._queueBlurMyShellSync();
                },
                this._signalHolder
            );
        }
        this._queueRebuild();
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
        if (this._blurMyShellResetSyncId) {
            GLib.Source.remove(this._blurMyShellResetSyncId);
            this._blurMyShellResetSyncId = 0;
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
        this._panels = null;
    }

    hasPanelAt(x, y) {
        return this._panels.some(panel => panel.containsPoint(x, y));
    }

    toggleStartMenuAt(x, y) {
        const panel = this._panels.find(panel => panel.containsPoint(x, y));
        if (!panel)
            return false;

        panel.toggleStartMenu();
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
        if (!this._settings.get_boolean('dock-mode'))
            return;

        if (this._syncDockPosition())
            return;

        const monitors = this._settings.get_boolean(
            'dock-multi-monitor-panels'
        )
            ? Main.layoutManager.monitors
            : [Main.layoutManager.primaryMonitor];
        for (const monitor of monitors) {
            const panel = new SecondaryPanelController({
                extensionDir: this._extensionDir,
                settings: new DockPanelSettings(this._settings),
                appSystem: this._appSystem,
                tracker: this._tracker,
                favorites: this._favorites,
                spreadAppWindows: this._spreadAppWindows,
                monitor,
                openPreferences: this._openPreferences,
                visiblePanelItemIds: DOCK_PANEL_ITEM_IDS,
                panelHeightFromIconSize: true,
                dockPanelSizing: true,
                mainPanelPosition: this._settings.get_string(
                    'panel-position'
                ),
            });
            this._panels.push(panel);
            panel.enable();
            hidePanelBlurForPanel(panel.actor);
        }
        this._queueBlurMyShellSync();
    }

    _syncDockPosition() {
        const panelPosition = this._settings.get_string('panel-position');
        if (this._settings.get_string('dock-position') !== panelPosition)
            return false;

        const replacement = alternativePanelPosition(panelPosition);
        this._settings.set_string('dock-position', replacement);
        return true;
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

    _queueBlurMyShellSyncAfterReset() {
        if (this._blurMyShellResetSyncId)
            return;

        this._blurMyShellResetSyncId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            BLUR_MY_SHELL_RESET_SYNC_DELAY,
            () => {
                this._blurMyShellResetSyncId = 0;
                this._queueBlurMyShellSync();
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
