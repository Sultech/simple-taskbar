// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import {pointerButtonIsPressed} from '../inputUtils.js';

const FULLSCREEN_POINTER_POLL_INTERVAL = 20;

export class PanelFullscreenRevealController {
    constructor({positionActor, getActorData, getMonitor, pointerIsInsidePanel, isBlocked, onVisibilityChanged}) {
        this._positionActor = positionActor;
        this._getActorData = getActorData;
        this._getMonitor = getMonitor;
        this._pointerIsInsidePanel = pointerIsInsidePanel;
        this._isBlockedCallback = isBlocked;
        this._onVisibilityChanged = onVisibilityChanged;
        this._originalTrackFullscreen = false;
        this._fullscreenVisibilityHeld = false;
        this._fullscreenPointerRevealHeld = false;
        this._fullscreenWatchId = 0;
        this._fullscreenReleasePending = false;
        this._pointerButtonPressed = false;
    }

    get visibilityHeld() {
        return this._fullscreenVisibilityHeld;
    }

    get pointerRevealHeld() {
        return this._fullscreenPointerRevealHeld;
    }

    captureTracking(actorData) {
        this._originalTrackFullscreen = actorData.trackFullscreen;
    }

    cancelPendingRelease() {
        this._fullscreenReleasePending = false;
    }

    destroy() {
        this.stopWatch();
        this.restoreState();
        this._positionActor = null;
        this._getActorData = null;
        this._getMonitor = null;
        this._pointerIsInsidePanel = null;
        this._isBlockedCallback = null;
        this._onVisibilityChanged = null;
    }

    restore() {
        this.stopWatch();
        this.restoreState();
    }

    hold(pointerReveal) {
        this._getActorData().trackFullscreen = false;
        this._positionActor.visible = true;
        this._fullscreenVisibilityHeld = !pointerReveal;
        this._fullscreenPointerRevealHeld = pointerReveal;
        this._onVisibilityChanged();
    }

    restoreState() {
        if (!this._fullscreenVisibilityHeld && !this._fullscreenPointerRevealHeld)
            return;

        this._fullscreenVisibilityHeld = false;
        this._fullscreenPointerRevealHeld = false;
        const monitor = this._getMonitor();
        this._getActorData().trackFullscreen =
            this._originalTrackFullscreen;
        this._positionActor.visible =
            !this._originalTrackFullscreen ||
            !(global.window_group.visible && monitor?.inFullscreen);
        this._onVisibilityChanged();
    }

    startWatch() {
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
                this.restore();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    stopWatch() {
        if (this._fullscreenWatchId)
            GLib.Source.remove(this._fullscreenWatchId);
        this._fullscreenWatchId = 0;
        this._fullscreenReleasePending = false;
        this._pointerButtonPressed = false;
    }
}
