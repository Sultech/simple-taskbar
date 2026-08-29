// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';

export const TASKBAR_REFLOW_ANIMATION_TIME = 160;

export const TaskbarItemContainer = GObject.registerClass(
class TaskbarItemContainer extends Dash.DashItemContainer {
    _init() {
        super._init();
        this._preserveNaturalWidth = false;
        this._snapChildAllocation = false;
        this._vertical = false;
        this._positionAnimationStart = null;
        this.x_expand = false;
        this.y_expand = false;
    }

    preparePositionAnimation() {
        if (!this.has_allocation())
            return;

        const [x, y] = this.get_transformed_position();
        this._positionAnimationStart = {x, y};
    }

    setVertical(vertical) {
        if (vertical === this._vertical)
            return;
        this._vertical = vertical;
        this.queue_relayout();
    }

    setSnapChildAllocation(snap) {
        if (snap === this._snapChildAllocation)
            return;

        this._snapChildAllocation = snap;
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
        const childX = (availableWidth - childWidth) / 2;
        const childY = (availableHeight - childHeight) / 2;
        childBox.x1 = this._snapChildAllocation
            ? Math.round(childX)
            : childX;
        childBox.y1 = this._snapChildAllocation
            ? Math.round(childY)
            : childY;
        childBox.x2 = childBox.x1 + childWidth;
        childBox.y2 = childBox.y1 + childHeight;
        this.child.allocate(childBox);

        if (!this._positionAnimationStart)
            return;

        const start = this._positionAnimationStart;
        this._positionAnimationStart = null;
        this.remove_transition('translation-x');
        this.remove_transition('translation-y');
        this.translation_x = 0;
        this.translation_y = 0;
        const [targetX, targetY] = this.get_transformed_position();
        const translationX = start.x - targetX;
        const translationY = start.y - targetY;
        if (translationX === 0 && translationY === 0)
            return;

        this.translation_x = translationX;
        this.translation_y = translationY;
        this.ease({
            translation_x: 0,
            translation_y: 0,
            duration: TASKBAR_REFLOW_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }
});
