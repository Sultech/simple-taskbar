// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {panelIsVertical} from '../panel/panelPosition.js';

const SHELL_VERSION = parseInt(Config.PACKAGE_VERSION);

export class SecondaryPanelWindowDragController {
    constructor({settings, monitor, panelActor}) {
        this._settings = settings;
        this._monitor = monitor;
        this._panelActor = panelActor;
        this._signalHolder = new TransientSignalHolder();
        this._clickGesture = null;
    }

    enable() {
        if (SHELL_VERSION >= 50) {
            this._clickGesture = new Clutter.ClickGesture({
                recognize_on_press: true,
            });
            this._clickGesture.connectObject(
                'recognize', () => this._onWindowDragGestureRecognize(),
                this._signalHolder
            );
            this._panelActor.add_action_full(
                'window-drag',
                Clutter.EventPhase.TARGET,
                this._clickGesture
            );
            return;
        }

        this._panelActor.connectObject(
            'button-press-event',
            (_actor, event) => this._onButtonPress(event),
            'touch-event',
            (_actor, event) => this._onTouchEvent(event),
            this._signalHolder
        );
    }

    destroy() {
        this._signalHolder.destroy();
        this._signalHolder = null;

        if (this._clickGesture) {
            this._panelActor.remove_action(this._clickGesture);
            this._clickGesture = null;
        }

        this._panelActor = null;
        this._monitor = null;
        this._settings = null;
    }

    _onWindowDragGestureRecognize() {
        if (Main.modalCount > 0)
            return;

        const event = this._clickGesture.get_point_event(0);
        const coords = this._clickGesture.get_coords_abs();
        this._startWindowDrag(event, coords.x, coords.y);
    }

    _onButtonPress(event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        return this._tryDragWindow(event);
    }

    _onTouchEvent(event) {
        if (event.type() !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;

        return this._tryDragWindow(event);
    }

    _tryDragWindow(event) {
        if (Main.modalCount > 0)
            return Clutter.EVENT_PROPAGATE;

        const targetActor = global.stage.get_event_actor(event);
        if (targetActor !== this._panelActor)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        return this._startWindowDrag(event, x, y);
    }

    _startWindowDrag(event, stageX, stageY) {
        if (panelIsVertical(this._settings))
            return Clutter.EVENT_PROPAGATE;

        const dragWindow = this._getDraggableWindowForPosition(stageX);

        if (!dragWindow)
            return Clutter.EVENT_PROPAGATE;

        const positionHint = new Graphene.Point({
            x: stageX,
            y: stageY,
        });
        if (SHELL_VERSION === 48) {
            return dragWindow.begin_grab_op(
                Meta.GrabOp.MOVING,
                event.get_device(),
                event.get_event_sequence(),
                event.get_time(),
                positionHint
            ) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        }

        const backend = global.stage.get_context().get_backend();
        const sprite = backend.get_sprite(global.stage, event);
        return dragWindow.begin_grab_op(
            Meta.GrabOp.MOVING,
            sprite,
            event.get_time(),
            positionHint
        ) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }

    _getDraggableWindowForPosition(stageX) {
        const workspaceManager = global.workspace_manager;
        const windows = workspaceManager.get_active_workspace().list_windows();
        const allWindowsByStacking =
            global.display.sort_windows_by_stacking(windows).reverse();

        return allWindowsByStacking.find(metaWindow => {
            const rect = metaWindow.get_frame_rect();
            return metaWindow.get_monitor() === this._monitor.index &&
                metaWindow.showing_on_its_workspace() &&
                metaWindow.get_window_type() !== Meta.WindowType.DESKTOP &&
                metaWindow.maximized_vertically &&
                stageX > rect.x && stageX < rect.x + rect.width;
        });
    }
}
