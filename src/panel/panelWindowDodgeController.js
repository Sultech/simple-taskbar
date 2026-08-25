// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {DODGE_WINDOW_MODE} from '../shared/windowDodgeModes.js';

const HANDLED_WINDOW_TYPES = new Set([
    Meta.WindowType.NORMAL,
    Meta.WindowType.DOCK,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.TOOLBAR,
    Meta.WindowType.MENU,
    Meta.WindowType.UTILITY,
    Meta.WindowType.SPLASHSCREEN,
    Meta.WindowType.DROPDOWN_MENU,
]);
const IGNORED_APPLICATIONS = new Set([
    'com.rastersoft.ding',
    'com.desktop.ding',
]);
const DODGE_CHECK_INTERVAL = 100;

export class PanelWindowDodgeController {
    constructor({
        settings,
        getMonitor,
        getGeometry,
        onDodgeStateChanged,
        autohideKey,
        dodgeEnabledKey,
        dodgeModeKey,
        dodgePointerRevealKey,
    }) {
        this._settings = settings;
        this._getMonitor = getMonitor;
        this._getGeometry = getGeometry;
        this._onDodgeStateChanged = onDodgeStateChanged;
        this._autohideKey = autohideKey;
        this._dodgeEnabledKey = dodgeEnabledKey;
        this._dodgeModeKey = dodgeModeKey;
        this._dodgePointerRevealKey = dodgePointerRevealKey;
        this._tracker = Shell.WindowTracker.get_default();
        this._signalHolder = new TransientSignalHolder();
        this._trackedWindowActors = new Set();
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
            this._signalHolder
        );
        this._tracker.connectObject(
            'notify::focus-app', () => this._queueSync(),
            this._signalHolder
        );
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._queueSync(),
            this._signalHolder
        );
        Main.layoutManager.connectObject(
            'monitors-changed', () => this._queueSync(),
            this._signalHolder
        );
        Main.overview.connectObject(
            'showing', () => this._sync(),
            'hiding', () => this._sync(),
            'hidden', () => this._queueSync(),
            this._signalHolder
        );
        this._settings.connectObject(
            `changed::${this._autohideKey}`, () => {
                if (this._settings.get_boolean(this._autohideKey) &&
                    this._settings.get_boolean(this._dodgeEnabledKey)) {
                    this._settings.set_boolean(
                        this._dodgeEnabledKey,
                        false
                    );
                }
                this._queueSync();
            },
            `changed::${this._dodgeEnabledKey}`, () => {
                if (this._settings.get_boolean(this._dodgeEnabledKey) &&
                    this._settings.get_boolean(this._autohideKey)) {
                    this._settings.set_boolean(
                        this._autohideKey,
                        false
                    );
                }
                this._queueSync();
            },
            `changed::${this._dodgeModeKey}`, () => this._queueSync(),
            `changed::${this._dodgePointerRevealKey}`, () => this._queueSync(),
            this._signalHolder
        );
        if (this._settings.get_boolean(this._autohideKey) &&
            this._settings.get_boolean(this._dodgeEnabledKey)) {
            this._settings.set_boolean(this._autohideKey, false);
        }
        this._sync();
    }

    sync() {
        this._queueSync();
    }

    destroy() {
        if (this._syncId)
            GLib.Source.remove(this._syncId);
        this._syncId = 0;
        this._syncPending = false;
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._trackedWindowActors.clear();
        this._settings = null;
        this._getMonitor = null;
        this._getGeometry = null;
        this._onDodgeStateChanged = null;
        this._autohideKey = null;
        this._dodgeEnabledKey = null;
        this._dodgeModeKey = null;
        this._dodgePointerRevealKey = null;
        this._tracker = null;
    }

    _trackWindowActor(actor) {
        if (this._trackedWindowActors.has(actor))
            return;

        this._trackedWindowActors.add(actor);
        actor.connectObject(
            'notify::allocation', () => this._queueSync(),
            'notify::visible', () => this._queueSync(),
            'destroy', () => {
                this._trackedWindowActors.delete(actor);
                this._queueSync();
            },
            this._signalHolder
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
        const enabled = this._settings.get_boolean(this._dodgeEnabledKey);
        const pointerReveal = this._settings.get_boolean(
            this._dodgePointerRevealKey
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
            this._isEligibleWindow(actor, activeWorkspace)
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
        const mode = this._settings.get_string(this._dodgeModeKey);

        for (const actor of windows) {
            const window = actor.get_meta_window();
            if (!this._matchesMode(
                window,
                mode,
                focusApp,
                topApp,
                focusWindow
            )) {
                continue;
            }

            if (this._overlaps(window.get_frame_rect(), geometry))
                return true;
        }

        return false;
    }

    _isEligibleWindow(actor, activeWorkspace) {
        const window = actor.get_meta_window();
        if (window.get_workspace() !== activeWorkspace)
            return false;
        if (window.minimized)
            return false;
        const applicationId = window.get_gtk_application_id();
        if (IGNORED_APPLICATIONS.has(applicationId) &&
            window.is_skip_taskbar()) {
            return false;
        }
        if (window.get_wm_class() === 'DropDownTerminalWindow')
            return window.showing_on_its_workspace();

        return HANDLED_WINDOW_TYPES.has(window.get_window_type()) &&
            window.showing_on_its_workspace();
    }

    _matchesMode(window, mode, focusApp, topApp, focusWindow) {
        if (mode === DODGE_WINDOW_MODE.ALL_WINDOWS)
            return true;

        if (mode === DODGE_WINDOW_MODE.FOCUSED_APPLICATION) {
            if (!focusApp)
                return true;
            if (window.get_wm_class() === 'DropDownTerminalWindow')
                return true;

            const application = this._tracker.get_window_app(window);
            const halfMaximized = focusWindow &&
                focusWindow.maximized_vertically &&
                !focusWindow.maximized_horizontally &&
                window.maximized_vertically &&
                !window.maximized_horizontally &&
                window.get_monitor() === focusWindow.get_monitor();
            return application === focusApp || application === topApp ||
                halfMaximized || window.is_above();
        }

        if (mode === DODGE_WINDOW_MODE.MAXIMIZED_WINDOWS)
            return window.maximized_vertically ||
                window.maximized_horizontally || window.fullscreen;

        return false;
    }

    _overlaps(rect, geometry) {
        return rect.x < geometry.x + geometry.width &&
            rect.x + rect.width >= geometry.x &&
            rect.y < geometry.y + geometry.height &&
            rect.y + rect.height >= geometry.y;
    }
}
