import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {TransientSignalHolder} from 'resource:///org/gnome/shell/misc/signalTracker.js';

function fillAppGridIfEmpty() {
    const appDisplay = Main.overview._overview.controls._appDisplay;
    if (appDisplay._orderedItems.length === 0)
        appDisplay._redisplay();
}

export class FloatingPanelWindowTracker {
    constructor(onPosition) {
        this._onPosition = onPosition;
        this._signalHolder = new TransientSignalHolder();
        this._workspaceWindows = new Set();
        this._activeWorkspace = null;
    }

    enable() {
        this._syncWorkspaceWindows();
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => {
                this._syncWorkspaceWindows();
                this._onPosition(true, true);
            }, this._signalHolder
        );
        global.display.connectObject(
            'notify::focus-window', () => this._onPosition(true, true),
            'window-entered-monitor', () => this._onPosition(true, true),
            'window-left-monitor', () => this._onPosition(true, true),
            this._signalHolder
        );
        Main.overview.connectObject(
            'showing', () => {
                fillAppGridIfEmpty();
                this._onPosition(true, true);
            },
            'hiding', () => this._onPosition(true, true),
            this._signalHolder
        );
    }

    destroy() {
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._workspaceWindows.clear();
        this._activeWorkspace = null;
        this._onPosition = null;
    }

    _syncWorkspaceWindows() {
        const workspace = global.workspace_manager.get_active_workspace();
        if (workspace === this._activeWorkspace)
            return;

        if (this._activeWorkspace)
            this._activeWorkspace.disconnectObject(this._signalHolder);
        for (const window of this._workspaceWindows)
            window.disconnectObject(this._signalHolder);
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
            this._signalHolder
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
            this._signalHolder
        );
    }

    _untrackWorkspaceWindow(window) {
        if (!this._workspaceWindows.delete(window))
            return;

        window.disconnectObject(this._signalHolder);
    }
}
