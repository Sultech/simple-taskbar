// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    BLUR_MY_SHELL_UUID,
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from '../shared/blurMyShellUtils.js';
import {
    blurMyShellDockMode,
    getPanelBlur,
    hidePanelBlurForPanel,
    panelBlurSuitsDock,
    removePanelBlurForPanel,
    refreshPanelBlurVisibility,
    syncDockBlurTarget,
} from '../integration/blurMyShellRuntime.js';
import {SecondaryPanelController} from '../secondaryPanel/secondaryPanelController.js';
import {PanelManagerBase} from '../panel/panelManagerBase.js';
import {alternativePanelPosition} from '../shared/panelPositionUtils.js';
import {setDockPosition} from '../shared/panelModeProfiles.js';
import {DockPanelSettings} from './dockPanelSettings.js';

const DOCK_PANEL_ITEM_IDS = new Set([
    'start-button',
    'applications',
]);
const BLUR_MY_SHELL_RESET_SYNC_DELAY = 2;
const BLUR_MY_SHELL_DOCK_MODE_KEY = 'blur-my-shell-dock-mode';

export class DockPanelManager extends PanelManagerBase {
    constructor(params) {
        super(params);
        this._blurMyShellResetSyncId = 0;
        this._panelSettings = [];
    }

    enable() {
        this._settings.connectObject(
            'changed::dock-mode', () => this._queueRebuild(),
            'changed::dock-position', () => this._queueRebuild(),
            'changed::dock-panel-mode', () => this._queueRebuild(),
            'changed::dock-multi-monitor-panels',
            () => this._queueRebuild(),
            'changed::multi-monitor-panels',
            () => this._queueRebuild(),
            'changed::dock-panel-blur-enabled',
            () => this._queueBlurMyShellSync(),
            this._signalHolder
        );
        Main.layoutManager.connectObject(
            'monitors-changed', () => this._queueRebuild(),
            'startup-complete', () => this._queueBlurMyShellSync(),
            this._signalHolder
        );
        global.display.connectObject(
            'workareas-changed',
            () => this._queueBlurMyShellSync(),
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
        this._connectBlurMyShellKeys(
            'panel',
            ['blur', 'corner-radius', 'pipeline', 'static-blur'],
            'static-blur'
        );
        this._connectBlurMyShellKeys(
            'dash-to-dock',
            ['blur', 'override-background', 'style-dash-to-dock'],
            'blur'
        );
        this._queueRebuild();
    }

    _connectBlurMyShellKeys(childName, keys, resetKey) {
        const settings = getBlurMyShellChildSettings(
            getBlurMyShellSettings(),
            childName
        );
        for (const key of keys) {
            if (!blurMyShellHasKey(settings, key))
                continue;

            settings.connectObject(
                `changed::${key}`,
                () => {
                    if (key === resetKey)
                        this._queueBlurMyShellSyncAfterReset();
                    else
                        this._queueBlurMyShellSync();
                },
                this._signalHolder
            );
        }
    }

    destroy() {
        if (this._blurMyShellResetSyncId) {
            GLib.Source.remove(this._blurMyShellResetSyncId);
            this._blurMyShellResetSyncId = 0;
        }
        super.destroy();
    }

    toggleStartMenuAt(x, y) {
        const panel = this._panels.find(panel => panel.containsPoint(x, y));
        if (!panel)
            return false;

        panel.toggleStartMenu();
        return true;
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
            const dockSettings = new DockPanelSettings(this._settings);
            const panel = new SecondaryPanelController({
                extensionDir: this._extensionDir,
                settings: dockSettings,
                appSystem: this._appSystem,
                tracker: this._tracker,
                favorites: this._favorites,
                notificationBadgeModel: this._notificationBadgeModel,
                spreadAppWindows: this._spreadAppWindows,
                monitor,
                openPreferences: this._openPreferences,
                visiblePanelItemIds: DOCK_PANEL_ITEM_IDS,
                mainPanelSettings: this._settings,
            });
            this._panels.push(panel);
            this._panelSettings.push(dockSettings);
            panel.enable();
            if (this._settings.get_boolean('dock-panel-blur-enabled') &&
                panelBlurSuitsDock())
                hidePanelBlurForPanel(panel.actor);
        }
        this._queueBlurMyShellSync();
    }

    _syncDockPosition() {
        const panelPosition = this._settings.get_string('panel-position');
        if (this._settings.get_string('dock-position') !== panelPosition)
            return false;

        const replacement = alternativePanelPosition(panelPosition);
        setDockPosition(this._settings, replacement);
        return true;
    }

    _destroyPanels() {
        for (const panel of this._panels) {
            removePanelBlurForPanel(panel.actor);
            panel.destroy();
        }
        this._panels = [];
        for (const settings of this._panelSettings)
            settings.destroy();
        this._panelSettings = [];
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
        const dockMode = blurMyShellDockMode();
        if (dockMode &&
            this._settings.get_string(BLUR_MY_SHELL_DOCK_MODE_KEY) !== dockMode)
            this._settings.set_string(BLUR_MY_SHELL_DOCK_MODE_KEY, dockMode);

        if (this._panels.length === 0)
            return;

        const dockPanelBlurEnabled = this._settings.get_boolean(
            'dock-panel-blur-enabled'
        );
        const panelBlurEnabled = dockPanelBlurEnabled && panelBlurSuitsDock();
        for (const panel of this._panels) {
            syncDockBlurTarget(
                panel.actor.get_parent(),
                panel.actor,
                dockPanelBlurEnabled
            );
        }

        const panelBlur = getPanelBlur();
        if (panelBlur) {
            for (const panel of this._panels) {
                if (panelBlurEnabled)
                    panelBlur.maybe_blur_panel(panel.actor);
                else
                    removePanelBlurForPanel(panel.actor);
            }

            if (!Main.overview.visibleTarget)
                refreshPanelBlurVisibility(panelBlur);
        }

        for (const panel of this._panels)
            panel.syncTheme();
    }
}
