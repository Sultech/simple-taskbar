// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    windowMatchesMode,
    windowIsVisibleOnWorkspace,
    windowOverlapsPanel,
    windowReachesPanel,
} from './panelWindowQueries.js';
import {
    hasDynamicTransparencyWindow,
} from './dynamicTransparency.js';

const DODGE_CHECK_INTERVAL = 100;

const AUTOHIDE_KEY = 'panel-autohide-enabled';
const DODGE_ENABLED_KEY = 'panel-dodge-windows-enabled';
const DODGE_MODE_KEY = 'panel-dodge-windows-mode';
const DODGE_POINTER_REVEAL_KEY = 'panel-dodge-pointer-reveal-enabled';

export class PanelWindowDodgeController {
    constructor({
        settings,
        getMonitor,
        getGeometry,
        onDodgeStateChanged,
        onTransparencyStateChanged,
    }) {
        this._settings = settings;
        this._getMonitor = getMonitor;
        this._getGeometry = getGeometry;
        this._onDodgeStateChanged = onDodgeStateChanged;
        this._onTransparencyStateChanged = onTransparencyStateChanged;
        this._tracker = Shell.WindowTracker.get_default();
        this._trackedWindowActors = new Map();
        this._hasTransparencyWindow = false;
        this._syncId = 0;
        this._syncPending = false;
    }

    enable() {
        for (const actor of global.get_window_actors())
            this._trackWindowActor(actor);

        global.display.connectObject(
            'window-created', (_display, window) => {
                this._trackWindowActor(window.get_compositor_private());
                this._queueSync();
            },
            'restacked', () => this._queueSync(),
            'notify::focus-window', () => this._queueSync(),
            'window-entered-monitor', () => this._queueSync(),
            'window-left-monitor', () => this._queueSync(),
            this
        );
        this._tracker.connectObject(
            'notify::focus-app', () => this._queueSync(),
            this
        );
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._queueSync(),
            this
        );
        Main.layoutManager.connectObject(
            'monitors-changed', () => this._queueSync(),
            this
        );
        Main.overview.connectObject(
            'showing', () => this._sync(),
            'hiding', () => this._sync(),
            'hidden', () => this._queueSync(),
            this
        );
        this._settings.connectObject(
            `changed::${AUTOHIDE_KEY}`, () => {
                if (this._settings.get_boolean(AUTOHIDE_KEY) &&
                    this._settings.get_boolean(DODGE_ENABLED_KEY)) {
                    this._settings.set_boolean(
                        DODGE_ENABLED_KEY,
                        false
                    );
                }
                this._queueSync();
            },
            `changed::${DODGE_ENABLED_KEY}`, () => {
                if (this._settings.get_boolean(DODGE_ENABLED_KEY) &&
                    this._settings.get_boolean(AUTOHIDE_KEY)) {
                    this._settings.set_boolean(
                        AUTOHIDE_KEY,
                        false
                    );
                }
                this._queueSync();
            },
            `changed::${DODGE_MODE_KEY}`, () => this._queueSync(),
            `changed::${DODGE_POINTER_REVEAL_KEY}`, () => this._queueSync(),
            'changed::transparency-on-unmaximized',
            () => this._queueSync(),
            'changed::transparency-dynamic-behavior',
            () => this._queueSync(),
            'changed::transparency-dynamic-distance',
            () => this._queueSync(),
            this
        );
        if (this._settings.get_boolean(AUTOHIDE_KEY) &&
            this._settings.get_boolean(DODGE_ENABLED_KEY)) {
            this._settings.set_boolean(AUTOHIDE_KEY, false);
        }
        this._sync();
    }

    destroy() {
        if (this._syncId)
            GLib.Source.remove(this._syncId);
        this._syncId = 0;
        this._syncPending = false;
        global.display.disconnectObject(this);
        this._tracker.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._settings.disconnectObject(this);
        for (const [actor, window] of this._trackedWindowActors) {
            window.disconnectObject(this);
            actor.disconnectObject(this);
        }
        this._trackedWindowActors.clear();
        this._settings = null;
        this._getMonitor = null;
        this._getGeometry = null;
        this._onDodgeStateChanged = null;
        this._onTransparencyStateChanged = null;
        this._tracker = null;
    }

    sync() {
        this._queueSync();
    }

    _trackWindowActor(actor) {
        if (this._trackedWindowActors.has(actor))
            return;

        const window = actor.get_meta_window();
        this._trackedWindowActors.set(actor, window);
        window.connectObject(
            'notify::maximized-horizontally', () => this._queueSync(),
            'notify::maximized-vertically', () => this._queueSync(),
            'notify::minimized', () => this._queueSync(),
            'workspace-changed', () => this._queueSync(),
            this
        );
        actor.connectObject(
            'notify::allocation', () => this._queueSync(),
            'notify::visible', () => this._queueSync(),
            'destroy', () => {
                window.disconnectObject(this);
                this._trackedWindowActors.delete(actor);
                this._queueSync();
            },
            this
        );
    }

    _queueSync() {
        if (this._syncId) {
            this._syncPending = true;
            return;
        }

        this._sync();
        this._syncId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            DODGE_CHECK_INTERVAL,
            () => {
                this._sync();
                if (this._syncPending) {
                    this._syncPending = false;
                    return GLib.SOURCE_CONTINUE;
                }

                this._syncId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _sync() {
        const monitor = this._getMonitor();
        const hasTransparencyWindow = monitor
            ? this._settings.get_boolean('transparency-on-unmaximized') &&
                hasDynamicTransparencyWindow(
                    this._settings,
                    monitor,
                    this._getGeometry(monitor)
                )
            : false;
        if (hasTransparencyWindow !== this._hasTransparencyWindow) {
            this._hasTransparencyWindow = hasTransparencyWindow;
            this._onTransparencyStateChanged();
        }

        const enabled = this._settings.get_boolean(DODGE_ENABLED_KEY);
        const pointerReveal = this._settings.get_boolean(
            DODGE_POINTER_REVEAL_KEY
        );
        const active = enabled && !Main.overview.visibleTarget &&
            !Main.overview.animationInProgress && this._hasOverlap();
        this._onDodgeStateChanged(enabled, active, pointerReveal);
    }

    _hasOverlap() {
        const monitor = this._getMonitor();
        if (!monitor)
            return false;

        const geometry = this._getGeometry(monitor);
        const activeWorkspace = global.workspace_manager.get_active_workspace();
        const windows = global.get_window_actors().filter(actor =>
            this._trackedWindowActors.has(actor) &&
            windowIsVisibleOnWorkspace(
                actor.get_meta_window(),
                activeWorkspace
            )
        );
        if (windows.length === 0)
            return false;

        let topWindow = null;
        for (let index = windows.length - 1; index >= 0; index--) {
            const window = windows[index].get_meta_window();
            if (window.get_monitor() === monitor.index) {
                topWindow = window;
                break;
            }
        }

        const topApp = topWindow
            ? this._tracker.get_window_app(topWindow)
            : null;
        const focusApp = this._tracker.focus_app || topApp;
        const focusWindow = global.display.get_focus_window();
        const mode = this._settings.get_string(DODGE_MODE_KEY);

        for (const actor of windows) {
            const window = actor.get_meta_window();
            if (!windowMatchesMode(
                window,
                mode,
                focusApp,
                topApp,
                focusWindow,
                this._tracker,
                windowReachesPanel
            )) {
                continue;
            }

            if (windowOverlapsPanel(window.get_frame_rect(), geometry, 0))
                return true;
        }

        return false;
    }
}
