// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Graphene from 'gi://Graphene';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {APP_ICON_HOVER_ANIMATION} from '../shared/applicationHoverAnimation.js';

const FLUSH_EDGE_TOLERANCE = 0.5;

export class TaskbarHoverAnimationGeometry {
    constructor({
        taskbarActor,
        getLocationActor,
        getStartButton,
        getStretchEntry,
        getVertical,
        getAnimationType,
        getPanelPosition,
        getMonitor,
    }) {
        this._taskbarActor = taskbarActor;
        this._getLocationActor = getLocationActor;
        this._getStartButton = getStartButton;
        this._getStretchEntry = getStretchEntry;
        this._getVertical = getVertical;
        this._getAnimationType = getAnimationType;
        this._getPanelPosition = getPanelPosition;
        this._getMonitor = getMonitor;
        this._viewport = null;
        this._positionActor = null;
        this._startButtonInRow = true;
    }

    setViewport(viewport) {
        this._viewport = viewport;
    }

    setPositionActor(positionActor) {
        this._positionActor = positionActor;
    }

    getPositionActor() {
        return this._positionActor;
    }

    getMagnifyBounds() {
        const geometry = this.getActorGeometry(this._positionActor);
        if (!geometry)
            return null;

        const vertical = this._getVertical();
        return this._excludeReservedSpace(this._axisSpan(geometry, vertical), vertical);
    }

    getFlushEdges() {
        const geometry = this.getActorGeometry(this._positionActor);
        if (!geometry)
            return {start: null, end: null};

        const vertical = this._getVertical();
        const bar = this._axisSpan(geometry, vertical);
        const monitorSpan = this._axisSpan(this._getMonitor(), vertical);
        const workSpan = this._workAreaSpan(vertical);
        const flush = (edge, ...limits) =>
            limits.some(limit => Math.abs(edge - limit) <= FLUSH_EDGE_TOLERANCE);
        return {
            start: flush(bar.start, workSpan.start, monitorSpan.start) ? bar.start : null,
            end: flush(bar.end, workSpan.end, monitorSpan.end) ? bar.end : null,
        };
    }

    getTaskbarItems() {
        const span = this._visibleSpan();
        return [
            ...this._taskbarActor.get_children().filter(item =>
                item._taskbarApp && !item.animatingOut &&
                this._isItemInViewport(item, span)
            ),
            ...this._externalRowItems().filter(item => item._taskbarApp),
        ];
    }

    getRowItems(getStretchEntry) {
        const span = this._visibleSpan();
        return [
            ...this._taskbarActor.get_children().filter(item =>
                !item.animatingOut &&
                this._isRowItemInViewport(item, span, getStretchEntry)
            ),
            ...this._externalRowItems(),
        ];
    }

    isStartButton(item) {
        return item === this._getStartButton();
    }

    setStartButtonInRow(inRow) {
        this._startButtonInRow = inRow;
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

    isPointerInMagnifyBounds(pointerX, pointerY, outward, extents) {
        const geometry = this._magnifyArea();
        if (!geometry)
            return false;

        const panelPosition = this._getPanelPosition();
        let {x, y, width, height} = geometry;
        if (this._getVertical()) {
            if (panelPosition === 'right')
                x -= outward;
            width += outward;
            y += extents.before;
            height += extents.after - extents.before;
        } else {
            if (panelPosition === 'bottom')
                y -= outward;
            height += outward;
            x += extents.before;
            width += extents.after - extents.before;
        }

        const monitor = this._getMonitor();
        switch (panelPosition) {
        case 'top':
            height += y - monitor.y;
            y = monitor.y;
            break;
        case 'bottom':
            height = monitor.y + monitor.height - y;
            break;
        case 'left':
            width += x - monitor.x;
            x = monitor.x;
            break;
        default:
            width = monitor.x + monitor.width - x;
            break;
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
        if (!actor.get_stage())
            return null;

        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        if (![x, y, width, height].every(Number.isFinite) ||
            width <= 0 || height <= 0) {
            return null;
        }

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
        this._getStretchEntry = null;
        this._getStartButton = null;
        this._getLocationActor = null;
        this._positionActor = null;
        this._getMonitor = null;
        this._viewport = null;
        this._getPanelPosition = null;
        this._getAnimationType = null;
        this._getVertical = null;
        this._taskbarActor = null;
    }

    _externalRowItems() {
        return [
            ...this._getLocationActor().get_children(),
            this._getStartButton(),
        ].filter(item => !item.animatingOut && item.mapped);
    }

    _magnifyArea() {
        const areas = [this._viewport, ...this._externalRowItems()]
            .filter(actor => this._startButtonInRow || !this.isStartButton(actor))
            .map(actor => this._restingGeometry(actor, this._getStretchEntry))
            .filter(geometry => geometry);
        if (!areas.length)
            return null;

        const x = Math.min(...areas.map(area => area.x));
        const y = Math.min(...areas.map(area => area.y));
        return {
            x,
            y,
            width: Math.max(...areas.map(area => area.x + area.width)) - x,
            height: Math.max(...areas.map(area => area.y + area.height)) - y,
        };
    }

    _excludeReservedSpace(bounds, vertical) {
        const monitor = this._getMonitor();
        if (bounds.end - bounds.start >=
            (vertical ? monitor.height : monitor.width)) {
            return bounds;
        }

        const workSpan = this._workAreaSpan(vertical);
        return {
            start: Math.max(bounds.start, workSpan.start),
            end: Math.min(bounds.end, workSpan.end),
        };
    }

    _workAreaSpan(vertical) {
        return this._axisSpan(
            Main.layoutManager.getWorkAreaForMonitor(this._getMonitor().index),
            vertical
        );
    }

    _axisSpan(rect, vertical) {
        return vertical
            ? {start: rect.y, end: rect.y + rect.height}
            : {start: rect.x, end: rect.x + rect.width};
    }

    _visibleSpan() {
        const geometry = this.getActorGeometry(this._viewport);
        if (!geometry)
            return null;

        return this._axisSpan(geometry, this._getVertical());
    }

    _isItemInViewport(item, span) {
        const geometry = this.getActorGeometry(item);
        return this._isGeometryInViewport(geometry, span);
    }

    _isRowItemInViewport(item, span, getStretchEntry) {
        return this._isGeometryInViewport(
            this._restingGeometry(item, getStretchEntry),
            span
        );
    }

    _restingGeometry(item, getStretchEntry) {
        const geometry = this.getActorGeometry(item);
        if (!geometry)
            return null;

        const entry = getStretchEntry(item);
        if (entry && entry.actor === item) {
            const offset = entry.actor[entry.property] - entry.base;
            if (entry.property === 'translation_x')
                geometry.x -= offset;
            else
                geometry.y -= offset;
        }

        return geometry;
    }

    _isGeometryInViewport(geometry, span) {
        if (!geometry || !span)
            return false;

        const start = this._getVertical() ? geometry.y : geometry.x;
        const length = this._getVertical() ? geometry.height : geometry.width;
        return start + length > span.start && start < span.end;
    }
}
