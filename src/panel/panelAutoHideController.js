// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {panelIsTop} from './panelPosition.js';
import {pointerButtonIsPressed} from '../pointerUtils.js';

const HIDE_DELAY = 450;
const BLOCKED_RECHECK_DELAY = 150;
const ANIMATION_TIME = 180;
const REVEAL_EDGE_SIZE = 2;
const FULLSCREEN_POINTER_POLL_INTERVAL = 20;
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
        this._signalHolder = new TransientSignalHolder();
        this._hideTimeoutId = 0;
        this._fullscreenWatchId = 0;
        this._fullscreenReleasePending = false;
        this._pointerButtonPressed = false;
        this._hidden = false;
        this._overviewSuspended = false;
        this._trackedActorData = null;
        this._originalAffectsStruts = false;
        this._originalTrackFullscreen = false;
        this._unredirectDisabled = false;
        this._fullscreenVisibilityHeld = false;
    }

    enable() {
        this._panelActor.connectObject(
            'enter-event', () => {
                this.show();
                return Clutter.EVENT_PROPAGATE;
            },
            'leave-event', () => {
                this._scheduleHide();
                return Clutter.EVENT_PROPAGATE;
            },
            this._signalHolder
        );
        global.stage.connectObject(
            'captured-event', (_stage, event) => {
                if (!this._enabled() || !this._hidden ||
                    event.type() !== Clutter.EventType.MOTION) {
                    return Clutter.EVENT_PROPAGATE;
                }

                const [x, y] = event.get_coords();
                if (this._pointerIsAtRevealEdge(x, y))
                    this.show();
                return Clutter.EVENT_PROPAGATE;
            },
            'notify::key-focus', () => {
                if (this._focusIsInsidePanel())
                    this.show();
                else
                    this._scheduleHide();
            },
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::panel-autohide-enabled', () => this._syncEnabled(),
            this._signalHolder
        );
        Main.overview.connectObject(
            'showing', () => this._suspendForOverview(),
            'hiding', () => this._restoreFullscreenVisibility(),
            'hidden', () => this._resumeAfterOverview(),
            this._signalHolder
        );
        global.display.connectObject(
            'in-fullscreen-changed', () => this._fullscreenChanged(),
            this._signalHolder
        );

        this._overviewSuspended = Main.overview.visibleTarget;
        this._captureStrutTracking();
        this._syncStrutTracking();
        this.syncPosition();
        this._syncEnabled();
    }

    destroy() {
        this._clearHideTimeout();
        this._stopFullscreenWatch();
        this._signalHolder.destroy();
        this._signalHolder = null;

        this._restoreFullscreenVisibilityState();
        this._hidden = false;
        this._overviewSuspended = false;
        this._positionActor.remove_transition('y');
        this.syncPosition();
        this._restoreStrutTracking();
        this._restoreUnredirect();

        this._settings = null;
        this._panelActor = null;
        this._positionActor = null;
        this._getMonitor = null;
        this._getPanelHeight = null;
        this._isBlockedCallback = null;
        this._trackedActorData = null;
    }

    setMenuOpen(open) {
        if (open) {
            this._fullscreenReleasePending = false;
            this.show(false);
            const monitor = this._getMonitor();
            if (global.window_group.visible && monitor?.inFullscreen) {
                this._trackedActorData.trackFullscreen = false;
                this._positionActor.visible = true;
                this._fullscreenVisibilityHeld = true;
                this._clearHideTimeout();
                this._syncUnredirect();
                this._startFullscreenWatch();
            }
            return;
        }

        if (this._fullscreenVisibilityHeld)
            return;
        if (this._enabled() && !this._pointerIsInsidePanel())
            this._scheduleHide();
    }

    syncPosition() {
        const monitor = this._getMonitor();
        const actor = this._positionActor;
        if (!monitor)
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

    _enabled() {
        return this._settings.get_boolean('panel-autohide-enabled');
    }

    _syncEnabled() {
        if (!this._enabled()) {
            this.show(false);
            this._restoreStrutTracking();
            this._syncUnredirect();
            return;
        }

        this._syncUnredirect();
        this._syncStrutTracking();
        if (this._overviewSuspended) {
            this.show(false);
            return;
        }

        if (this._pointerIsInsidePanel())
            this.show(false);
        else
            this._scheduleHide();
    }

    _captureStrutTracking() {
        const index = Main.layoutManager._findActor(this._positionActor);
        this._trackedActorData =
            Main.layoutManager._trackedActors[index];
        this._originalAffectsStruts =
            this._trackedActorData.affectsStruts;
        this._originalTrackFullscreen =
            this._trackedActorData.trackFullscreen;
    }

    _syncStrutTracking() {
        if (!this._trackedActorData ||
            !this._trackedActorData.affectsStruts) {
            return;
        }

        this._trackedActorData.affectsStruts = false;
        Main.layoutManager._queueUpdateRegions();
    }

    _restoreStrutTracking() {
        if (!this._trackedActorData ||
            this._trackedActorData.affectsStruts ===
                this._originalAffectsStruts) {
            return;
        }

        this._trackedActorData.affectsStruts =
            this._originalAffectsStruts;
        Main.layoutManager._queueUpdateRegions();
    }

    _disableUnredirect() {
        if (this._unredirectDisabled)
            return;

        global.compositor.disable_unredirect();
        this._unredirectDisabled = true;
    }

    _restoreUnredirect() {
        if (!this._unredirectDisabled)
            return;

        global.compositor.enable_unredirect();
        this._unredirectDisabled = false;
    }

    _syncUnredirect() {
        if (this._enabled() || this._fullscreenVisibilityHeld)
            this._disableUnredirect();
        else
            this._restoreUnredirect();
    }

    _restoreFullscreenVisibility() {
        this._stopFullscreenWatch();
        this._restoreFullscreenVisibilityState();
    }

    _restoreFullscreenVisibilityState() {
        if (!this._fullscreenVisibilityHeld)
            return;

        this._fullscreenVisibilityHeld = false;
        const monitor = this._getMonitor();
        this._trackedActorData.trackFullscreen =
            this._originalTrackFullscreen;
        this._positionActor.visible =
            !this._originalTrackFullscreen ||
            !(global.window_group.visible && monitor?.inFullscreen);
        this._syncUnredirect();
    }

    _fullscreenChanged() {
        if (!this._fullscreenVisibilityHeld ||
            this._getMonitor()?.inFullscreen) {
            return;
        }

        this._restoreFullscreenVisibility();
        if (this._enabled() && !this._pointerIsInsidePanel())
            this._scheduleHide();
    }

    _startFullscreenWatch() {
        if (this._fullscreenWatchId)
            return;

        this._fullscreenReleasePending = false;
        this._pointerButtonPressed = pointerButtonIsPressed();
        this._fullscreenWatchId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FULLSCREEN_POINTER_POLL_INTERVAL,
            () => {
                const pointerPressed = pointerButtonIsPressed();
                if (pointerPressed && !this._pointerButtonPressed) {
                    this._fullscreenReleasePending =
                        !this._pointerIsInsidePanel();
                }
                this._pointerButtonPressed = pointerPressed;

                if (!this._fullscreenReleasePending ||
                    this._isBlockedCallback()) {
                    return GLib.SOURCE_CONTINUE;
                }

                this._fullscreenWatchId = 0;
                this._restoreFullscreenVisibility();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _stopFullscreenWatch() {
        if (this._fullscreenWatchId)
            GLib.Source.remove(this._fullscreenWatchId);
        this._fullscreenWatchId = 0;
        this._fullscreenReleasePending = false;
        this._pointerButtonPressed = false;
    }

    _scheduleHide(delay = HIDE_DELAY) {
        if (!this._enabled() || this._overviewSuspended ||
            this._fullscreenVisibilityHeld || this._hidden ||
            this._hideTimeoutId) {
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
                this._panelActor.contains(focus))
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
            return this._positionActor.y;
        const panelHeight = this._getPanelHeight();
        return panelIsTop(this._settings)
            ? monitor.y
            : monitor.y + monitor.height - panelHeight;
    }

    _hiddenY(monitor) {
        if (!monitor)
            return this._positionActor.y;
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
