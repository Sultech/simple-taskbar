// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {panelIsVertical} from './panelPosition.js';

const SELF_SIZED_BUTTON_CLASS = 'simple-taskbar-start';

export class PanelVerticalItemsController {
    constructor(settings, boxes, getPanelThickness, getButtonPadding) {
        this._settings = settings;
        this._boxes = boxes;
        this._getPanelThickness = getPanelThickness;
        this._getButtonPadding = getButtonPadding;
        this._states = new Map();
    }

    sync() {
        this._restore();
        if (!panelIsVertical(this._settings))
            return;

        const thickness = this._getPanelThickness();
        const padding = this._getButtonPadding();
        for (const box of this._boxes) {
            for (const root of box.get_children()) {
                for (const actor of this._findPanelButtons(root)) {
                    const state = {
                        actor,
                        xAlign: actor.x_align,
                        clipToAllocation: actor.clip_to_allocation,
                        minWidth: actor.min_width,
                        minWidthSet: actor.min_width_set,
                        naturalWidth: actor.natural_width,
                        naturalWidthSet: actor.natural_width_set,
                        child: actor.get_first_child(),
                        childXAlign: null,
                        childXExpand: null,
                        childYAlign: null,
                        childYExpand: null,
                        destroyId: 0,
                    };
                    state.destroyId = actor.connect('destroy', () => {
                        this._states.delete(actor);
                    });
                    this._states.set(actor, state);
                    actor.min_width = thickness;
                    actor.natural_width = thickness;
                    actor.x_align = Clutter.ActorAlign.CENTER;
                    actor.clip_to_allocation = true;
                    if (state.child &&
                        !actor.has_style_class_name(SELF_SIZED_BUTTON_CLASS)) {
                        state.childXAlign = state.child.x_align;
                        state.childXExpand = state.child.x_expand;
                        state.child.x_align = Clutter.ActorAlign.CENTER;
                        state.child.x_expand = false;
                        if (padding !== null) {
                            state.childYAlign = state.child.y_align;
                            state.childYExpand = state.child.y_expand;
                            state.child.y_align = Clutter.ActorAlign.CENTER;
                            state.child.y_expand = false;
                        }
                    }
                    actor.queue_relayout();
                }
            }
        }
    }

    destroy() {
        this._restore();
        this._settings = null;
        this._boxes = null;
        this._getPanelThickness = null;
        this._getButtonPadding = null;
        this._states = null;
    }

    _restore() {
        for (const state of this._states.values()) {
            state.actor.disconnect(state.destroyId);
            state.actor.min_width = state.minWidth;
            state.actor.natural_width = state.naturalWidth;
            state.actor.min_width_set = state.minWidthSet;
            state.actor.natural_width_set = state.naturalWidthSet;
            if (state.childXAlign !== null) {
                state.child.x_align = state.childXAlign;
                state.child.x_expand = state.childXExpand;
            }
            if (state.childYAlign !== null) {
                state.child.y_align = state.childYAlign;
                state.child.y_expand = state.childYExpand;
            }
            state.actor.x_align = state.xAlign;
            state.actor.clip_to_allocation = state.clipToAllocation;
            state.actor.queue_relayout();
        }
        this._states.clear();
    }

    _findPanelButtons(actor) {
        const buttons = [];
        if (actor instanceof St.Widget &&
            actor.has_style_class_name('panel-button')) {
            buttons.push(actor);
        }

        for (const child of actor.get_children())
            buttons.push(...this._findPanelButtons(child));

        return buttons;
    }
}
