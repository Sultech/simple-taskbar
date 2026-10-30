// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelGeometry} from './panelGeometry.js';
import {FloatingPanelLayout} from './floatingPanelLayout.js';
import {panelIsVertical} from './panelPosition.js';
import {floatingPanelEdgeGap} from './floatingPanelGeometry.js';
import {dynamicTaskbarEnabled, floatingTaskbarEnabled, taskbarGeometryEnabled} from '../shared/taskbarPanelModes.js';
import {removePanelBlurRadiusStyle} from '../integration/blurMyShellRuntime.js';

export function syncTaskbarGeometryController(controller, settings, autoHideController, createController) {
    const geometryEnabled = taskbarGeometryEnabled(settings);
    if (geometryEnabled === Boolean(controller))
        return controller;

    autoHideController.updateGeometry(() => {
        if (geometryEnabled) {
            controller = createController();
            controller.enable();
        } else {
            controller.destroy();
            controller = null;
        }
        return controller ? controller.strutActor : null;
    });
    return controller;
}

export class TaskbarGeometryController {
    constructor({settings, getMonitor, panelBox, panel, boxes, getPanelHeight,
        onPosition, onContentChanged, getHoverReserve}) {
        this._settings = settings;
        this._getMonitor = getMonitor;
        this._panelBox = panelBox;
        this._panel = panel;
        this._getPanelHeight = getPanelHeight;
        this._injectionManager = new InjectionManager();
        this._layout = new FloatingPanelLayout({
            settings,
            getMonitor,
            boxes,
            getPanelHeight,
            getHoverReserve,
            getEdgeGap: () => this.getPanelEdgeGap(),
            getGeometry: () => this.getGeometry(),
            onPosition,
            onContentChanged,
            strutName: 'simple-taskbar-floating-strut',
        });
        this._panelActorData = null;
        this._originalAffectsStruts = false;
    }

    enable() {
        this._injectionManager.overrideMethod(this._panel, 'set_style', original => function (style) {
            const normalizedStyle = removePanelBlurRadiusStyle(this, style);
            if (this.get_style() !== normalizedStyle)
                original.call(this, normalizedStyle);
        });
        this._layout.enable(true);
        this._panelActorData = Main.layoutManager._trackedActors[
            Main.layoutManager._findActor(this._panelBox)
        ];
        this._originalAffectsStruts = this._panelActorData.affectsStruts;
        this._panelActorData.affectsStruts = false;
        this._settings.connectObject(
            'changed::taskbar-max-length', () => this._layout.queueContentUpdate(),
            this
        );
    }

    destroy() {
        this._layout.destroy();
        this._layout = null;
        this._settings.disconnectObject(this);
        this._injectionManager.clear();
        this._injectionManager = null;
        this._panelActorData.affectsStruts = this._originalAffectsStruts;
        this._panelActorData = null;
        this._settings = null;
        this._getMonitor = null;
        this._panelBox = null;
        this._panel = null;
        this._getPanelHeight = null;
    }

    get strutActor() {
        return this._layout.strutActor;
    }

    getPanelLengthPercentage() {
        return dynamicTaskbarEnabled(this._settings)
            ? this._settings.get_int('taskbar-max-length') : null;
    }

    getPanelLengthOverride() {
        if (!dynamicTaskbarEnabled(this._settings))
            return this._monitorLength() - this.getPanelEdgeGap() * 2;

        return this._layout.panelLength;
    }

    getPanelEdgeGap() {
        return floatingTaskbarEnabled(this._settings)
            ? floatingPanelEdgeGap(this._settings, this._getMonitor()) : 0;
    }

    getLimitRevealToPanel() {
        return this._settings.get_boolean('edge-reveal-enabled');
    }

    getGeometry() {
        return panelGeometry(this._settings, this._getMonitor(),
            this._getPanelHeight(), 0, this.getPanelLengthPercentage(),
            this.getPanelLengthOverride(), this.getPanelEdgeGap());
    }

    getPositionState(animateEdgeGapRequested) {
        return this._layout.getPositionState(animateEdgeGapRequested);
    }

    syncStrut() {
        this._layout.syncStrut();
    }

    getBaseLength() {
        return this._layout.baseLength;
    }

    getMaximumLength() {
        return dynamicTaskbarEnabled(this._settings)
            ? Math.floor(this._monitorLength() * this.getPanelLengthPercentage() / 100)
            : this.getPanelLengthOverride();
    }

    queueContentUpdate() {
        this._layout.queueContentUpdate();
    }

    updateLength() {
        if (dynamicTaskbarEnabled(this._settings))
            this._layout.updateLength(this.getMaximumLength(), panelIsVertical(this._settings));
    }

    _monitorLength() {
        const monitor = this._getMonitor();
        return panelIsVertical(this._settings) ? monitor.height : monitor.width;
    }
}
