// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class WindowController {
    constructor(tracker, {
        settings,
        spreadAppWindows,
        getMonitor,
        getTaskbarController,
        getPreviewController,
    }) {
        this._tracker = tracker;
        this._settings = settings;
        this._spreadAppWindows = spreadAppWindows;
        this._getMonitor = getMonitor;
        this._getTaskbar = getTaskbarController;
        this._getPreviews = getPreviewController;
        this._showDesktopButton = null;
        this._desktopStates = new Map();
        this._minimizedWindowSignals = new Map();
        this._workspaceSignalIds = [
            global.workspace_manager.connect(
                'active-workspace-changed',
                () => this._syncShowDesktopButton()
            ),
            global.workspace_manager.connect(
                'workspace-removed',
                () => this._dropRemovedWorkspaceStates()
            ),
        ];
    }

    setShowDesktopButton(button) {
        this._showDesktopButton = button;
        this._syncShowDesktopButton();
    }

    getInterestingWindows(app) {
        const windows = app.get_windows().filter(
            window => !window.skip_taskbar
        );
        const isolateWorkspaces =
            this._settings.get_boolean('isolate-workspaces');
        const isolateMonitors = this._isolatesMonitors(isolateWorkspaces);
        if (!isolateWorkspaces && !isolateMonitors)
            return windows;

        const activeWorkspace =
            global.workspace_manager.get_active_workspace();
        const monitor = isolateMonitors ? this._getMonitor() : null;
        return windows.filter(window =>
            (!isolateWorkspaces ||
                window.located_on_workspace(activeWorkspace)) &&
            (!monitor || window.get_monitor() === monitor.index)
        );
    }

    _isolatesMonitors(isolateWorkspaces = false) {
        return Boolean(
            this._settings.get_boolean('multi-monitor-panels') &&
            Main.layoutManager.monitors.length > 1 &&
            (this._settings.get_boolean('isolate-monitors') ||
                isolateWorkspaces &&
                    Meta.prefs_get_workspaces_only_on_primary())
        );
    }

    activateApp(app) {
        const windows = this.getInterestingWindows(app);
        const overviewShown = Main.overview._shown;
        if (windows.length === 0) {
            const isolateWorkspaces =
                this._settings.get_boolean('isolate-workspaces');
            const runningOutsideScope =
                (isolateWorkspaces ||
                    this._isolatesMonitors(isolateWorkspaces)) &&
                app.get_windows().some(window => !window.skip_taskbar);
            if (runningOutsideScope && app.can_open_new_window())
                app.open_new_window(-1);
            else
                app.activate();
            if (overviewShown)
                Main.overview.hide();
            return;
        }

        windows.sort((a, b) => b.get_user_time() - a.get_user_time());
        if (overviewShown) {
            Main.activateWindow(windows[0]);
            Main.overview.hide();
            return;
        }

        if (this._tracker.focus_app === app) {
            this._getTaskbar().updateAppIconGeometry(app);
            for (const window of windows)
                window.minimize();
            return;
        }

        Main.activateWindow(windows[0]);
    }

    handleAppClicked(item, app) {
        const windows = this.getInterestingWindows(app);
        if (windows.length > 1 &&
            this._settings.get_boolean('multi-window-click-spread')) {
            this._getPreviews().hideTooltip(false);
            this._getPreviews().hide();
            this._spreadAppWindows(app);
            return;
        }

        if (Main.overview._shown) {
            this._getPreviews().hide();
            this.activateApp(app);
            return;
        }

        if (windows.length > 1) {
            this._getPreviews().show(item);
            return;
        }

        this._getPreviews().hide();
        this.activateApp(app);
    }

    handleWindowClicked(window) {
        if (!window || window.skip_taskbar)
            return;

        const overviewShown = Main.overview._shown;
        if (overviewShown) {
            Main.activateWindow(window);
            Main.overview.hide();
            return;
        }

        if (global.display.focus_window === window) {
            const app = this._tracker.get_window_app(window);
            this._getTaskbar().updateAppIconGeometry(app);
            window.minimize();
            return;
        }

        Main.activateWindow(window);
    }

    openNewWindow(app) {
        if (app.can_open_new_window())
            app.open_new_window(-1);
        else
            app.activate();
        if (Main.overview._shown)
            Main.overview.hide();
    }

    toggleDesktop() {
        const workspace = global.workspace_manager.get_active_workspace();
        if (this._desktopStates.has(workspace)) {
            this.restoreDesktop(workspace, true);
            return;
        }

        const visibleWindows = workspace.list_windows().filter(window =>
            !window.skip_taskbar && window.showing_on_its_workspace() &&
            window.can_minimize()
        );
        const windows =
            global.display.sort_windows_by_stacking(visibleWindows);
        if (windows.length === 0) {
            this._syncShowDesktopButton();
            return;
        }

        const focusWindow = global.display.focus_window;
        this._desktopStates.set(workspace, {
            windows,
            focusWindow: windows.includes(focusWindow)
                ? focusWindow
                : windows.at(-1),
        });
        this._getTaskbar().updateWindowIconGeometries();
        for (const window of windows) {
            this._minimizedWindowSignals.set(
                window,
                window.connect(
                    'unmanaged',
                    () => this._onMinimizedWindowUnmanaged(workspace, window)
                )
            );
            window.minimize();
        }
        this._syncShowDesktopButton();
    }

    restoreDesktop(workspace, activateWindow = false) {
        const state = this._desktopStates.get(workspace);
        this._forgetDesktopState(workspace);
        const windows = state.windows.filter(
            window => window.get_compositor_private() !== null
        );
        const focusWindow = windows.includes(state.focusWindow)
            ? state.focusWindow
            : windows.at(-1) ?? null;
        for (const window of windows)
            window.unminimize();
        if (activateWindow && focusWindow)
            Main.activateWindow(focusWindow);
        this._syncShowDesktopButton();
    }

    restoreAllDesktops() {
        for (const workspace of [...this._desktopStates.keys()])
            this.restoreDesktop(workspace);
    }

    _onMinimizedWindowUnmanaged(workspace, window) {
        window.disconnect(this._minimizedWindowSignals.get(window));
        this._minimizedWindowSignals.delete(window);
        const state = this._desktopStates.get(workspace);
        state.windows = state.windows.filter(
            candidate => candidate !== window
        );
        if (window === state.focusWindow)
            state.focusWindow = null;
        if (state.windows.length === 0)
            this._desktopStates.delete(workspace);
        this._syncShowDesktopButton();
    }

    _forgetDesktopState(workspace) {
        const state = this._desktopStates.get(workspace);
        for (const window of state.windows) {
            window.disconnect(this._minimizedWindowSignals.get(window));
            this._minimizedWindowSignals.delete(window);
        }
        this._desktopStates.delete(workspace);
    }

    _dropRemovedWorkspaceStates() {
        const workspaceManager = global.workspace_manager;
        const workspaces = new Set();
        for (let index = 0; index < workspaceManager.n_workspaces; index++)
            workspaces.add(workspaceManager.get_workspace_by_index(index));
        for (const workspace of [...this._desktopStates.keys()]) {
            if (!workspaces.has(workspace))
                this._forgetDesktopState(workspace);
        }
        this._syncShowDesktopButton();
    }

    _syncShowDesktopButton() {
        if (!this._showDesktopButton)
            return;

        this._showDesktopButton.checked = this._desktopStates.has(
            global.workspace_manager.get_active_workspace()
        );
    }

    destroy() {
        for (const id of this._workspaceSignalIds)
            global.workspace_manager.disconnect(id);
        this._workspaceSignalIds = [];
        this.restoreAllDesktops();
        this._showDesktopButton = null;
        this._getPreviews = null;
        this._getTaskbar = null;
        this._spreadAppWindows = null;
        this._getMonitor = null;
        this._settings = null;
        this._tracker = null;
    }
}
