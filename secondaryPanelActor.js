// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
    allocateAdaptivePanel,
    allocateExpandedSidePanel,
} from './taskbarLayout.js';

export const SecondaryPanelActor = GObject.registerClass(
class SecondaryPanelActor extends St.Widget {
    _init() {
        super._init({
            name: 'panel',
            style_class:
                'simple-taskbar-panel simple-taskbar-secondary-panel',
            reactive: true,
            clip_to_allocation: true,
        });

        this.leftBox = new St.BoxLayout({
            name: 'panelLeft',
            y_expand: true,
        });
        this.centerBox = new St.BoxLayout({
            name: 'panelCenter',
            y_expand: true,
        });
        this.rightBox = new St.BoxLayout({
            name: 'panelRight',
            y_expand: true,
        });
        this.add_child(this.leftBox);
        this.add_child(this.centerBox);
        this.add_child(this.rightBox);
        this.adaptiveCenter = false;
        this.expandedSide = false;
    }

    vfunc_allocate(box) {
        if (!this.get_stage())
            return;

        if (this.adaptiveCenter) {
            allocateAdaptivePanel(
                this,
                box,
                this.leftBox,
                this.centerBox,
                this.rightBox
            );
            return;
        }
        if (this.expandedSide) {
            allocateExpandedSidePanel(
                this,
                box,
                this.leftBox,
                this.centerBox,
                this.rightBox
            );
            return;
        }

        this.set_allocation(box);

        const width = box.x2 - box.x1;
        const height = box.y2 - box.y1;
        const [, leftNaturalWidth] =
            this.leftBox.get_preferred_width(-1);
        const [, centerNaturalWidth] =
            this.centerBox.get_preferred_width(-1);
        const [, rightNaturalWidth] =
            this.rightBox.get_preferred_width(-1);
        const sideWidth = Math.max(0, (width - centerNaturalWidth) / 2);
        const childBox = new Clutter.ActorBox();
        childBox.y1 = 0;
        childBox.y2 = height;

        if (this.get_text_direction() === Clutter.TextDirection.RTL) {
            childBox.x1 = Math.max(
                width - Math.min(Math.floor(sideWidth), leftNaturalWidth),
                0
            );
            childBox.x2 = width;
        } else {
            childBox.x1 = 0;
            childBox.x2 = Math.min(
                Math.floor(sideWidth),
                leftNaturalWidth
            );
        }
        this.leftBox.allocate(childBox);

        childBox.x1 = Math.ceil(sideWidth);
        childBox.x2 = childBox.x1 + centerNaturalWidth;
        this.centerBox.allocate(childBox);

        if (this.get_text_direction() === Clutter.TextDirection.RTL) {
            childBox.x1 = 0;
            childBox.x2 = Math.min(
                Math.floor(sideWidth),
                rightNaturalWidth
            );
        } else {
            childBox.x1 = Math.max(
                width - Math.min(Math.floor(sideWidth), rightNaturalWidth),
                0
            );
            childBox.x2 = width;
        }
        this.rightBox.allocate(childBox);
    }
});
