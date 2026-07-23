// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelIsTop} from './panelPosition.js';

const HIDE_DELAY = 450;
const BLOCKED_RECHECK_DELAY = 150;
const ANIMATION_TIME = 180;
const REVEAL_EDGE_SIZE = 2;

const overviewControllers = new Set();
const overviewInjectionManager = new InjectionManager();

function registerOverviewController(controller) {
    const installInjection = overviewControllers.size === 0;
    overviewControllers.add(controller);
    if (!installInjection)
        return;

    const prototype = Object.getPrototypeOf(Main.overview);
    overviewInjectionManager.overrideMethod(
        prototype,
        'show',
        originalMethod => function (...args) {
            for (const activeController of overviewControllers)
                activeController._suspendForOverview();

            const result = originalMethod.apply(this, args);
            if (!this._shown) {
                for (const activeController of overviewControllers)
                    activeController._resumeAfterOverview();
            }
            return result;
        }
    );
}

function unregisterOverviewController(controller) {
    overviewControllers.delete(controller);
    if (overviewControllers.size > 0)
        return;

    overviewInjectionManager.restoreMethod(
        Object.getPrototypeOf(Main.overview),
        'show'
    );
}

export class PanelAutoHideController {
    constructor({
        settings,
        panelActor,
        positionActor,
        getMonitor,
        getPanelHeight,
        isBlocked,
    }) {
        this._settings = settings;
        this._panelActor = panelActor;
        this._positionActor = positionActor;
        this._getMonitor = getMonitor;
        this._getPanelHeight = getPanelHeight;
        this._isBlockedCallback = isBlocked;
        this._signals = [];
        this._hideTimeoutId = 0;
        this._hidden = false;
        this._overviewSuspended = false;
    }

    enable() {
        this._connect(this._panelActor, 'enter-event', () => {
            this.show();
            return Clutter.EVENT_PROPAGATE;
        });
        this._connect(this._panelActor, 'leave-event', () => {
            this._scheduleHide();
            return Clutter.EVENT_PROPAGATE;
        });
        this._connect(global.stage, 'captured-event', (_stage, event) => {
            if (!this._enabled() || !this._hidden ||
                event.type() !== Clutter.EventType.MOTION) {
                return Clutter.EVENT_PROPAGATE;
            }

            const [x, y] = event.get_coords();
            if (this._pointerIsAtRevealEdge(x, y))
                this.show();
            return Clutter.EVENT_PROPAGATE;
        });
        this._connect(global.stage, 'notify::key-focus', () => {
            if (this._focusIsInsidePanel())
                this.show();
            else
                this._scheduleHide();
        });
        this._connect(
            this._settings,
            'changed::panel-autohide-enabled',
            () => this._syncEnabled()
        );
        this._connect(Main.overview, 'showing', () => {
            this._suspendForOverview();
        });
        this._connect(Main.overview, 'hidden', () => {
            this._resumeAfterOverview();
        });

        this._overviewSuspended = Main.overview.visibleTarget;
        registerOverviewController(this);
        this.syncPosition();
        this._syncEnabled();
    }

    destroy() {
        this._clearHideTimeout();
        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];

        unregisterOverviewController(this);
        this._hidden = false;
        this._overviewSuspended = false;
        this._positionActor?.remove_transition('y');
        this.syncPosition();

        this._settings = null;
        this._panelActor = null;
        this._positionActor = null;
        this._getMonitor = null;
        this._getPanelHeight = null;
        this._isBlockedCallback = null;
    }

    syncPosition() {
        const monitor = this._getMonitor();
        const actor = this._positionActor;
        if (!monitor || !actor)
            return;

        actor.remove_transition('y');
        actor.y = this._hidden && this._enabled() &&
            !this._overviewSuspended
            ? this._hiddenY(monitor)
            : this._visibleY(monitor);
        Main.layoutManager._queueUpdateRegions();
    }

    show(animate = true) {
        this._clearHideTimeout();
        if (!this._hidden) {
            if (this._enabled() && !this._pointerIsInsidePanel())
                this._scheduleHide();
            return;
        }

        this._hidden = false;
        this._moveTo(this._visibleY(this._getMonitor()), animate);
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _enabled() {
        return this._settings?.get_boolean('panel-autohide-enabled') ?? false;
    }

    _syncEnabled() {
        if (this._overviewSuspended) {
            this.show(false);
            return;
        }

        if (!this._enabled()) {
            this.show();
            return;
        }

        if (this._pointerIsInsidePanel())
            this.show(false);
        else
            this._scheduleHide();
    }

    _scheduleHide(delay = HIDE_DELAY) {
        if (!this._enabled() || this._overviewSuspended ||
            this._hidden || this._hideTimeoutId) {
            return;
        }

        this._hideTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                this._hideTimeoutId = 0;
                if (!this._enabled() || this._overviewSuspended ||
                    this._pointerIsInsidePanel()) {
                    return GLib.SOURCE_REMOVE;
                }
                if (this._isBlocked()) {
                    this._scheduleHide(BLOCKED_RECHECK_DELAY);
                    return GLib.SOURCE_REMOVE;
                }

                this._hidden = true;
                this._moveTo(this._hiddenY(this._getMonitor()), true);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _clearHideTimeout() {
        if (this._hideTimeoutId)
            GLib.Source.remove(this._hideTimeoutId);
        this._hideTimeoutId = 0;
    }

    _suspendForOverview() {
        this._overviewSuspended = true;
        this._clearHideTimeout();
        if (!this._enabled())
            return;

        this._hidden = false;
        this._moveTo(this._visibleY(this._getMonitor()), false);
    }

    _resumeAfterOverview() {
        if (!this._overviewSuspended)
            return;

        this._overviewSuspended = false;
        if (!this._enabled())
            return;

        if (this._pointerIsInsidePanel())
            this.show(false);
        else
            this._scheduleHide();
    }

    _isBlocked() {
        return this._focusIsInsidePanel() ||
            this._isBlockedCallback();
    }

    _focusIsInsidePanel() {
        const focus = global.stage.get_key_focus();
        return Boolean(
            focus && (focus === this._panelActor ||
                this._panelActor?.contains(focus))
        );
    }

    _pointerIsInsidePanel() {
        const monitor = this._getMonitor();
        if (!monitor || this._hidden)
            return false;

        const [x, y] = global.get_pointer();
        const panelHeight = this._getPanelHeight();
        const visibleY = this._visibleY(monitor);
        return x >= monitor.x && x < monitor.x + monitor.width &&
            y >= visibleY && y < visibleY + panelHeight;
    }

    _pointerIsAtRevealEdge(x, y) {
        const monitor = this._getMonitor();
        if (!monitor || x < monitor.x || x >= monitor.x + monitor.width)
            return false;

        return panelIsTop(this._settings)
            ? y <= monitor.y + REVEAL_EDGE_SIZE
            : y >= monitor.y + monitor.height - REVEAL_EDGE_SIZE;
    }

    _visibleY(monitor) {
        if (!monitor)
            return this._positionActor?.y ?? 0;
        const panelHeight = this._getPanelHeight();
        return panelIsTop(this._settings)
            ? monitor.y
            : monitor.y + monitor.height - panelHeight;
    }

    _hiddenY(monitor) {
        if (!monitor)
            return this._positionActor?.y ?? 0;
        const panelHeight = this._getPanelHeight();
        return panelIsTop(this._settings)
            ? monitor.y - panelHeight + REVEAL_EDGE_SIZE
            : monitor.y + monitor.height - REVEAL_EDGE_SIZE;
    }

    _moveTo(y, animate) {
        const actor = this._positionActor;
        if (!actor || y === undefined)
            return;

        actor.remove_transition('y');
        if (!animate) {
            actor.y = y;
            Main.layoutManager._queueUpdateRegions();
            return;
        }

        actor.ease({
            y,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => Main.layoutManager._queueUpdateRegions(),
        });
    }
}
