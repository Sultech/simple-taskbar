// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class WindowController {
    constructor(tracker, {
        settings = null,
        spreadAppWindows = null,
    } = {}) {
        this._tracker = tracker;
        this._settings = settings;
        this._spreadAppWindows = spreadAppWindows;
        this._taskbar = null;
        this._previews = null;
        this._showDesktopButton = null;
        this._minimizedWindows = [];
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
        if (!this._settings?.get_boolean('isolate-workspaces'))
            return windows;

        const activeWorkspace =
            global.workspace_manager.get_active_workspace();
        return windows.filter(window =>
            window.located_on_workspace(activeWorkspace)
        );
    }

    activateApp(app) {
        const windows = this.getInterestingWindows(app);
        const overviewShown = Main.overview._shown ?? Main.overview.visible;
        if (windows.length === 0) {
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
            this._spreadAppWindows?.(app);
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
        this._minimizedWindows = global.get_window_actors()
            .map(actor => actor.meta_window)
            .filter(window =>
                !window.skip_taskbar &&
                !window.minimized &&
                window.located_on_workspace(activeWorkspace)
            );
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
        this._minimizedWindows = [];
        if (this._showDesktopButton)
            this._showDesktopButton.checked = false;
        for (const window of windows)
            window.unminimize();
        if (activateWindow && windows.length > 0)
            Main.activateWindow(windows[0]);
    }

    destroy() {
        this.restoreDesktop();
        this._showDesktopButton = null;
        this._previews = null;
        this._taskbar = null;
        this._spreadAppWindows = null;
        this._settings = null;
        this._tracker = null;
    }
}
