// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MAGIC_LAMP_DURATION = 480;
const MAGIC_LAMP_ALONG_TILES = 64;
const MAGIC_LAMP_ACROSS_TILES = 4;
const MAGIC_LAMP_TARGET_RATIO = 0.7;
const MAGIC_LAMP_MIN_TARGET_SIZE = 12;
const MAGIC_LAMP_INSET = 0.4;
const MAGIC_LAMP_BEND_END = 0.4;
const MAGIC_LAMP_SLIDE_START = 0.18;

function clampProgress(progress) {
    return Math.max(0, Math.min(1, progress));
}

export class MagicLampEffect extends Clutter.DeformEffect {
    static {
        GObject.registerClass(this);
    }

    _init(iconGeometry, getIconGeometry, panelPosition, restore, onDone) {
        super._init();
        this._iconGeometry = {...iconGeometry};
        this._getIconGeometry = getIconGeometry;
        this._panelPosition = panelPosition;
        this._restore = restore;
        this._onDone = onDone;
        this._progress = restore ? 1 : 0;
        this._timeline = null;
        this._windowGeometry = null;
        this._targetGeometry = null;
        this._monitor = null;
    }

    vfunc_set_actor(actor) {
        super.vfunc_set_actor(actor);
        if (!actor || this._timeline)
            return;

        const monitor = Main.layoutManager.monitors[
            actor.meta_window.get_monitor()
        ];
        this._monitor = monitor;
        this._windowGeometry = {
            x: actor.get_x() - monitor.x,
            y: actor.get_y() - monitor.y,
            width: actor.get_width(),
            height: actor.get_height(),
        };
        this._syncTarget();
        const vertical = this._panelPosition === 'bottom' || this._panelPosition === 'top';
        this.set_n_tiles(
            vertical ? MAGIC_LAMP_ACROSS_TILES : MAGIC_LAMP_ALONG_TILES,
            vertical ? MAGIC_LAMP_ALONG_TILES : MAGIC_LAMP_ACROSS_TILES
        );

        const timeline = new Clutter.Timeline({
            actor,
            duration: MAGIC_LAMP_DURATION,
        });
        this._timeline = timeline;
        timeline.connectObject(
            'new-frame', source => {
                if (!this.get_actor()) {
                    this.finish();
                    return;
                }

                const progress = source.get_progress();
                this._progress = this._restore ? 1 - progress : progress;
                const iconGeometry = this._getIconGeometry();
                if (iconGeometry) {
                    this._iconGeometry = iconGeometry;
                    this._syncTarget();
                }
                const parent = actor.get_parent();
                if (parent)
                    parent.queue_redraw();
                this.invalidate();
            },
            'completed', () => this.finish(),
            this
        );
        actor.connectObject('destroy', () => this.finish(), this);
        timeline.start();
    }

    vfunc_deform_vertex(width, height, vertex) {
        if (!this._timeline || this._progress <= 0)
            return;

        const windowGeometry = this._windowGeometry;
        const targetGeometry = this._targetGeometry;
        const scaleX = windowGeometry.width > 0
            ? width / windowGeometry.width
            : 1;
        const scaleY = windowGeometry.height > 0
            ? height / windowGeometry.height
            : 1;
        const targetX = (targetGeometry.x + targetGeometry.width / 2 -
            windowGeometry.x) * scaleX;
        const targetY = (targetGeometry.y + targetGeometry.height / 2 -
            windowGeometry.y) * scaleY;
        const vertical = this._panelPosition === 'bottom' || this._panelPosition === 'top';
        const towardEnd = this._panelPosition === 'bottom' || this._panelPosition === 'right';
        const length = vertical ? height : width;
        const span = vertical ? width : height;
        const targetAlong = vertical ? targetY : targetX;
        const targetAcross = vertical ? targetX : targetY;
        const alongScale = vertical ? scaleY : scaleX;
        const reach = Math.max(alongScale, towardEnd ? targetAlong : length - targetAlong);
        const halfTarget = vertical
            ? targetGeometry.width * scaleX / 2
            : targetGeometry.height * scaleY / 2;
        const alongFraction = vertical ? vertex.ty : vertex.tx;
        const acrossFraction = vertical ? vertex.tx : vertex.ty;
        const bendProgress = clampProgress(this._progress / MAGIC_LAMP_BEND_END);
        const bend = (1 - Math.cos(Math.PI * bendProgress)) / 2;
        const slideProgress = clampProgress(
            (this._progress - MAGIC_LAMP_SLIDE_START) / (1 - MAGIC_LAMP_SLIDE_START)
        );
        const slide = slideProgress < 0.5
            ? 4 * slideProgress ** 3
            : 1 - (-2 * slideProgress + 2) ** 3 / 2;
        const distance = (towardEnd ? alongFraction : 1 - alongFraction) * length;
        const along = Math.min(reach, distance + slide * reach);
        const funnelPosition = clampProgress(along / reach);
        const pinch = bend * funnelPosition * funnelPosition * (3 - 2 * funnelPosition);
        const low = (targetAcross - halfTarget) * pinch;
        const high = span + (targetAcross + halfTarget - span) * pinch;
        const across = low + acrossFraction * (high - low);
        const alongPosition = towardEnd ? along : length - along;

        vertex.x = vertical ? across : alongPosition;
        vertex.y = vertical ? alongPosition : across;
    }

    vfunc_modify_paint_volume(_paintVolume) {
        return false;
    }

    _syncTarget() {
        this._targetGeometry = {
            x: this._iconGeometry.x - this._monitor.x,
            y: this._iconGeometry.y - this._monitor.y,
            width: this._iconGeometry.width,
            height: this._iconGeometry.height,
        };
        this._buildTarget();
    }

    _buildTarget() {
        const target = this._targetGeometry;
        const centerX = target.x + target.width / 2;
        const centerY = target.y + target.height / 2;
        const insetX = target.width * MAGIC_LAMP_INSET;
        const insetY = target.height * MAGIC_LAMP_INSET;
        const targetWidth = Math.max(MAGIC_LAMP_MIN_TARGET_SIZE, target.width * MAGIC_LAMP_TARGET_RATIO);
        const targetHeight = Math.max(MAGIC_LAMP_MIN_TARGET_SIZE, target.height * MAGIC_LAMP_TARGET_RATIO);

        switch (this._panelPosition) {
        case 'bottom':
            target.x = centerX - targetWidth / 2;
            target.y += insetY;
            target.width = targetWidth;
            target.height = 0;
            break;
        case 'top':
            target.x = centerX - targetWidth / 2;
            target.y += target.height - insetY;
            target.width = targetWidth;
            target.height = 0;
            break;
        case 'left':
            target.x += target.width - insetX;
            target.y = centerY - targetHeight / 2;
            target.width = 0;
            target.height = targetHeight;
            break;
        default:
            target.x += insetX;
            target.y = centerY - targetHeight / 2;
            target.width = 0;
            target.height = targetHeight;
            break;
        }
    }

    finish() {
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
        this._getIconGeometry = null;
        timeline.stop();
        timeline.disconnectObject(this);

        const actor = this.get_actor();
        if (!actor)
            return;

        actor.disconnectObject(this);
        actor.remove_effect(this);
    }
}
