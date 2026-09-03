// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MAGIC_LAMP_DURATION = 480;
const MAGIC_LAMP_TILES = 42;
const MAGIC_LAMP_TAIL_SIZE = 8;
const MAGIC_LAMP_INSET = 0.4;
const MAGIC_LAMP_SWEEP = 0.7;
const MAGIC_LAMP_RIPPLE = 0.2;

export class MagicLampEffect extends Clutter.DeformEffect {
    static {
        GObject.registerClass(this);
    }

    _init(iconGeometry, panelPosition, restore, onDone) {
        super._init();
        this._iconGeometry = {...iconGeometry};
        this._panelPosition = panelPosition;
        this._restore = restore;
        this._onDone = onDone;
        this._progress = restore ? 1 : 0;
        this._timeline = null;
        this._windowGeometry = null;
        this._targetGeometry = null;
    }

    vfunc_set_actor(actor) {
        super.vfunc_set_actor(actor);
        if (!actor || this._timeline)
            return;

        const monitor = Main.layoutManager.monitors[
            actor.meta_window.get_monitor()
        ];
        this._windowGeometry = {
            x: actor.get_x() - monitor.x,
            y: actor.get_y() - monitor.y,
            width: actor.get_width(),
            height: actor.get_height(),
        };
        this._targetGeometry = {
            x: this._iconGeometry.x - monitor.x,
            y: this._iconGeometry.y - monitor.y,
            width: this._iconGeometry.width,
            height: this._iconGeometry.height,
        };
        this._buildTarget();
        this.set_n_tiles(MAGIC_LAMP_TILES, MAGIC_LAMP_TILES);

        const timeline = new Clutter.Timeline({
            actor,
            duration: MAGIC_LAMP_DURATION,
        });
        this._timeline = timeline;
        timeline.connectObject(
            'new-frame', source => {
                if (!this.get_actor()) {
                    this._finish();
                    return;
                }

                const progress = source.get_progress();
                this._progress = this._restore ? 1 - progress : progress;
                const parent = actor.get_parent();
                if (parent)
                    parent.queue_redraw();
                this.invalidate();
            },
            'completed', () => this._finish(),
            this
        );
        actor.connectObject('destroy', () => this._finish(), this);
        timeline.start();
    }

    vfunc_deform_vertex(_width, _height, vertex) {
        if (!this._timeline || this._progress <= 0)
            return;

        const windowGeometry = this._windowGeometry;
        const targetGeometry = this._targetGeometry;
        const targetX = targetGeometry.x + targetGeometry.width / 2 -
            windowGeometry.x;
        const targetY = targetGeometry.y + targetGeometry.height / 2 -
            windowGeometry.y;
        const currentX = vertex.tx * windowGeometry.width;
        const currentY = vertex.ty * windowGeometry.height;
        let distanceFromDock;
        switch (this._panelPosition) {
        case 'bottom':
            distanceFromDock = 1 - vertex.ty;
            break;
        case 'top':
            distanceFromDock = vertex.ty;
            break;
        case 'left':
            distanceFromDock = vertex.tx;
            break;
        default:
            distanceFromDock = 1 - vertex.tx;
            break;
        }

        const localProgress = Math.max(
            0,
            Math.min(
                1,
                (this._progress - distanceFromDock * MAGIC_LAMP_SWEEP) /
                    (1 - MAGIC_LAMP_SWEEP)
            )
        );
        const eased = localProgress * localProgress * (3 - 2 * localProgress);
        let newX = currentX + (targetX - currentX) * eased;
        let newY = currentY + (targetY - currentY) * eased;
        const ripple = Math.sin(eased * Math.PI) *
            (1 - eased) * MAGIC_LAMP_RIPPLE;

        if (this._panelPosition === 'bottom' ||
            this._panelPosition === 'top') {
            newX += (currentX - targetX) * ripple;
        } else {
            newY += (currentY - targetY) * ripple;
        }

        vertex.x = newX;
        vertex.y = newY;
    }

    vfunc_modify_paint_volume(_paintVolume) {
        return false;
    }

    _buildTarget() {
        const target = this._targetGeometry;
        const centerX = target.x + target.width / 2;
        const centerY = target.y + target.height / 2;
        const insetX = target.width * MAGIC_LAMP_INSET;
        const insetY = target.height * MAGIC_LAMP_INSET;

        switch (this._panelPosition) {
        case 'bottom':
            target.x = centerX - MAGIC_LAMP_TAIL_SIZE / 2;
            target.y += insetY;
            target.width = MAGIC_LAMP_TAIL_SIZE;
            target.height = 0;
            break;
        case 'top':
            target.x = centerX - MAGIC_LAMP_TAIL_SIZE / 2;
            target.y += target.height - insetY;
            target.width = MAGIC_LAMP_TAIL_SIZE;
            target.height = 0;
            break;
        case 'left':
            target.x += target.width - insetX;
            target.y = centerY - MAGIC_LAMP_TAIL_SIZE / 2;
            target.width = 0;
            target.height = MAGIC_LAMP_TAIL_SIZE;
            break;
        default:
            target.x += insetX;
            target.y = centerY - MAGIC_LAMP_TAIL_SIZE / 2;
            target.width = 0;
            target.height = MAGIC_LAMP_TAIL_SIZE;
            break;
        }
    }

    _finish() {
        if (!this._timeline)
            return;

        const actor = this.get_actor();
        const onDone = this._onDone;
        this.cancel();

        if (!actor)
            return;

        onDone(actor);
    }

    cancel() {
        if (!this._timeline)
            return;

        const timeline = this._timeline;
        this._timeline = null;
        this._onDone = null;
        timeline.stop();
        timeline.disconnectObject(this);

        const actor = this.get_actor();
        if (!actor)
            return;

        actor.disconnectObject(this);
        actor.remove_effect(this);
    }
}
