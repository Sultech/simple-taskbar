// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {LookingGlass} from 'resource:///org/gnome/shell/ui/lookingGlass.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    panelIsVertical,
    panelPosition,
} from './panelPosition.js';

export class VerticalPanelCompatibilityController {
    constructor(settings) {
        this._settings = settings;
        this._injectionManager = new InjectionManager();
    }

    enable() {
        this._overridePanelBarrier();
        this._overrideLookingGlassResize();
    }

    destroy() {
        this._destroyPanelBarrier();
        this._injectionManager.clear();
        Main.layoutManager._updatePanelBarrier();
        this._injectionManager = null;
        this._settings = null;
    }

    _overridePanelBarrier() {
        const settings = this._settings;
        this._injectionManager.overrideMethod(
            Object.getPrototypeOf(Main.layoutManager),
            '_updatePanelBarrier',
            originalMethod => function () {
                if (!panelIsVertical(settings)) {
                    originalMethod.call(this);
                    return;
                }

                if (this._rightPanelBarrier) {
                    this._rightPanelBarrier.destroy();
                    this._rightPanelBarrier = null;
                }

                if (!this.primaryMonitor || !this.panelBox.width)
                    return;

                const primary = this.primaryMonitor;
                const panelWidth = this.panelBox.width;
                const position = panelPosition(settings);
                const x1 = position === 'left'
                    ? primary.x
                    : primary.x + primary.width - panelWidth;
                const y = primary.y + primary.height;
                this._rightPanelBarrier = new Meta.Barrier({
                    backend: global.backend,
                    x1,
                    x2: x1 + panelWidth,
                    y1: y,
                    y2: y,
                    directions: Meta.BarrierDirection.NEGATIVE_Y,
                });
            }
        );
    }

    _overrideLookingGlassResize() {
        const settings = this._settings;
        this._injectionManager.overrideMethod(
            LookingGlass.prototype,
            '_resize',
            originalMethod => function () {
                originalMethod.call(this);
                if (!panelIsVertical(settings))
                    return;

                const targetY = Main.layoutManager.panelBox.y;
                const delta = targetY - this._targetY;
                this._hiddenY += delta;
                this._targetY = targetY;
                this.y = this._hiddenY;
                this._objInspector.y += delta;
            }
        );
    }

    _destroyPanelBarrier() {
        if (!panelIsVertical(this._settings))
            return;

        if (Main.layoutManager._rightPanelBarrier) {
            Main.layoutManager._rightPanelBarrier.destroy();
            Main.layoutManager._rightPanelBarrier = null;
        }
    }
}
