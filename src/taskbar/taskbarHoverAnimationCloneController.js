// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {APP_ICON_HOVER_ANIMATION} from '../shared/applicationHoverAnimation.js';
import {
    MAGNIFY_EPSILON,
    MAGNIFY_SMOOTHING,
} from './taskbarHoverAnimationConstants.js';
import {applySmoothedProperties} from './taskbarHoverAnimationUtils.js';

export class TaskbarHoverAnimationCloneController {
    constructor({
        geometry,
        getAnimationType,
        getMonitor,
        getVertical,
        isDragging,
        raiseOverlays,
        onCloneButtonPress,
        onCloneActivate,
        onCloneScroll,
        onCloneCreated,
        onCloneDestroyed,
    }) {
        this._geometry = geometry;
        this._getAnimationType = getAnimationType;
        this._getMonitor = getMonitor;
        this._getVertical = getVertical;
        this._isDragging = isDragging;
        this._raiseOverlays = raiseOverlays;
        this._onCloneButtonPress = onCloneButtonPress;
        this._onCloneActivate = onCloneActivate;
        this._onCloneScroll = onCloneScroll;
        this._onCloneCreated = onCloneCreated;
        this._onCloneDestroyed = onCloneDestroyed;
        this._clones = new Map();
        this._stretchActors = new Map();
        this._hoveredCloneItem = null;
        this._host = new Clutter.Actor({
            name: 'simple-taskbar-hover-animation-clones',
            reactive: false,
        });
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

    get(item) {
        return this._clones.get(item);
    }

    getItems() {
        return this._clones.keys();
    }

    getStretchEntry(item) {
        return this._stretchActors.get(item);
    }

    getStretchItems() {
        return this._stretchActors.keys();
    }

    create(item) {
        const source = this._geometry.getCloneSource(item);
        const geometry = this._geometry.getActorGeometry(source);
        if (!geometry)
            return null;

        const interactive =
            this._getAnimationType() === APP_ICON_HOVER_ANIMATION.MAGNIFY &&
            Boolean(item._taskbarApp);
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
        if (interactive)
            this._connectInput(item, clone);
        const cloneContainer = new St.Bin({
            child: clone,
            width: geometry.width,
            height: geometry.height,
            clip_to_allocation: false,
            reactive: false,
        });
        cloneContainer.set_position(
            geometry.x - (stretchProperty === 'translation_x'
                ? stretchOffset
                : 0),
            geometry.y - (stretchProperty === 'translation_y'
                ? stretchOffset
                : 0)
        );
        stretchActor.bind_property(
            stretchProperty,
            cloneContainer,
            stretchProperty,
            GObject.BindingFlags.SYNC_CREATE
        );
        const sourceOpacity = source.opacity;
        source.opacity = 0;
        this._updateHostClip();
        this._host.add_child(cloneContainer);
        this._raiseOverlays();
        const entry = {
            clone,
            cloneContainer,
            source,
            sourceOpacity,
            stretchActor,
            stretchProperty,
        };
        this._clones.set(item, entry);
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
        const property = this._getVertical()
            ? 'translation_y'
            : 'translation_x';
        let entry = this._stretchActors.get(item);
        if (!entry) {
            const actor = this._getStretchActor(item);
            entry = {
                actor,
                base: actor[property],
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
            return;

        if (this._getAnimationType() === APP_ICON_HOVER_ANIMATION.MAGNIFY) {
            applySmoothedProperties(
                entry.actor,
                {[property]: target},
                MAGNIFY_SMOOTHING,
                MAGNIFY_EPSILON
            );
            return;
        }

        entry.actor.remove_transition(property);
        entry.actor.ease({
            [property]: target,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _getStretchActor(item) {
        return this._getAnimationType() === APP_ICON_HOVER_ANIMATION.MAGNIFY
            ? item._taskbarSlot || item
            : item._taskbarVisual || item;
    }

    resetStretch(item) {
        const entry = this._stretchActors.get(item);
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
        const entry = this._clones.get(item);
        if (!entry)
            return;

        if (this._hoveredCloneItem === item)
            this._setCloneHover(item, false);

        this._onCloneDestroyed(entry.clone);
        entry.clone.remove_all_transitions();
        entry.source.opacity = entry.sourceOpacity;
        entry.cloneContainer.destroy();
        this._clones.delete(item);
    }

    reset() {
        for (const item of [...this._clones.keys()])
            this.remove(item);
        this.resetStretches();
    }

    destroy() {
        this.reset();
        this._host.destroy();
        this._host = null;
        this._getMonitor = null;
        this._clones = null;
        this._stretchActors = null;
        this._hoveredCloneItem = null;
        this._onCloneButtonPress = null;
        this._onCloneActivate = null;
        this._onCloneScroll = null;
        this._onCloneCreated = null;
        this._onCloneDestroyed = null;
        this._raiseOverlays = null;
        this._isDragging = null;
        this._getVertical = null;
        this._getAnimationType = null;
        this._geometry = null;
    }

    _updateHostClip() {
        const monitor = this._getMonitor();
        this._host.set_clip(
            monitor.x,
            monitor.y,
            monitor.width,
            monitor.height
        );
    }

    _connectInput(item, clone) {
        clone.connect(
            'button-press-event',
            (_actor, event) => this._onCloneButtonPress(item, event)
        );
        clone.connect('button-release-event', (_actor, event) => {
            if (event.get_button() !== 1 || this._isDragging())
                return Clutter.EVENT_PROPAGATE;

            this._onCloneActivate(item);
            return Clutter.EVENT_STOP;
        });
        clone.connect('enter-event', () => {
            this._setCloneHover(item, true);
            return Clutter.EVENT_PROPAGATE;
        });
        clone.connect('leave-event', () => {
            this._setCloneHover(item, false);
            return Clutter.EVENT_PROPAGATE;
        });
        clone.connect(
            'scroll-event',
            (_actor, event) => this._onCloneScroll(item, event)
        );
        this._onCloneCreated(item, clone);
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
