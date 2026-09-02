// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {
    APP_ICON_HOVER_ANIMATION,
    APP_ICON_HOVER_ANIMATION_SETTINGS,
} from '../shared/applicationHoverAnimation.js';
import {
    MAGNIFY_MOTION_THROTTLE,
} from './taskbarHoverAnimationConstants.js';
import {
    TaskbarHoverAnimationAnimator,
} from './taskbarHoverAnimationAnimator.js';
import {
    TaskbarHoverAnimationCloneController,
} from './taskbarHoverAnimationCloneController.js';
import {
    TaskbarHoverAnimationGeometry,
} from './taskbarHoverAnimationGeometry.js';
import {
    TaskbarHoverAnimationSettings,
} from './taskbarHoverAnimationSettings.js';

export class TaskbarIconHoverAnimationController {
    constructor({
        settings,
        taskbarActor,
        getIconSize,
        getPanelThickness,
        getVertical,
        isDragging,
        isBlocked,
        getMonitor,
        getPositionActor,
        getNeighbourActors,
        raiseOverlays,
        onReserveChanged,
        onCloneButtonPress,
        onCloneActivate,
        onCloneScroll,
        onCloneCreated,
        onCloneDestroyed,
    }) {
        this._settings = settings;
        this._taskbarActor = taskbarActor;
        this._getPositionActor = getPositionActor;
        this._signalHolder = new TransientSignalHolder();
        this._cursorTracker = global.backend.get_cursor_tracker();
        this._trackedItems = new Set();
        this._viewport = null;
        this._positionActor = null;
        this._lastMotionTimestamp = 0;
        this._lastPointerX = null;
        this._lastPointerY = null;
        this._magnifyUpdateId = 0;
        this._magnifyFrameId = 0;
        this._settingsController = new TaskbarHoverAnimationSettings({
            settings,
            getIconSize,
        });
        this._geometry = new TaskbarHoverAnimationGeometry({
            taskbarActor,
            getVertical,
            getAnimationType: () =>
                this._settingsController.getAnimationType(),
            getPanelPosition: () =>
                this._settingsController.getPanelPosition(),
        });
        this._cloneController = new TaskbarHoverAnimationCloneController({
            geometry: this._geometry,
            getAnimationType: () =>
                this._settingsController.getAnimationType(),
            getMonitor,
            getVertical,
            isDragging,
            raiseOverlays,
            onCloneButtonPress,
            onCloneActivate,
            onCloneScroll,
            onCloneCreated,
            onCloneDestroyed,
        });
        this._animator = new TaskbarHoverAnimationAnimator({
            settings: this._settingsController,
            geometry: this._geometry,
            clones: this._cloneController,
            getIconSize,
            getPanelThickness,
            getVertical,
            isDragging,
            isBlocked,
            getNeighbourActors,
            onReserveChanged,
            queueMagnifyFrames: () => this._startMagnifyFrames(),
        });
    }

    enable() {
        this._viewport = this._taskbarActor.get_parent();
        this._geometry.setViewport(this._viewport);
        this._viewport.connectObject(
            'motion-event', (_actor, event) => this._onMotionEvent(event),
            'leave-event', actor => this._onLeaveEvent(actor),
            'notify::allocation', () => this._updateCloneGeometry(),
            this._signalHolder
        );
        this._cursorTracker.connectObject(
            'position-invalidated', () => this._onPointerPositionInvalidated(),
            this._signalHolder
        );
        this._viewport.hadjustment.connectObject(
            'notify::value', () => this._updateCloneGeometry(),
            this._signalHolder
        );
        this._viewport.vadjustment.connectObject(
            'notify::value', () => this._updateCloneGeometry(),
            this._signalHolder
        );
        this._positionActor = this._getPositionActor();
        this._positionActor.connectObject(
            'notify::x', () => this._updateCloneGeometry(),
            'notify::y', () => this._updateCloneGeometry(),
            'notify::translation-x', () => this._updateCloneGeometry(),
            'notify::translation-y', () => this._updateCloneGeometry(),
            this._signalHolder
        );
        this._taskbarActor.connectObject(
            'child-added', (_actor, child) => this._trackItem(child),
            'child-removed', (_actor, child) => this._untrackItem(child),
            'notify::allocation', () => this._queueMagnifyUpdate(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::animate-appicon-hover',
            () => this._onAnimationEnabledChanged(),
            'changed::animate-appicon-hover-animation-type',
            () => this._onAnimationSettingsChanged(),
            'changed::panel-position',
            () => this._settingsController.invalidate(),
            this._signalHolder
        );
        for (const key of Object.values(APP_ICON_HOVER_ANIMATION_SETTINGS)) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this._onAnimationSettingsChanged(),
                this._signalHolder
            );
        }

        for (const child of this._taskbarActor.get_children())
            this._trackItem(child);
    }

    destroy() {
        if (this._magnifyUpdateId) {
            global.compositor.get_laters().remove(this._magnifyUpdateId);
            this._magnifyUpdateId = 0;
        }
        if (this._magnifyFrameId) {
            global.compositor.get_laters().remove(this._magnifyFrameId);
            this._magnifyFrameId = 0;
        }
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._animator.destroy();
        this._animator = null;
        this._cloneController.destroy();
        this._cloneController = null;
        this._settingsController.destroy();
        this._settingsController = null;
        this._geometry.destroy();
        this._geometry = null;
        this._trackedItems.clear();
        this._trackedItems = null;
        this._cursorTracker = null;
        this._viewport = null;
        this._positionActor = null;
        this._getPositionActor = null;
        this._taskbarActor = null;
        this._settings = null;
    }

    getReserve() {
        return this._animator.getReserve();
    }

    getOutwardReserve() {
        return this._animator.getOutwardReserve();
    }

    getExpansionDuration() {
        return this._animator.getExpansionDuration();
    }

    isPointerInMagnifyBounds() {
        if (!this._animator.isMagnifyActive())
            return false;

        const [pointerX, pointerY] = global.get_pointer();
        return this._geometry.isPointerInMagnifyBounds(
            pointerX,
            pointerY,
            this._animator.getOutwardReserve(),
            this._animator.getReserve()
        );
    }

    syncIconResolution(item) {
        this._settingsController.syncIconResolution(item);
    }

    dropAnimations() {
        this._animator.dropAnimations();
    }

    _trackItem(item) {
        this._queueMagnifyUpdate();
        if (!item._taskbarApp || this._trackedItems.has(item))
            return;

        this._trackedItems.add(item);
        this.syncIconResolution(item);
        item.connectObject(
            'notify::hover', () => this._onItemHoverChanged(item),
            'notify::allocation', () => this._updateCloneGeometry(item),
            'notify::translation-x', () => this._updateCloneGeometry(item),
            'notify::translation-y', () => this._updateCloneGeometry(item),
            'notify::scale-x', () => this._updateCloneGeometry(item),
            'notify::scale-y', () => this._updateCloneGeometry(item),
            this._signalHolder
        );
        item._taskbarIconContainer.connectObject(
            'notify::allocation', () => this._updateCloneGeometry(item),
            this._signalHolder
        );
    }

    _untrackItem(item) {
        this._queueMagnifyUpdate();
        this._cloneController.remove(item);
        this._cloneController.resetStretch(item);
        if (!this._trackedItems.delete(item))
            return;

        item.disconnectObject(this._signalHolder);
    }

    _queueMagnifyUpdate() {
        if (this._magnifyUpdateId || this._magnifyFrameId ||
            !this._animator.isMagnifyActive())
            return;

        this._magnifyUpdateId = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW,
            () => {
                this._magnifyUpdateId = 0;
                this._animator.update();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _startMagnifyFrames() {
        if (this._magnifyFrameId)
            return;

        this._magnifyFrameId = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW,
            () => {
                if (!this._animator.isMagnifyActive() &&
                    !this._cloneController.hasClones() &&
                    !this._cloneController.hasUnsettledStretches()) {
                    this._magnifyFrameId = 0;
                    return GLib.SOURCE_REMOVE;
                }

                if (this._animator.isMagnifyActive())
                    this._animator.update();
                else
                    this._animator.settleMagnify();

                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _onAnimationSettingsChanged() {
        this._settingsController.invalidate();
        this._lastMotionTimestamp = 0;
        this._animator.resetAnimations();
    }

    _onAnimationEnabledChanged() {
        this._onAnimationSettingsChanged();
        for (const item of this._trackedItems)
            this.syncIconResolution(item);
    }

    _onItemHoverChanged(item) {
        this._animator.onItemHoverChanged(item);
    }

    _onMotionEvent(event) {
        const type = this._settingsController.getAnimationType();
        if (!type || this._animator.isDragging()) {
            this._animator.resetAnimations();
            return Clutter.EVENT_PROPAGATE;
        }

        if (type === APP_ICON_HOVER_ANIMATION.SIMPLE)
            return Clutter.EVENT_PROPAGATE;

        if (this._animator.isAnimationBlocked())
            return Clutter.EVENT_PROPAGATE;

        const profile = this._settingsController.getAnimationProfile(type);
        const throttle = type === APP_ICON_HOVER_ANIMATION.MAGNIFY
            ? MAGNIFY_MOTION_THROTTLE
            : profile.duration / 2;
        const timestamp = Date.now();
        if (this._lastMotionTimestamp &&
            timestamp - this._lastMotionTimestamp < throttle)
            return Clutter.EVENT_PROPAGATE;

        this._lastMotionTimestamp = timestamp;
        const [pointerX, pointerY] = event.get_coords();
        this._animator.update(pointerX, pointerY);
        return Clutter.EVENT_PROPAGATE;
    }

    _onPointerPositionInvalidated() {
        if (!this._animator.isMagnifyActive())
            return;

        const [pointerX, pointerY] = global.get_pointer();
        if (pointerX === this._lastPointerX && pointerY === this._lastPointerY)
            return;

        this._lastPointerX = pointerX;
        this._lastPointerY = pointerY;
        if (this._animator.isAnimationBlocked())
            return;

        if (!this._geometry.isPointerInMagnifyBounds(
            pointerX,
            pointerY,
            this._animator.getOutwardReserve(),
            this._animator.getReserve()
        )) {
            this._animator.dropAnimations();
            return;
        }

        this._startMagnifyFrames();
    }

    _onLeaveEvent(actor) {
        const [stageX, stageY] = global.get_pointer();
        const [success, x, y] = actor.transform_stage_point(stageX, stageY);
        if (success && !actor.allocation.contains(x, y)) {
            if (this._animator.isMagnifyActive())
                this._onPointerPositionInvalidated();
            else
                this._animator.dropAnimations();
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _updateCloneGeometry(item = null) {
        this._cloneController.updateGeometry(item);
    }
}
