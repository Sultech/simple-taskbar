// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DRAG_HOVER_ACTIVATION_TIMEOUT = 250;

export class TaskbarDragHoverActivator {
    constructor({taskbarActor, getInterestingWindows}) {
        this._taskbarActor = taskbarActor;
        this._getInterestingWindows = getInterestingWindows;
        this._hoverTarget = null;
        this._activationId = 0;
        this._dragMonitor = {
            dragMotion: event => this._onDragMotion(event),
        };
    }

    enable() {
        DND.addDragMonitor(this._dragMonitor);
        Main.xdndHandler.connectObject('drag-end', () => this._setHoverItem(null), this);
    }

    destroy() {
        if (this._activationId) {
            GLib.Source.remove(this._activationId);
            this._activationId = 0;
        }
        Main.xdndHandler.disconnectObject(this);
        DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = null;
        this._hoverTarget = null;
        this._getInterestingWindows = null;
        this._taskbarActor = null;
    }

    _onDragMotion(event) {
        if (event.source === Main.xdndHandler)
            this._setHoverItem(this._itemFor(event.targetActor));
        return DND.DragMotionResult.CONTINUE;
    }

    _itemFor(actor) {
        while (actor && actor.get_parent() !== this._taskbarActor)
            actor = actor.get_parent();
        return actor && actor._taskbarApp && !actor.animatingOut ? actor : null;
    }

    _setHoverItem(item) {
        if (item?._taskbarApp === this._hoverTarget?.app &&
            item?._taskbarWindow === this._hoverTarget?.window)
            return;

        this._hoverTarget = item
            ? {app: item._taskbarApp, window: item._taskbarWindow}
            : null;
        if (this._activationId) {
            GLib.Source.remove(this._activationId);
            this._activationId = 0;
        }
        if (!item)
            return;

        this._activationId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            DRAG_HOVER_ACTIVATION_TIMEOUT,
            () => {
                this._activationId = 0;
                this._activate(this._hoverTarget);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _activate({app, window}) {
        const windows = this._getInterestingWindows(app)
            .sort((a, b) => b.get_user_time() - a.get_user_time());
        const target = window && windows.includes(window) ? window : windows[0];
        if (target)
            Main.activateWindow(target);
    }
}
