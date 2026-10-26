// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function fillAppGridIfEmpty() {
    const appDisplay = Main.overview._overview.controls._appDisplay;
    if (appDisplay._orderedItems.length === 0)
        appDisplay._redisplay();
}

export class FloatingPanelWindowTracker {
    constructor(onPosition) {
        this._onPosition = onPosition;
        this._workspaceWindows = new Set();
        this._activeWorkspace = null;
    }

    enable() {
        this._syncWorkspaceWindows();
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => {
                this._syncWorkspaceWindows();
                this._onPosition(true, true);
            }, this
        );
        global.display.connectObject(
            'notify::focus-window', () => this._onPosition(true, true),
            'window-entered-monitor', () => this._onPosition(true, true),
            'window-left-monitor', () => this._onPosition(true, true),
            this
        );
        Main.overview.connectObject(
            'showing', () => {
                fillAppGridIfEmpty();
                this._onPosition(true, true);
            },
            'hiding', () => this._onPosition(true, true),
            this
        );
    }

    destroy() {
        global.workspace_manager.disconnectObject(this);
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);
        if (this._activeWorkspace)
            this._activeWorkspace.disconnectObject(this);
        for (const window of this._workspaceWindows)
            window.disconnectObject(this);
        this._workspaceWindows.clear();
        this._activeWorkspace = null;
        this._onPosition = null;
    }

    _syncWorkspaceWindows() {
        const workspace = global.workspace_manager.get_active_workspace();
        if (workspace === this._activeWorkspace)
            return;

        if (this._activeWorkspace)
            this._activeWorkspace.disconnectObject(this);
        for (const window of this._workspaceWindows)
            window.disconnectObject(this);
        this._workspaceWindows.clear();
        this._activeWorkspace = workspace;
        workspace.connectObject(
            'window-added',
            (_workspace, window) => {
                this._trackWorkspaceWindow(window);
                this._onPosition(true, true);
            },
            'window-removed',
            (_workspace, window) => {
                this._untrackWorkspaceWindow(window);
                this._onPosition(true, true);
            },
            this
        );
        for (const window of workspace.list_windows())
            this._trackWorkspaceWindow(window);
    }

    _trackWorkspaceWindow(window) {
        if (this._workspaceWindows.has(window))
            return;

        this._workspaceWindows.add(window);
        window.connectObject(
            'notify::maximized-horizontally',
            () => this._onPosition(true, true),
            'notify::maximized-vertically',
            () => this._onPosition(true, true),
            'notify::minimized',
            () => this._onPosition(true, true),
            this
        );
    }

    _untrackWorkspaceWindow(window) {
        if (!this._workspaceWindows.delete(window))
            return;

        window.disconnectObject(this);
    }
}
