// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    BLUR_MY_SHELL_UUID,
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from '../shared/blurMyShellUtils.js';
import {
    getPanelBlur,
    refreshPanelBlurVisibility,
} from '../integration/blurMyShellRuntime.js';
import {PanelManagerBase} from '../panel/panelManagerBase.js';
import {ExtensionPanelController} from '../panel/extensionPanelController.js';

export class SecondaryPanelManager extends PanelManagerBase {
    enable() {
        this._settings.connectObject(
            'changed::multi-monitor-panels', () => this._queueRebuild(),
            this
        );
        Main.layoutManager.connectObject(
            'monitors-changed', () => this._queueRebuild(),
            this
        );
        Main.extensionManager.connectObject(
            'extension-state-changed',
            (_manager, extension) => {
                if (extension.uuid === BLUR_MY_SHELL_UUID)
                    this._queueBlurMyShellSync();
            },
            this
        );
        const panelBlurSettings = getBlurMyShellChildSettings(
            getBlurMyShellSettings(),
            'panel'
        );
        this._blurMyShellPanelSettings = panelBlurSettings;
        for (const key of ['corner-radius', 'rounded-corners']) {
            if (!blurMyShellHasKey(panelBlurSettings, key))
                continue;

            panelBlurSettings.connectObject(
                `changed::${key}`, () => this._queueBlurMyShellSync(),
                this
            );
        }
        this._rebuild();
    }

    destroy() {
        this._settings.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.extensionManager.disconnectObject(this);
        if (this._blurMyShellPanelSettings)
            this._blurMyShellPanelSettings.disconnectObject(this);
        this._blurMyShellPanelSettings = null;
        super.destroy();
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

    _rebuild() {
        this._destroyPanels();
        if (!this._settings.get_boolean('multi-monitor-panels'))
            return;

        const primaryMonitor = Main.layoutManager.primaryMonitor;
        for (const monitor of Main.layoutManager.monitors) {
            if (monitor === primaryMonitor)
                continue;

            const panel = new ExtensionPanelController(this._panelOptions(this._settings, monitor));
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
