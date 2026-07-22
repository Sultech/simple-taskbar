// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class WindowController {
    constructor(tracker, {settings, spreadAppWindows, getMonitor}) {
        this._tracker = tracker;
        this._settings = settings;
        this._spreadAppWindows = spreadAppWindows;
        this._getMonitor = getMonitor;
        this._taskbar = null;
        this._previews = null;
        this._showDesktopButton = null;
        this._minimizedWindows = [];
        this._desktopFocusWindow = null;
    }

    setTaskbarController(controller) {
        this._taskbar = controller;
    }

    setPreviewController(controller) {
        this._previews = controller;
    }

    setShowDesktopButton(button) {
        this._showDesktopButton = button;
    }

    getInterestingWindows(app) {
        const windows = app.get_windows().filter(
            window => !window.skip_taskbar
        );
        const isolateWorkspaces =
            this._settings?.get_boolean('isolate-workspaces') ?? false;
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
            this._settings?.get_boolean('multi-monitor-panels') &&
            Main.layoutManager.monitors.length > 1 &&
            (this._settings.get_boolean('isolate-monitors') ||
                isolateWorkspaces &&
                    Meta.prefs_get_workspaces_only_on_primary())
        );
    }

    activateApp(app) {
        const windows = this.getInterestingWindows(app);
        const overviewShown = Main.overview._shown ?? Main.overview.visible;
        if (windows.length === 0) {
            const isolateWorkspaces =
                this._settings?.get_boolean('isolate-workspaces') ?? false;
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
            this._taskbar?.updateAppIconGeometry(app);
            for (const window of windows)
                window.minimize();
            return;
        }

        Main.activateWindow(windows[0]);
    }

    handleAppClicked(item, app) {
        const windows = this.getInterestingWindows(app);
        if (windows.length > 1 &&
            this._settings?.get_boolean('multi-window-click-spread')) {
            this._previews?.hideTooltip(false);
            this._previews?.hide();
            this._spreadAppWindows(app);
            return;
        }

        if (Main.overview._shown ?? Main.overview.visible) {
            this._previews?.hide();
            this.activateApp(app);
            return;
        }

        if (windows.length > 1) {
            this._previews?.show(item);
            return;
        }

        this._previews?.hide();
        this.activateApp(app);
    }

    handleWindowClicked(window) {
        if (!window || window.skip_taskbar)
            return;

        const overviewShown = Main.overview._shown ?? Main.overview.visible;
        if (overviewShown) {
            Main.activateWindow(window);
            Main.overview.hide();
            return;
        }

        if (global.display.focus_window === window) {
            const app = this._tracker.get_window_app(window);
            this._taskbar?.updateAppIconGeometry(app);
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
        if (Main.overview._shown ?? Main.overview.visible)
            Main.overview.hide();
    }

    toggleDesktop() {
        if (this._minimizedWindows.length > 0) {
            this.restoreDesktop(true);
            return;
        }

        const activeWorkspace = global.workspace_manager.get_active_workspace();
        const visibleWindows = activeWorkspace.list_windows().filter(window =>
            !window.skip_taskbar && window.showing_on_its_workspace()
        );
        this._minimizedWindows =
            global.display.sort_windows_by_stacking(visibleWindows);
        const focusWindow = global.display.focus_window;
        this._desktopFocusWindow = this._minimizedWindows.includes(focusWindow)
            ? focusWindow
            : this._minimizedWindows.at(-1) ?? null;
        this._taskbar?.updateWindowIconGeometries();
        for (const window of this._minimizedWindows)
            window.minimize();
        if (this._showDesktopButton)
            this._showDesktopButton.checked = this._minimizedWindows.length > 0;
    }

    restoreDesktop(activateWindow = false) {
        const windows = this._minimizedWindows.filter(
            window => window.get_compositor_private() !== null
        );
        const focusWindow = windows.includes(this._desktopFocusWindow)
            ? this._desktopFocusWindow
            : windows.at(-1) ?? null;
        this._minimizedWindows = [];
        this._desktopFocusWindow = null;
        if (this._showDesktopButton)
            this._showDesktopButton.checked = false;
        for (const window of windows)
            window.unminimize();
        if (activateWindow && focusWindow)
            Main.activateWindow(focusWindow);
    }

    destroy() {
        this.restoreDesktop();
        this._showDesktopButton = null;
        this._previews = null;
        this._taskbar = null;
        this._spreadAppWindows = null;
        this._getMonitor = null;
        this._settings = null;
        this._tracker = null;
    }
}
