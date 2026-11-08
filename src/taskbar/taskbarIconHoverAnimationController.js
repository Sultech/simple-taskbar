// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

import {
    APP_ICON_HOVER_ANIMATION,
    APP_ICON_HOVER_ANIMATION_SETTINGS,
} from '../shared/applicationHoverAnimation.js';
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
import {
    TaskbarHoverAnimationSmoothing,
} from './taskbarHoverAnimationUtils.js';

const MAGNIFY_TIMELINE_DURATION = 1000;

export class TaskbarIconHoverAnimationController {
    constructor({
        settings,
        taskbarActor,
        getLocationActor,
        getStartButton,
        dragController,
        getIconSize,
        getPanelThickness,
        getVertical,
        isDragging,
        isBlocked,
        getMonitor,
        getPositionActor,
        getNeighbourActors,
        getEdgeActor,
        raiseOverlays,
        onReserveChanged,
        onExtentsChanged,
        onCloneButtonPress,
        onCloneActivate,
        onCloneScroll,
    }) {
        this._settings = settings;
        this._taskbarActor = taskbarActor;
        this._getLocationActor = getLocationActor;
        this._getStartButton = getStartButton;
        this._getPositionActor = getPositionActor;
        this._cursorTracker = global.backend.get_cursor_tracker();
        this._trackedItems = new Set();
        this._viewport = null;
        this._positionActor = null;
        this._lastMotionTimestamp = 0;
        this._lastPointerX = null;
        this._lastPointerY = null;
        this._magnifyUpdatePending = false;
        this._cloneGeometryDirty = false;
        this._magnifyTimeline = null;
        this._smoothing = new TaskbarHoverAnimationSmoothing();
        this._settingsController = new TaskbarHoverAnimationSettings({
            settings,
            getIconSize,
        });
        this._geometry = new TaskbarHoverAnimationGeometry({
            taskbarActor,
            getLocationActor,
            getStartButton,
            getStretchEntry: item => this._cloneController.getStretchEntry(item),
            getVertical,
            getAnimationType: () =>
                this._settingsController.getAnimationType(),
            getPanelPosition: () =>
                this._settingsController.getPanelPosition(),
            getMonitor,
        });
        this._cloneController = new TaskbarHoverAnimationCloneController({
            geometry: this._geometry,
            dragController,
            stackAbovePositionActor: Boolean(settings.isDock),
            getAnimationType: () =>
                this._settingsController.getAnimationType(),
            getMonitor,
            getVertical,
            isDragging,
            raiseOverlays,
            onCloneButtonPress,
            onCloneActivate,
            onCloneScroll,
            smoothing: this._smoothing,
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
            getEdgeActor,
            onReserveChanged,
            onExtentsChanged,
            queueMagnifyFrames: () => this._startMagnifyFrames(),
            queueMagnifyUpdate: () => this._requestMagnifyUpdate(),
            smoothing: this._smoothing,
        });
    }

    enable() {
        this._viewport = this._taskbarActor.get_parent();
        this._geometry.setViewport(this._viewport);
        this._viewport.connectObject(
            'motion-event', (_actor, event) => this._onMotionEvent(event),
            'leave-event', actor => this._onLeaveEvent(actor),
            'notify::allocation', () => this._updateCloneGeometry(),
            this
        );
        this._cursorTracker.connectObject(
            'position-invalidated', () => this._onPointerPositionInvalidated(),
            this
        );
        this._viewport.hadjustment.connectObject(
            'notify::value', () => this._updateCloneGeometry(),
            this
        );
        this._viewport.vadjustment.connectObject(
            'notify::value', () => this._updateCloneGeometry(),
            this
        );
        this._positionActor = this._getPositionActor();
        this._geometry.setPositionActor(this._positionActor);
        this._positionActor.connectObject(
            'notify::x', () => this._updateCloneGeometry(),
            'notify::y', () => this._updateCloneGeometry(),
            'notify::translation-x', () => this._updateCloneGeometry(),
            'notify::translation-y', () => this._updateCloneGeometry(),
            'notify::allocation', () => this._updateCloneGeometry(),
            this
        );
        this._taskbarActor.connectObject(
            'child-added', (_actor, child) => this._trackItem(child),
            'child-removed', (_actor, child) => this.removeItem(child),
            'notify::allocation', () => this._queueMagnifyUpdate(),
            this
        );
        const locationActor = this._getLocationActor();
        locationActor.connectObject(
            'child-added', (_actor, child) => this._trackItem(child),
            'child-removed', (_actor, child) => this.removeItem(child),
            this
        );
        for (const actor of [locationActor, this._getStartButton()]) {
            actor.connectObject(
                'motion-event', (_actor, event) => this._onMotionEvent(event),
                'leave-event', target => this._onLeaveEvent(target),
                'notify::allocation', () => this._updateCloneGeometry(),
                'notify::mapped', () => this._updateCloneGeometry(),
                this
            );
        }
        this._settings.connectObject(
            'changed::animate-appicon-hover-animation-type',
            () => this._onAnimationTypeChanged(),
            'changed::panel-position',
            () => this._onAnimationTypeChanged(),
            'changed::combine-app-buttons-mode',
            () => this._onAnimationTypeChanged(),
            'changed::default-gnome-panel',
            () => this._onAnimationTypeChanged(),
            'changed::default-panel-show-running-windows',
            () => this._onAnimationTypeChanged(),
            'changed::hide-app-labels',
            () => this._onAnimationTypeChanged(),
            'changed::application-click-animation',
            () => this._onClickAnimationChanged(),
            this
        );
        for (const key of Object.values(APP_ICON_HOVER_ANIMATION_SETTINGS)) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this._onAnimationSettingsChanged(),
                this
            );
        }

        for (const child of [
            ...this._taskbarActor.get_children(),
            ...locationActor.get_children(),
        ])
            this._trackItem(child);
    }

    disable() {
        this._removeLaterSources();
        this._disconnectSignals();
        this._animator.resetAnimations();
    }

    _disconnectSignals() {
        if (!this._viewport)
            return;

        this._viewport.disconnectObject(this);
        this._cursorTracker.disconnectObject(this);
        this._viewport.hadjustment.disconnectObject(this);
        this._viewport.vadjustment.disconnectObject(this);
        this._positionActor.disconnectObject(this);
        this._taskbarActor.disconnectObject(this);
        this._getLocationActor().disconnectObject(this);
        this._getStartButton().disconnectObject(this);
        this._settings.disconnectObject(this);
        for (const item of this._trackedItems)
            this._disconnectItem(item);
        this._trackedItems.clear();
        this._viewport = null;
    }

    destroy() {
        this._removeLaterSources();
        this._disconnectSignals();
        this._animator.destroy();
        this._animator = null;
        this._cloneController.destroy();
        this._cloneController = null;
        this._settingsController.destroy();
        this._settingsController = null;
        this._geometry.destroy();
        this._geometry = null;
        this._smoothing = null;
        this._trackedItems = null;
        this._cursorTracker = null;
        this._viewport = null;
        this._positionActor = null;
        this._getPositionActor = null;
        this._getStartButton = null;
        this._getLocationActor = null;
        this._taskbarActor = null;
        this._settings = null;
    }

    _removeLaterSources() {
        if (this._magnifyTimeline) {
            this._magnifyTimeline.stop();
            this._magnifyTimeline.disconnectObject(this);
            this._magnifyTimeline = null;
        }
        this._magnifyUpdatePending = false;
        this._cloneGeometryDirty = false;
    }

    getReserve() {
        return this._animator.getReserve();
    }

    getOutwardReserve() {
        return this._animator.getOutwardReserve();
    }

    isPointerInMagnifyBounds() {
        if (!this._animator.isMagnifyActive())
            return false;

        const [pointerX, pointerY] = global.get_pointer();
        return this._geometry.isPointerInMagnifyBounds(
            pointerX,
            pointerY,
            this._animator.getOutwardReserve(),
            this._animator.getVisualExtents()
        );
    }

    syncIconResolution(item) {
        this._geometry.invalidate();
        this._settingsController.syncIconResolution(item);
    }

    dropAnimations() {
        if (!this._viewport)
            return;

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
            'notify::mapped', () => this._updateCloneGeometry(item),
            'notify::allocation', () => this._updateCloneGeometry(item),
            'notify::translation-x', () => this._updateCloneGeometry(item),
            'notify::translation-y', () => this._updateCloneGeometry(item),
            'notify::scale-x', () => this._updateCloneGeometry(item),
            'notify::scale-y', () => this._updateCloneGeometry(item),
            this
        );
        item._taskbarIconContainer.connectObject(
            'notify::allocation', () => this._updateCloneGeometry(item),
            this
        );
        item._taskbarSlot.connectObject(
            'notify::allocation', () => this._updateCloneGeometry(item),
            this
        );
        item._taskbarVisual.connectObject(
            'notify::allocation', () => this._updateCloneGeometry(item),
            'notify::translation-x', () => this._updateCloneGeometry(item),
            'notify::translation-y', () => this._updateCloneGeometry(item),
            'notify::scale-x', () => this._updateCloneGeometry(item),
            'notify::scale-y', () => this._updateCloneGeometry(item),
            this
        );
    }

    removeItem(item) {
        this._queueMagnifyUpdate();
        this._animator.removeItem(item);
        this._cloneController.remove(item);
        this._cloneController.resetStretch(item);
        if (!this._trackedItems.delete(item))
            return;

        this._disconnectItem(item);
    }

    _disconnectItem(item) {
        item.disconnectObject(this);
        item._taskbarIconContainer.disconnectObject(this);
        item._taskbarSlot.disconnectObject(this);
        item._taskbarVisual.disconnectObject(this);
    }

    _queueMagnifyUpdate() {
        this._geometry.invalidate();
        if (!this._animator.isMagnifyActive())
            return;

        this._requestMagnifyUpdate();
    }

    _requestMagnifyUpdate() {
        this._magnifyUpdatePending = true;
        this._startMagnifyFrames();
    }

    _startMagnifyFrames() {
        if (this._magnifyTimeline && this._magnifyTimeline.is_playing())
            return;

        if (this._animator.isMagnifyActive())
            this._animator.resumeSmoothing();
        if (!this._magnifyTimeline) {
            this._magnifyTimeline = new Clutter.Timeline({
                actor: this._viewport,
                duration: MAGNIFY_TIMELINE_DURATION,
                repeat_count: -1,
            });
            this._magnifyTimeline.connectObject('new-frame', () => this._onMagnifyFrame(), this);
        }
        this._magnifyTimeline.start();
    }

    _stopMagnifyFrames() {
        this._magnifyTimeline.stop();
    }

    _onMagnifyFrame() {
        const updatePending = this._magnifyUpdatePending;
        this._magnifyUpdatePending = false;
        if (this._cloneGeometryDirty) {
            this._cloneGeometryDirty = false;
            this._cloneController.updateGeometry();
        }
        if (!updatePending && !this._animator.isMagnifyActive() &&
            !this._cloneController.hasClones() &&
            !this._cloneController.hasUnsettledStretches()) {
            this._stopMagnifyFrames();
            return;
        }

        if (!updatePending && !this._animator.isMagnifyActive()) {
            this._animator.settleMagnify();
            return;
        }

        const [pointerX, pointerY] = global.get_pointer();
        if (!this._geometry.isPointerInMagnifyBounds(
            pointerX,
            pointerY,
            this._animator.getOutwardReserve(),
            this._animator.getVisualExtents()
        )) {
            this._animator.dropAnimations();
            return;
        }
        this._animator.update(pointerX, pointerY);
        if (this._animator.isMagnifySettled() && !this._magnifyUpdatePending && !this._cloneGeometryDirty)
            this._stopMagnifyFrames();
    }

    _onAnimationSettingsChanged() {
        this._magnifyUpdatePending = false;
        this._geometry.invalidate();
        this._settingsController.invalidate();
        this._lastMotionTimestamp = 0;
        this._animator.resetAnimations();
    }

    _onAnimationTypeChanged() {
        this._onAnimationSettingsChanged();
        this._syncIconResolutions();
    }

    _onClickAnimationChanged() {
        this._settingsController.invalidate();
        this._syncIconResolutions();
    }

    _syncIconResolutions() {
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

        if (type === APP_ICON_HOVER_ANIMATION.MAGNIFY) {
            this._requestMagnifyUpdate();
            return Clutter.EVENT_PROPAGATE;
        }

        const profile = this._settingsController.getAnimationProfile(type);
        const throttle = profile.duration / 2;
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

        this._requestMagnifyUpdate();
    }

    _onLeaveEvent(actor) {
        const [stageX, stageY] = global.get_pointer();
        const [success, x, y] = actor.transform_stage_point(stageX, stageY);
        const bounds = actor.get_allocation_box();
        bounds.set_origin(0, 0);
        if (success && !bounds.contains(x, y)) {
            if (this._animator.isMagnifyActive())
                this._onPointerPositionInvalidated();
            else
                this._animator.dropAnimations();
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _updateCloneGeometry(item = null) {
        this._geometry.invalidate();
        if (this._settingsController.getAnimationType() === APP_ICON_HOVER_ANIMATION.MAGNIFY) {
            this._cloneGeometryDirty = true;
            if (this._animator.isMagnifyActive() || this._cloneController.hasClones())
                this._startMagnifyFrames();
            return;
        }
        this._cloneController.updateGeometry(item);
        this._queueMagnifyUpdate();
    }
}
