// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {CLICK_ACTION} from '../shared/applicationClickActions.js';

const CYCLE_MEMORY_TIME = 3000;

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
        this._cycleState = null;
        this._cycleResetId = 0;
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

    _raiseAppWindows(app) {
        const windows = this.getInterestingWindows(app);
        if (windows.length === 0) {
            this.activateApp(app);
            return;
        }

        Main.activateWindow(windows[0]);
        const workspace =
            global.workspace_manager.get_active_workspace();
        for (let index = windows.length - 1; index >= 0; index--) {
            if (windows[index].get_workspace() === workspace)
                Main.activateWindow(windows[index]);
        }
        Main.overview.hide();
    }

    _minimizeWindows(windows, allWindows = true) {
        const workspace =
            global.workspace_manager.get_active_workspace();
        for (const window of windows) {
            if (window.get_workspace() === workspace &&
                window.showing_on_its_workspace()) {
                window.minimize();
                if (!allWindows)
                    break;
            }
        }
        Main.overview.hide();
    }

    _toggleAppWindows(app) {
        const windows = this.getInterestingWindows(app);
        if (windows.length === 0) {
            this.activateApp(app);
            return;
        }

        if (this._tracker.focus_app !== app) {
            this._raiseAppWindows(app);
            return;
        }

        const workspace =
            global.workspace_manager.get_active_workspace();
        const hasVisibleWindow = windows.some(window =>
            window.get_workspace() === workspace &&
            window.showing_on_its_workspace()
        );
        if (!hasVisibleWindow) {
            this._raiseAppWindows(app);
            return;
        }

        this._minimizeWindows(windows);
    }

    _cycleAppWindows(app, action) {
        const windows = this.getInterestingWindows(app);
        if (windows.length === 0) {
            this._resetCycleState();
            this.activateApp(app);
            return;
        }

        if (this._tracker.focus_app !== app) {
            this._resetCycleState();
            Main.activateWindow(windows[0]);
            Main.overview.hide();
            return;
        }

        const state = this._cycleState;
        const sameWindows = state && state.app === app &&
            state.action === action &&
            state.windows.length === windows.length &&
            state.windows.every(window => windows.includes(window));
        if (!sameWindows) {
            this._cycleState = {
                app,
                action,
                windows: [...windows],
                index: Math.max(
                    windows.indexOf(global.display.focus_window),
                    0
                ),
            };
        }

        const minimizeAfterCycle = action === CLICK_ACTION.CYCLE_MINIMIZE;
        const cycleLength = this._cycleState.windows.length +
            (minimizeAfterCycle ? 1 : 0);
        this._cycleState.index++;
        const index = this._cycleState.index % cycleLength;
        this._restartCycleReset();
        if (minimizeAfterCycle && index === this._cycleState.windows.length)
            this._minimizeWindows(this._cycleState.windows);
        else {
            Main.activateWindow(this._cycleState.windows[index]);
            Main.overview.hide();
        }
    }

    _restartCycleReset() {
        if (this._cycleResetId)
            GLib.Source.remove(this._cycleResetId);
        this._cycleResetId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            CYCLE_MEMORY_TIME,
            () => {
                this._cycleResetId = 0;
                this._cycleState = null;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _resetCycleState() {
        if (this._cycleResetId) {
            GLib.Source.remove(this._cycleResetId);
            this._cycleResetId = 0;
        }
        this._cycleState = null;
    }

    handleAppScrolled(item, direction) {
        const windows = this.getInterestingWindows(item._taskbarApp);
        if (windows.length < 2)
            return;

        windows.sort((a, b) =>
            a.get_stable_sequence() - b.get_stable_sequence()
        );
        let index = windows.indexOf(global.display.focus_window);
        if (index < 0)
            index = windows.indexOf(item._taskbarWindow);
        if (index < 0)
            index = 0;

        const step = direction === Meta.MotionDirection.UP ||
            direction === Meta.MotionDirection.LEFT
            ? -1
            : 1;
        const nextIndex = (index + step + windows.length) % windows.length;
        Main.activateWindow(windows[nextIndex]);
        Main.overview.hide();
    }

    handlePanelScrolled(direction) {
        const apps = new Set();
        const windows = [];
        for (const item of this._getTaskbar().getItems()) {
            const app = item._taskbarApp;
            if (!app || app._simpleTaskbarLocation || apps.has(app))
                continue;

            apps.add(app);
            windows.push(...this.getInterestingWindows(app));
        }
        if (windows.length === 0)
            return false;

        windows.sort((a, b) =>
            a.get_stable_sequence() - b.get_stable_sequence()
        );
        const focusWindow = global.display.focus_window;
        let index = windows.indexOf(focusWindow);
        if (index < 0)
            index = 0;
        else {
            const step = direction === Meta.MotionDirection.UP ||
                direction === Meta.MotionDirection.LEFT
                ? -1
                : 1;
            index = (index + step + windows.length) % windows.length;
        }

        if (windows[index] === focusWindow)
            return false;

        Main.activateWindow(windows[index]);
        Main.overview.hide();
        return true;
    }

    handleAppClicked(
        item,
        app,
        action = this._settings.get_string('application-click-action')
    ) {
        const previews = this._getPreviews();
        const windows = this.getInterestingWindows(app);
        const isCycleAction = action === CLICK_ACTION.CYCLE_MINIMIZE ||
            action === CLICK_ACTION.CYCLE ||
            action === CLICK_ACTION.TOGGLE_CYCLE;
        if (item._taskbarWindow) {
            this._resetCycleState();
            previews.hide();
            this._handleWindowAction(item._taskbarWindow, action);
            return;
        }
        if (!isCycleAction)
            this._resetCycleState();

        if (action === CLICK_ACTION.TOGGLE_SPREAD && windows.length > 1) {
            previews.hideTooltip(false);
            previews.hide();
            this._spreadAppWindows(app);
            return;
        }

        if (action === CLICK_ACTION.TOGGLE_SHOW_PREVIEW &&
            windows.length > 1 &&
            !Main.overview._shown) {
            previews.show(item);
            return;
        }

        previews.hide();
        if (action === CLICK_ACTION.TOGGLE_SPREAD ||
            action === CLICK_ACTION.TOGGLE_SHOW_PREVIEW) {
            this._resetCycleState();
            this.activateApp(app);
            return;
        }

        switch (action) {
        case CLICK_ACTION.CYCLE_MINIMIZE:
            if (Main.overview._shown) {
                this._resetCycleState();
                this.activateApp(app);
            } else {
                this._cycleAppWindows(app, action);
            }
            break;
        case CLICK_ACTION.CYCLE:
            if (Main.overview._shown) {
                this._resetCycleState();
                this.activateApp(app);
            } else {
                this._cycleAppWindows(app, action);
            }
            break;
        case CLICK_ACTION.TOGGLE_CYCLE:
            if (Main.overview._shown || windows.length <= 1) {
                this._resetCycleState();
                this.activateApp(app);
            } else {
                this._cycleAppWindows(app, action);
            }
            break;
        case CLICK_ACTION.TOGGLE_WINDOWS:
            if (Main.overview._shown) {
                this._resetCycleState();
                this.activateApp(app);
            } else {
                this._toggleAppWindows(app);
            }
            break;
        case CLICK_ACTION.MINIMIZE:
            if (windows.length === 0)
                this.activateApp(app);
            else
                this._minimizeWindows(windows, false);
            break;
        case CLICK_ACTION.RAISE_WINDOWS:
            this._raiseAppWindows(app);
            break;
        case CLICK_ACTION.LAUNCH:
            this.openNewWindow(app);
            break;
        case CLICK_ACTION.QUIT:
            this._getTaskbar().closeApp(app, global.get_current_time());
            break;
        }
    }

    _handleWindowAction(window, action) {
        const app = this._tracker.get_window_app(window);
        if (action === CLICK_ACTION.LAUNCH) {
            this.openNewWindow(app);
            return;
        }

        if (action === CLICK_ACTION.QUIT) {
            window.delete(global.get_current_time());
            return;
        }

        if (action === CLICK_ACTION.MINIMIZE) {
            if (Main.overview._shown)
                Main.activateWindow(window);
            else {
                this._getTaskbar().updateAppIconGeometry(app);
                window.minimize();
                Main.overview.hide();
            }
            return;
        }

        const minimizeFocusedActions = [
            CLICK_ACTION.CYCLE_MINIMIZE,
            CLICK_ACTION.TOGGLE_SHOW_PREVIEW,
            CLICK_ACTION.TOGGLE_CYCLE,
            CLICK_ACTION.TOGGLE_SPREAD,
        ];
        if (!Main.overview._shown &&
            global.display.focus_window === window &&
            minimizeFocusedActions.includes(action)) {
            this._getTaskbar().updateAppIconGeometry(app);
            window.minimize();
            return;
        }

        this.handleWindowClicked(window);
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
        this._resetCycleState();
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
