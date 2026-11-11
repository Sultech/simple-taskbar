// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

export class PanelHoverRepair {
    constructor(panelActor) {
        this._panelActor = panelActor;
        this._cursorTracker = global.backend.get_cursor_tracker();
        this._suspect = null;
    }

    enable() {
        global.stage.connectObject('captured-event', (_stage, event) => {
            if (event.type() === Clutter.EventType.ENTER)
                this._trackSuspect(global.stage.get_event_actor(event));
            return Clutter.EVENT_PROPAGATE;
        }, this);
    }

    destroy() {
        global.stage.disconnectObject(this);
        this._cursorTracker.disconnectObject(this);
        if (this._suspect)
            this._suspect.disconnectObject(this);
        this._suspect = null;
        this._cursorTracker = null;
        this._panelActor = null;
    }

    _trackSuspect(actor) {
        let widget = actor;
        while (widget && widget !== this._panelActor && !(widget instanceof St.Widget && widget.track_hover))
            widget = widget.get_parent();
        if (!widget || widget === this._panelActor || widget === this._suspect || !this._panelActor.contains(widget))
            return;

        this._releaseSuspect();
        this._suspect = widget;
        widget.connectObject('destroy', () => this._releaseSuspect(), this);
        this._cursorTracker.connectObject('position-invalidated', () => this._checkSuspect(), this);
    }

    _checkSuspect() {
        if (!this._suspect.hover) {
            this._releaseSuspect();
            return;
        }

        const [x, y] = global.get_pointer();
        const pointerActor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        if (this._suspect.contains(pointerActor))
            return;

        for (let widget = this._suspect; widget && widget !== this._panelActor; widget = widget.get_parent()) {
            if (widget instanceof St.Widget && widget.track_hover && widget.hover && !widget.contains(pointerActor))
                widget.hover = false;
        }
        this._releaseSuspect();
    }

    _releaseSuspect() {
        if (!this._suspect)
            return;

        this._cursorTracker.disconnectObject(this);
        this._suspect.disconnectObject(this);
        this._suspect = null;
    }
}
