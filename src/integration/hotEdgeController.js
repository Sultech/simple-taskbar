// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Ripples from 'resource:///org/gnome/shell/ui/ripples.js';

import {EdgePressureBarrier, pressureBarriersSupported} from '../panel/edgePressureBarrier.js';

const FALLBACK_TIMEOUT = 250;

export class HotEdgeController {
    constructor(settings, {isBlocked}) {
        this._settings = settings;
        this._isBlocked = isBlocked;
        this._edges = [];
    }

    enable() {
        this._settings.connectObject(
            'changed::hot-edge-overview-enabled', () => this._rebuild(),
            'changed::hot-edge-pressure-threshold', () => this._rebuild(),
            this
        );
        Main.layoutManager.connectObject(
            'monitors-changed', () => this._rebuild(),
            this
        );
        this._rebuild();
    }

    destroy() {
        this._settings.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._destroyEdges();
        this._settings = null;
        this._isBlocked = null;
    }

    _rebuild() {
        this._destroyEdges();
        if (!this._settings.get_boolean('hot-edge-overview-enabled'))
            return;

        const monitors = Main.layoutManager.monitors;
        for (const monitor of monitors) {
            if (!this._hasExposedBottomEdge(monitor, monitors))
                continue;

            this._edges.push(new HotEdge({
                layoutManager: Main.layoutManager,
                monitor,
                pressureThreshold: this._settings.get_int(
                    'hot-edge-pressure-threshold'
                ),
                isBlocked: () => this._isBlocked(),
                showAnimation: () => this._settings.get_boolean(
                    'hot-edge-animation-enabled'
                ),
                openAppGrid: () => this._settings.get_boolean(
                    'hot-edge-open-app-grid'
                ),
            }));
        }
    }

    _hasExposedBottomEdge(monitor, monitors) {
        const bottom = monitor.y + monitor.height;
        const left = monitor.x;
        const right = monitor.x + monitor.width;

        return !monitors.some(other => {
            if (other === monitor || other.y < bottom)
                return false;

            const otherLeft = other.x;
            const otherRight = other.x + other.width;
            return otherLeft < right && otherRight > left;
        });
    }

    _destroyEdges() {
        for (const edge of this._edges)
            edge.destroy();
        this._edges = [];
    }
}

class HotEdge {
    constructor({
        layoutManager,
        monitor,
        pressureThreshold,
        isBlocked,
        showAnimation,
        openAppGrid,
    }) {
        this._layoutManager = layoutManager;
        this._monitor = monitor;
        this._pressureThreshold = pressureThreshold;
        this._isBlocked = isBlocked;
        this._showAnimation = showAnimation;
        this._openAppGrid = openAppGrid;
        this._edgePressureBarrier = null;
        this._fallbackActor = null;
        this._fallbackEnterId = 0;
        this._fallbackLeaveId = 0;
        this._fallbackTimeoutId = 0;

        this._ripples = new Ripples.Ripples(
            0.5,
            0.5,
            'simple-taskbar-hot-edge-ripple'
        );
        this._ripples.addTo(layoutManager.uiGroup);

        if (pressureBarriersSupported())
            this._createPressureBarrier();
        else
            this._createFallbackActor();
    }

    destroy() {
        this._clearFallbackTimeout();

        if (this._fallbackActor) {
            if (this._fallbackEnterId)
                this._fallbackActor.disconnect(this._fallbackEnterId);
            if (this._fallbackLeaveId)
                this._fallbackActor.disconnect(this._fallbackLeaveId);
            this._layoutManager.removeChrome(this._fallbackActor);
            this._fallbackActor.destroy();
        }
        this._fallbackActor = null;
        this._fallbackEnterId = 0;
        this._fallbackLeaveId = 0;

        this._edgePressureBarrier?.destroy();
        this._edgePressureBarrier = null;

        this._ripples.destroy();
        this._ripples = null;
        this._layoutManager = null;
        this._monitor = null;
        this._pressureThreshold = null;
        this._isBlocked = null;
        this._showAnimation = null;
        this._openAppGrid = null;
    }

    _createPressureBarrier() {
        const bottom = this._monitor.y + this._monitor.height;
        this._edgePressureBarrier = new EdgePressureBarrier({
            edge: {
                x1: this._monitor.x,
                x2: this._monitor.x + this._monitor.width,
                y1: bottom,
                y2: bottom,
            },
            position: 'bottom',
            threshold: this._pressureThreshold,
            onTrigger: () => this._toggleOverview(),
        });
    }

    _createFallbackActor() {
        this._fallbackActor = new St.Widget({
            name: 'simple-taskbar-hot-edge',
            x: this._monitor.x,
            y: this._monitor.y + this._monitor.height - 1,
            width: this._monitor.width,
            height: 1,
            reactive: true,
        });
        this._layoutManager.addChrome(this._fallbackActor, {
            affectsStruts: false,
            trackFullscreen: true,
        });
        this._fallbackEnterId = this._fallbackActor.connect(
            'enter-event',
            () => {
                if (!this._fallbackTimeoutId) {
                    this._fallbackTimeoutId = GLib.timeout_add(
                        GLib.PRIORITY_HIGH,
                        FALLBACK_TIMEOUT,
                        () => {
                            this._fallbackTimeoutId = 0;
                            this._toggleOverview();
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                }
                return Clutter.EVENT_PROPAGATE;
            }
        );
        this._fallbackLeaveId = this._fallbackActor.connect(
            'leave-event',
            () => {
                this._clearFallbackTimeout();
                return Clutter.EVENT_PROPAGATE;
            }
        );
    }

    _toggleOverview() {
        if (this._isBlocked() || this._mouseButtonIsHeld())
            return;
        if (this._monitor.inFullscreen && !Main.overview.visible)
            return;
        if (!Main.overview.shouldToggleByCornerOrButton())
            return;

        if (this._openAppGrid() && !Main.overview.visible)
            Main.overview.showApps();
        else
            Main.overview.toggle();
        if (this._showAnimation() && Main.overview.animationInProgress) {
            const [pointerX] = global.get_pointer();
            const bottom = this._monitor.y + this._monitor.height;
            this._ripples.playAnimation(pointerX, bottom);
        }
    }

    _mouseButtonIsHeld() {
        const buttonMasks = [
            Clutter.ModifierType.BUTTON1_MASK,
            Clutter.ModifierType.BUTTON2_MASK,
            Clutter.ModifierType.BUTTON3_MASK,
        ];
        const [, , modifiers] = global.get_pointer();
        return buttonMasks.some(mask => Boolean(modifiers & mask));
    }

    _clearFallbackTimeout() {
        if (this._fallbackTimeoutId)
            GLib.Source.remove(this._fallbackTimeoutId);
        this._fallbackTimeoutId = 0;
    }
}
