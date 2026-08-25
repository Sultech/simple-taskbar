// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';

export const TaskbarItemContainer = GObject.registerClass(
class TaskbarItemContainer extends Dash.DashItemContainer {
    _init() {
        super._init();
        this._preserveNaturalWidth = false;
        this._vertical = false;
        this.x_expand = false;
        this.y_expand = false;
    }

    setVertical(vertical) {
        if (vertical === this._vertical)
            return;
        this._vertical = vertical;
        this.queue_relayout();
    }

    setPreserveNaturalWidth(preserve) {
        if (preserve === this._preserveNaturalWidth)
            return;

        this._preserveNaturalWidth = preserve;
        this.queue_relayout();
    }

    vfunc_get_preferred_width(forHeight) {
        const [minimumWidth, naturalWidth] =
            super.vfunc_get_preferred_width(forHeight);
        return [
            this._preserveNaturalWidth ? naturalWidth : minimumWidth,
            naturalWidth,
        ];
    }

    vfunc_get_preferred_height(forWidth) {
        const [minimumHeight, naturalHeight] =
            super.vfunc_get_preferred_height(forWidth);
        return [
            this._vertical && this._preserveNaturalWidth
                ? naturalHeight
                : minimumHeight,
            naturalHeight,
        ];
    }

    vfunc_allocate(box) {
        if (this.child === null)
            return;

        this.set_allocation(box);

        const availableWidth = box.x2 - box.x1;
        const availableHeight = box.y2 - box.y1;
        const [, , naturalWidth, naturalHeight] =
            this.child.get_preferred_size();
        const [childScaleX, childScaleY] = this.child.get_scale();
        const childWidth = Math.min(
            naturalWidth * childScaleX,
            availableWidth
        );
        const childHeight = Math.min(
            naturalHeight * childScaleY,
            availableHeight
        );
        const childBox = new Clutter.ActorBox();
        childBox.x1 = (availableWidth - childWidth) / 2;
        childBox.y1 = (availableHeight - childHeight) / 2;
        childBox.x2 = childBox.x1 + childWidth;
        childBox.y2 = childBox.y1 + childHeight;
        this.child.allocate(childBox);
    }
});
