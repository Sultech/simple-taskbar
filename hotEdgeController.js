// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Ripples from 'resource:///org/gnome/shell/ui/ripples.js';

const PRESSURE_THRESHOLD = 150;
const PRESSURE_TIMEOUT = 1000;
const FALLBACK_TIMEOUT = 250;

export class HotEdgeController {
    constructor(settings, {isBlocked}) {
        this._settings = settings;
        this._isBlocked = isBlocked;
        this._signals = [];
        this._edges = [];
    }

    enable() {
        this._connect(
            this._settings,
            'changed::hot-edge-overview-enabled',
            () => this._rebuild()
        );
        this._connect(Main.layoutManager, 'monitors-changed', () => {
            this._rebuild();
        });
        this._rebuild();
    }

    destroy() {
        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];
        this._destroyEdges();
        this._settings = null;
        this._isBlocked = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _rebuild() {
        this._destroyEdges();
        if (!this._settings?.get_boolean('hot-edge-overview-enabled'))
            return;

        const monitors = Main.layoutManager.monitors;
        for (const monitor of monitors) {
            if (!this._hasExposedBottomEdge(monitor, monitors))
                continue;

            this._edges.push(new HotEdge({
                layoutManager: Main.layoutManager,
                monitor,
                isBlocked: () => this._isBlocked(),
                showAnimation: () => this._settings?.get_boolean(
                    'hot-edge-animation-enabled'
                ) ?? true,
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
    constructor({layoutManager, monitor, isBlocked, showAnimation}) {
        this._layoutManager = layoutManager;
        this._monitor = monitor;
        this._isBlocked = isBlocked;
        this._showAnimation = showAnimation;
        this._barrier = null;
        this._pressureBarrier = null;
        this._pressureTriggerId = 0;
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

        if (this._barriersAreSupported())
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

        if (this._pressureBarrier && this._pressureTriggerId)
            this._pressureBarrier.disconnect(this._pressureTriggerId);
        this._pressureTriggerId = 0;
        if (this._pressureBarrier && this._barrier)
            this._pressureBarrier.removeBarrier(this._barrier);
        this._barrier?.destroy();
        this._barrier = null;
        this._pressureBarrier?.destroy();
        this._pressureBarrier = null;

        this._ripples?.destroy();
        this._ripples = null;
        this._layoutManager = null;
        this._monitor = null;
        this._isBlocked = null;
        this._showAnimation = null;
    }

    _barriersAreSupported() {
        return Boolean(
            global.backend.capabilities &
            Meta.BackendCapabilities.BARRIERS
        );
    }

    _createPressureBarrier() {
        const bottom = this._monitor.y + this._monitor.height;
        this._barrier = new Meta.Barrier({
            backend: global.backend,
            x1: this._monitor.x,
            x2: this._monitor.x + this._monitor.width,
            y1: bottom,
            y2: bottom,
            directions: Meta.BarrierDirection.NEGATIVE_Y,
        });
        this._pressureBarrier = new Layout.PressureBarrier(
            PRESSURE_THRESHOLD,
            PRESSURE_TIMEOUT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW
        );
        this._pressureBarrier.addBarrier(this._barrier);
        this._pressureTriggerId = this._pressureBarrier.connect(
            'trigger',
            () => this._toggleOverview()
        );
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
        if (this._monitor?.inFullscreen && !Main.overview.visible)
            return;
        if (!Main.overview.shouldToggleByCornerOrButton())
            return;

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
