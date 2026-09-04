// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Graphene from 'gi://Graphene';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {APP_ICON_HOVER_ANIMATION} from '../shared/applicationHoverAnimation.js';

export class TaskbarHoverAnimationGeometry {
    constructor({
        taskbarActor,
        getVertical,
        getAnimationType,
        getPanelPosition,
        getMonitor,
    }) {
        this._taskbarActor = taskbarActor;
        this._getVertical = getVertical;
        this._getAnimationType = getAnimationType;
        this._getPanelPosition = getPanelPosition;
        this._getMonitor = getMonitor;
        this._viewport = null;
        this._positionActor = null;
    }

    setViewport(viewport) {
        this._viewport = viewport;
    }

    setPositionActor(positionActor) {
        this._positionActor = positionActor;
    }

    getMagnifyBounds() {
        const geometry = this.getActorGeometry(this._positionActor);
        if (!geometry)
            return null;

        const vertical = this._getVertical();
        const bounds = vertical
            ? {start: geometry.y, end: geometry.y + geometry.height}
            : {start: geometry.x, end: geometry.x + geometry.width};
        return this._excludeReservedSpace(bounds, vertical);
    }

    getTaskbarItems() {
        const span = this._visibleSpan();
        return this._taskbarActor.get_children().filter(item =>
            item._taskbarApp && !item.animatingOut &&
            this._isItemInViewport(item, span)
        );
    }

    getRowItems() {
        const span = this._visibleSpan();
        return this._taskbarActor.get_children().filter(item =>
            !item.animatingOut && this._isItemInViewport(item, span)
        );
    }

    getRowItemBaseGeometry(item, getStretchEntry) {
        const actor = this._getAnimationType() ===
            APP_ICON_HOVER_ANIMATION.MAGNIFY
            ? item._taskbarVisual || item
            : this.getCloneSource(item);
        const geometry = this.getActorGeometry(actor);
        if (!geometry)
            return null;

        const entry = getStretchEntry(item);
        if (!entry)
            return geometry;

        const offset = entry.actor[entry.property] - entry.base;
        if (entry.property === 'translation_x')
            geometry.x -= offset;
        else
            geometry.y -= offset;

        return geometry;
    }

    isPointerInMagnifyBounds(pointerX, pointerY, outward, reserve) {
        const geometry = this.getActorGeometry(this._viewport);
        if (!geometry)
            return false;

        const along = reserve / 2;
        const panelPosition = this._getPanelPosition();
        let {x, y, width, height} = geometry;
        if (this._getVertical()) {
            if (panelPosition === 'right')
                x -= outward;
            width += outward;
            y -= along;
            height += along * 2;
        } else {
            if (panelPosition === 'bottom')
                y -= outward;
            height += outward;
            x -= along;
            width += along * 2;
        }

        return pointerX >= x && pointerX < x + width &&
            pointerY >= y && pointerY < y + height;
    }

    getCloneSource(item) {
        if (this._getAnimationType() === APP_ICON_HOVER_ANIMATION.MAGNIFY)
            return item._taskbarSlot || item;

        return item._taskbarIconContainer;
    }

    getClonePivot() {
        if (this._getAnimationType() !== APP_ICON_HOVER_ANIMATION.MAGNIFY)
            return new Graphene.Point({x: 0.5, y: 0.5});

        switch (this._getPanelPosition()) {
        case 'top':
            return new Graphene.Point({x: 0.5, y: 0});
        case 'bottom':
            return new Graphene.Point({x: 0.5, y: 1});
        case 'left':
            return new Graphene.Point({x: 0, y: 0.5});
        default:
            return new Graphene.Point({x: 1, y: 0.5});
        }
    }

    getActorGeometry(actor) {
        if (!actor.get_stage() || !actor.has_allocation())
            return null;

        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        if (width <= 0 || height <= 0)
            return null;

        return {x, y, width, height};
    }

    positionCloneContainer(
        cloneContainer,
        geometry,
        stretchProperty,
        stretchOffset
    ) {
        cloneContainer.set_position(
            geometry.x - (stretchProperty === 'translation_x'
                ? stretchOffset
                : 0),
            geometry.y - (stretchProperty === 'translation_y'
                ? stretchOffset
                : 0)
        );
        cloneContainer.allocate_preferred_size(
            ...cloneContainer.get_position()
        );
    }

    updateCloneGeometry(entry) {
        const geometry = this.getActorGeometry(entry.source);
        if (!geometry)
            return;

        const stretchOffset = entry.stretchActor
            ? entry.stretchActor[entry.stretchProperty]
            : 0;
        entry.cloneContainer.set_size(geometry.width, geometry.height);
        entry.clone.set_size(geometry.width, geometry.height);
        this.positionCloneContainer(
            entry.cloneContainer,
            geometry,
            entry.stretchProperty,
            stretchOffset
        );
    }

    destroy() {
        this._positionActor = null;
        this._getMonitor = null;
        this._viewport = null;
        this._getPanelPosition = null;
        this._getAnimationType = null;
        this._getVertical = null;
        this._taskbarActor = null;
    }

    _excludeReservedSpace(bounds, vertical) {
        const monitor = this._getMonitor();
        if (bounds.end - bounds.start >=
            (vertical ? monitor.height : monitor.width)) {
            return bounds;
        }

        const workArea = Main.layoutManager.getWorkAreaForMonitor(
            monitor.index
        );
        const workStart = vertical ? workArea.y : workArea.x;
        const workEnd = workStart +
            (vertical ? workArea.height : workArea.width);
        return {
            start: Math.max(bounds.start, workStart),
            end: Math.min(bounds.end, workEnd),
        };
    }

    _visibleSpan() {
        const geometry = this.getActorGeometry(this._viewport);
        if (!geometry)
            return null;

        return this._getVertical()
            ? {start: geometry.y, end: geometry.y + geometry.height}
            : {start: geometry.x, end: geometry.x + geometry.width};
    }

    _isItemInViewport(item, span) {
        if (!span)
            return false;

        const geometry = this.getActorGeometry(item);
        if (!geometry)
            return false;

        const start = this._getVertical() ? geometry.y : geometry.x;
        const length = this._getVertical() ? geometry.height : geometry.width;
        return start + length > span.start && start < span.end;
    }
}
