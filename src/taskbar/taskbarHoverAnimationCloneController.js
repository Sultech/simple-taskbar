// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    APP_ICON_HOVER_ANIMATION,
} from '../shared/applicationAnimations.js';
import {
    applySmoothedProperties,
    MAGNIFY_EPSILON,
} from './taskbarHoverAnimationUtils.js';

const HoverAnimationCloneHost = GObject.registerClass(
class HoverAnimationCloneHost extends Clutter.Actor {
    vfunc_pick(pickContext) {
        for (const child of this.get_children())
            child.pick(pickContext);
    }
});

export class TaskbarHoverAnimationCloneController {
    constructor({
        geometry,
        dragController,
        stackAbovePositionActor,
        getAnimationType,
        getMonitor,
        getVertical,
        isDragging,
        raiseOverlays,
        onCloneButtonPress,
        onCloneActivate,
        onCloneScroll,
        smoothing,
    }) {
        this._geometry = geometry;
        this._dragController = dragController;
        this._stackAbovePositionActor = stackAbovePositionActor;
        this._smoothing = smoothing;
        this._getAnimationType = getAnimationType;
        this._getMonitor = getMonitor;
        this._getVertical = getVertical;
        this._isDragging = isDragging;
        this._raiseOverlays = raiseOverlays;
        this._onCloneButtonPress = onCloneButtonPress;
        this._onCloneActivate = onCloneActivate;
        this._onCloneScroll = onCloneScroll;
        this._clones = new Map();
        this._pendingCloneContainers = new Map();
        this._dragEndListener = () => this._releasePendingClones();
        this._dragController.addListener(this._dragEndListener);
        this._stretchActors = new Map();
        this._hoveredCloneItem = null;
        this._host = new HoverAnimationCloneHost({
            name: 'simple-taskbar-hover-animation-clones',
            layout_manager: new Clutter.FixedLayout(),
            reactive: false,
        });
        this._hostGeometry = null;
        this._updateHostClip();
        Main.uiGroup.add_child(this._host);
    }

    hasClones() {
        return this._clones.size > 0;
    }

    hasUnsettledStretches() {
        for (const entry of this._stretchActors.values()) {
            if (entry.actor[entry.property] !== entry.base)
                return true;
        }
        return false;
    }

    isStretchSettled(item) {
        const entry = this._stretchActors.get(item);
        return !entry || entry.actor[entry.property] === entry.base;
    }

    get(item) {
        return this._clones.get(item);
    }

    getIconRect(item, includeHighlight = false) {
        const entry = this._clones.get(item);
        if (!entry)
            return null;

        const icon = this._cloneActorRect(entry, item._taskbarIconContainer ?? entry.source);
        const highlights = includeHighlight
            ? [item._taskbarGlass, item._taskbarClassicHover, item._taskbarClassicFocus]
            : [];
        for (const highlight of highlights) {
            if (!highlight?.mapped)
                continue;

            const rect = this._cloneActorRect(entry, highlight);
            icon.x1 = Math.min(icon.x1, rect.x1);
            icon.y1 = Math.min(icon.y1, rect.y1);
            icon.x2 = Math.max(icon.x2, rect.x2);
            icon.y2 = Math.max(icon.y2, rect.y2);
        }
        return icon;
    }

    _cloneActorRect(entry, actor) {
        const [width, height] = actor.get_size();
        const corners = [[0, 0], [width, height]].map(([x, y]) => {
            let point = new Graphene.Point3D({x, y, z: 0});
            if (actor !== entry.source)
                point = actor.apply_relative_transform_to_point(entry.source, point);
            return entry.clone.apply_transform_to_point(point);
        });
        return {
            x1: Math.min(corners[0].x, corners[1].x),
            y1: Math.min(corners[0].y, corners[1].y),
            x2: Math.max(corners[0].x, corners[1].x),
            y2: Math.max(corners[0].y, corners[1].y),
        };
    }

    getVisualRect(item, includeHighlight) {
        const entry = this._clones.get(item);
        if (!entry)
            return null;

        const icon = this.getIconRect(item, includeHighlight);
        const [x, y] = item.get_transformed_position();
        const [width, height] = item.get_transformed_size();
        const clone = entry.clone.get_transformed_extents();
        if (this._getVertical()) {
            const shift = clone.get_y() + clone.get_height() / 2 - (y + height / 2);
            return {
                x1: Math.min(x, icon.x1),
                y1: y + shift,
                x2: Math.max(x + width, icon.x2),
                y2: y + height + shift,
            };
        }

        const shift = clone.get_x() + clone.get_width() / 2 - (x + width / 2);
        return {
            x1: x + shift,
            y1: Math.min(y, icon.y1),
            x2: x + width + shift,
            y2: Math.max(y + height, icon.y2),
        };
    }

    containsPoint(x, y, padding, isHighlighted) {
        const vertical = this._getVertical();
        const [along, across] = vertical ? [y, x] : [x, y];
        const spans = [];
        for (const [item, entry] of this._clones) {
            const icon = this.getIconRect(item, isHighlighted(item));
            const slot = entry.clone.get_transformed_extents();
            spans.push(vertical
                ? {start: slot.get_y(), end: slot.get_y() + slot.get_height(), low: icon.x1, high: icon.x2}
                : {start: slot.get_x(), end: slot.get_x() + slot.get_width(), low: icon.y1, high: icon.y2});
        }
        spans.sort((left, right) => left.start - right.start);

        const inside = (start, end, low, high) =>
            along >= start - padding && along < end + padding &&
            across >= low - padding && across < high + padding;
        for (let index = 0; index < spans.length; index++) {
            const span = spans[index];
            if (inside(span.start, span.end, span.low, span.high))
                return true;

            const next = spans[index + 1];
            if (!next ||
                next.start - span.end > Math.min(span.end - span.start, next.end - next.start))
                continue;

            if (inside(span.end, next.start, Math.max(span.low, next.low), Math.min(span.high, next.high)))
                return true;
        }
        return false;
    }

    getItems() {
        return this._clones.keys();
    }

    getStretchEntry(item) {
        const entry = this._stretchActors.get(item);
        if (entry && entry.lastMagnifyTranslation !== null &&
            entry.actor[entry.property] !== entry.lastMagnifyTranslation) {
            entry.base = entry.actor[entry.property];
            entry.lastMagnifyTranslation = entry.base;
        }
        return entry;
    }

    getStretchItems() {
        return this._stretchActors.keys();
    }

    create(item) {
        const source = this._geometry.getCloneSource(item);
        const geometry = this._geometry.getActorGeometry(source);
        if (!geometry)
            return null;

        const startButton = this._geometry.isStartButton(item);
        const interactive =
            this._getAnimationType() === APP_ICON_HOVER_ANIMATION.MAGNIFY &&
            (Boolean(item._taskbarApp) || startButton);
        const stretchProperty = this._getVertical()
            ? 'translation_y'
            : 'translation_x';
        const stretchActor = this._getStretchActor(item);
        const stretchOffset = stretchActor[stretchProperty];
        const clone = new Clutter.Clone({
            source,
            width: geometry.width,
            height: geometry.height,
            reactive: interactive,
            pivot_point: this._geometry.getClonePivot(),
        });
        let inputSignalIds = [];
        if (interactive) {
            inputSignalIds = startButton
                ? this._connectForwardedInput(item, clone)
                : this._connectInput(item, clone);
        }
        const cloneContainer = new St.Bin({
            child: clone,
            width: geometry.width,
            height: geometry.height,
            clip_to_allocation: false,
            reactive: false,
        });
        stretchActor.bind_property(
            stretchProperty,
            cloneContainer,
            stretchProperty,
            GObject.BindingFlags.SYNC_CREATE
        );
        const sourceOpacity = source.opacity;
        source.opacity = 0;
        this._updateHostClip();
        if (this._stackAbovePositionActor)
            Main.uiGroup.set_child_above_sibling(this._host, this._geometry.getPositionActor());
        this._host.add_child(cloneContainer);
        this._geometry.positionCloneContainer(
            cloneContainer,
            geometry,
            stretchProperty,
            stretchOffset
        );
        this._raiseOverlays();
        const entry = {
            clone,
            cloneContainer,
            inputSignalIds,
            source,
            sourceOpacity,
            sourceDestroyId: 0,
            stretchActor,
            stretchProperty,
        };
        this._clones.set(item, entry);
        entry.sourceDestroyId = source.connect('destroy', () => {
            entry.sourceDestroyId = 0;
            this._removeClone(item, false);
        });
        return entry;
    }

    updateGeometry(item = null) {
        this._updateHostClip();
        if (item) {
            this._updateGeometryForItem(item);
            return;
        }

        for (const trackedItem of this._clones.keys())
            this._updateGeometryForItem(trackedItem);
    }

    stretch(item, translation, duration) {
        const magnify = this._getAnimationType() === APP_ICON_HOVER_ANIMATION.MAGNIFY;
        const property = this._getVertical()
            ? 'translation_y'
            : 'translation_x';
        let entry = this.getStretchEntry(item);
        if (!entry) {
            const actor = this._getStretchActor(item);
            entry = {
                actor,
                base: actor[property],
                lastMagnifyTranslation: magnify ? actor[property] : null,
                property,
                destroyId: 0,
            };
            entry.destroyId = actor.connect('destroy', () => {
                entry.destroyId = 0;
                this._stretchActors.delete(item);
            });
            this._stretchActors.set(item, entry);
        }

        const target = entry.base + translation;
        if (entry.actor[property] === target)
            return true;

        if (magnify) {
            const settled = applySmoothedProperties(
                entry.actor,
                {[property]: target},
                this._smoothing.getFactor(),
                MAGNIFY_EPSILON
            );
            entry.lastMagnifyTranslation = entry.actor[property];
            return settled;
        }

        entry.actor.remove_transition(property);
        entry.actor.ease({
            [property]: target,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        return true;
    }

    _getStretchActor(item) {
        return this._getAnimationType() === APP_ICON_HOVER_ANIMATION.MAGNIFY
            ? item._taskbarSlot || item
            : item._taskbarVisual || item;
    }

    resetStretch(item) {
        const entry = this.getStretchEntry(item);
        if (!entry)
            return;

        if (entry.destroyId)
            entry.actor.disconnect(entry.destroyId);

        entry.actor.remove_transition(entry.property);
        entry.actor[entry.property] = entry.base;
        this._stretchActors.delete(item);
    }

    resetStretches() {
        for (const item of [...this._stretchActors.keys()])
            this.resetStretch(item);
    }

    remove(item) {
        this._removeClone(item, true);
    }

    _removeClone(item, restoreSource) {
        const entry = this._clones.get(item);
        if (!entry)
            return;

        this._clones.delete(item);
        if (entry.sourceDestroyId)
            entry.source.disconnect(entry.sourceDestroyId);
        for (const id of entry.inputSignalIds)
            entry.clone.disconnect(id);
        if (this._hoveredCloneItem === item) {
            this._hoveredCloneItem = null;
            if (restoreSource)
                item.hover = false;
        }

        entry.clone.remove_all_transitions();
        if (restoreSource)
            entry.source.opacity = entry.sourceOpacity;
        entry.cloneContainer.hide();
        this._pendingCloneContainers.set(entry.clone, entry.cloneContainer);
        this._releasePendingClones();
    }

    _releasePendingClones(releaseActive = false) {
        for (const [clone, container] of this._pendingCloneContainers) {
            if (!this._dragController.releaseCloneDraggable(clone, releaseActive))
                continue;

            this._pendingCloneContainers.delete(clone);
            container.destroy();
        }
    }

    reset() {
        for (const item of [...this._clones.keys()])
            this.remove(item);
        this.resetStretches();
    }

    destroy() {
        this._dragController.removeListener(this._dragEndListener);
        this._dragEndListener = null;
        this.reset();
        this._releasePendingClones(true);
        this._pendingCloneContainers = null;
        this._dragController = null;
        this._host.destroy();
        this._host = null;
        this._hostGeometry = null;
        this._getMonitor = null;
        this._clones = null;
        this._stretchActors = null;
        this._hoveredCloneItem = null;
        this._onCloneButtonPress = null;
        this._onCloneActivate = null;
        this._onCloneScroll = null;
        this._raiseOverlays = null;
        this._isDragging = null;
        this._getVertical = null;
        this._getAnimationType = null;
        this._smoothing = null;
        this._geometry = null;
    }

    _updateHostClip() {
        const monitor = this._getMonitor();
        if (!monitor)
            return;

        const geometry = {
            stageWidth: global.stage.width,
            stageHeight: global.stage.height,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
        };
        if (this._hostGeometry &&
            Object.keys(geometry).every(key =>
                geometry[key] === this._hostGeometry[key])) {
            return;
        }

        this._hostGeometry = geometry;
        this._host.set_size(geometry.stageWidth, geometry.stageHeight);
        this._host.set_clip(
            geometry.x,
            geometry.y,
            geometry.width,
            geometry.height
        );
    }

    _connectInput(item, clone) {
        const signalIds = [];
        signalIds.push(clone.connect('button-press-event', (_actor, event) => {
            const result = this._onCloneButtonPress(item, event);
            if (event.get_button() === Clutter.BUTTON_PRIMARY)
                clone._taskbarPrimaryPressConsumed = result === Clutter.EVENT_STOP;
            return result;
        }));
        signalIds.push(clone.connect('button-release-event', (_actor, event) => {
            if (event.get_button() !== 1 || this._isDragging())
                return Clutter.EVENT_PROPAGATE;

            if (clone._taskbarPrimaryPressConsumed) {
                clone._taskbarPrimaryPressConsumed = false;
                return Clutter.EVENT_STOP;
            }
            this._onCloneActivate(item);
            return Clutter.EVENT_STOP;
        }));
        signalIds.push(clone.connect('enter-event', () => {
            this._setCloneHover(item, true);
            return Clutter.EVENT_PROPAGATE;
        }));
        signalIds.push(clone.connect('leave-event', () => {
            this._setCloneHover(item, false);
            return Clutter.EVENT_PROPAGATE;
        }));
        signalIds.push(clone.connect(
            'scroll-event',
            (_actor, event) => this._onCloneScroll(item, event)
        ));
        this._dragController.makeCloneDraggable(item, clone);
        return signalIds;
    }

    _connectForwardedInput(item, clone) {
        const forward = (_actor, event) => {
            item.event(event, true);
            item.event(event, false);
            return Clutter.EVENT_STOP;
        };
        return [
            clone.connect('button-press-event', forward),
            clone.connect('touch-event', forward),
            clone.connect('enter-event', () => {
                this._setCloneHover(item, true);
                return Clutter.EVENT_PROPAGATE;
            }),
            clone.connect('leave-event', () => {
                this._setCloneHover(item, false);
                return Clutter.EVENT_PROPAGATE;
            }),
        ];
    }

    _setCloneHover(item, hovering) {
        if (hovering)
            this._hoveredCloneItem = item;
        else if (this._hoveredCloneItem === item)
            this._hoveredCloneItem = null;

        item.hover = hovering;
    }

    _updateGeometryForItem(item) {
        const entry = this._clones.get(item);
        if (!entry)
            return;

        this._geometry.updateCloneGeometry(entry);
    }

}
