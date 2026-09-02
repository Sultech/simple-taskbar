// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

import {APP_ICON_HOVER_ANIMATION} from '../shared/applicationHoverAnimation.js';
import {applySmoothedProperties} from './taskbarHoverAnimationUtils.js';
import {
    MAGNIFY_EPSILON,
    MAGNIFY_SMOOTHING,
} from './taskbarHoverAnimationConstants.js';

export class TaskbarHoverAnimationAnimator {
    constructor({
        settings,
        geometry,
        clones,
        getIconSize,
        getPanelThickness,
        getVertical,
        isDragging,
        isBlocked,
        getNeighbourActors,
        onReserveChanged,
        queueMagnifyFrames,
    }) {
        this._settings = settings;
        this._geometry = geometry;
        this._clones = clones;
        this._getIconSize = getIconSize;
        this._getPanelThickness = getPanelThickness;
        this._getVertical = getVertical;
        this._isDragging = isDragging;
        this._isBlocked = isBlocked;
        this._getNeighbourActors = getNeighbourActors;
        this._onReserveChanged = onReserveChanged;
        this._queueMagnifyFrames = queueMagnifyFrames;
        this._magnifyActive = false;
        this._blocked = false;
        this._reserve = 0;
    }

    getReserve() {
        return this._reserve;
    }

    getOutwardReserve() {
        const type = this.getAnimationType();
        if (!type)
            return 0;

        const profile = this.getAnimationProfile(type);
        if (type === APP_ICON_HOVER_ANIMATION.MAGNIFY) {
            if (!this._magnifyActive)
                return 0;

            return Math.ceil(
                this._getPanelThickness() * (profile.zoom - 1 + profile.travel)
            );
        }

        if (!this._clones.hasClones())
            return 0;

        return Math.ceil(
            this._getIconSize() *
                (profile.travel + (profile.zoom - 1) / 2)
        );
    }

    getExpansionDuration() {
        return this.getAnimationProfile(
            APP_ICON_HOVER_ANIMATION.MAGNIFY
        ).expansion;
    }

    getAnimationType() {
        return this._settings.getAnimationType();
    }

    getAnimationProfile(type) {
        return this._settings.getAnimationProfile(type);
    }

    isDragging() {
        return this._isDragging();
    }

    isMagnifyActive() {
        return this._magnifyActive;
    }

    isAnimationBlocked() {
        const blocked = this._isBlocked();
        if (blocked !== this._blocked) {
            this._blocked = blocked;
            if (blocked)
                this.dropAnimations();
        }

        return blocked;
    }

    onItemHoverChanged(item) {
        if (this._isDragging()) {
            this.resetAnimations();
            return;
        }

        if (this.isAnimationBlocked())
            return;

        const type = this.getAnimationType();
        if (!type)
            return;

        if (type === APP_ICON_HOVER_ANIMATION.SIMPLE)
            this._raise(item, item.hover ? 1 : 0);
        else if (item.hover)
            this.update();
    }

    update(pointerX = null, pointerY = null) {
        const type = this.getAnimationType();
        if (!type || this._isDragging() || this.isAnimationBlocked())
            return;

        const profile = this.getAnimationProfile(type);
        const vertical = this._getVertical();
        if (pointerX === null || pointerY === null)
            [pointerX, pointerY] = global.get_pointer();

        const items = this._geometry.getTaskbarItems();
        if (type === APP_ICON_HOVER_ANIMATION.MAGNIFY) {
            this._updateMagnification(items, pointerX, pointerY, profile, vertical);
            return;
        }

        this._clones.resetStretches();
        for (const item of items) {
            const geometry = this._geometry.getActorGeometry(item);
            if (!geometry) {
                this._raise(item, 0);
                continue;
            }

            const centerX = geometry.x + geometry.width / 2;
            const centerY = geometry.y + geometry.height / 2;
            const size = vertical ? geometry.height : geometry.width;
            const difference = vertical
                ? pointerY - centerY
                : pointerX - centerX;
            const distance = Math.abs(difference);
            const maxDistance = profile.extent / 2 * size;
            if (distance <= maxDistance) {
                let level = (maxDistance - distance) / maxDistance;
                level = Math.pow(level, profile.convexity);
                this._raise(item, level, items);
            } else {
                this._raise(item, 0, items);
            }
        }
    }

    dropAnimations() {
        const type = this.getAnimationType();
        if (type === APP_ICON_HOVER_ANIMATION.MAGNIFY) {
            this._setMagnifyActive(false);
            this.settleMagnify();
            this._queueMagnifyFrames();
            return;
        }

        for (const item of [...this._clones.getItems()])
            this._raise(item, 0);

        this._clones.resetStretches();
    }

    resetAnimations() {
        this._clones.reset();
        this._setMagnifyActive(false);
    }

    settleMagnify() {
        const items = this._geometry.getTaskbarItems();
        for (const item of [...this._clones.getItems()])
            this._raise(item, 0, items, 0);
        for (const item of [...this._clones.getStretchItems()])
            this._stretch(item, 0, 0);
    }

    destroy() {
        this.resetAnimations();
        this._queueMagnifyFrames = null;
        this._onReserveChanged = null;
        this._getNeighbourActors = null;
        this._isBlocked = null;
        this._isDragging = null;
        this._getVertical = null;
        this._getPanelThickness = null;
        this._getIconSize = null;
        this._clones = null;
        this._geometry = null;
        this._settings = null;
    }

    _setMagnifyActive(active) {
        if (active === this._magnifyActive)
            return;

        const profile = this.getAnimationProfile(
            APP_ICON_HOVER_ANIMATION.MAGNIFY
        );
        this._magnifyActive = active;
        this._reserve = active
            ? Math.ceil(this._maximumRowGrowth(profile))
            : 0;
        this._onReserveChanged();
    }

    _maximumRowGrowth(profile) {
        const growth = profile.zoom - 1;
        if (growth <= 0)
            return 0;

        const samples = 32;
        let mean = 0;
        for (let index = 0; index < samples; index++) {
            const distance = (index + 0.5) / samples;
            mean += Math.pow(
                (Math.cos(distance * Math.PI) + 1) / 2,
                profile.convexity
            );
        }

        return growth * this._getIconSize() * profile.extent * mean / samples;
    }

    _updateMagnification(items, pointerX, pointerY, profile, vertical) {
        const entries = [];
        for (const item of this._geometry.getRowItems()) {
            const geometry = this._geometry.getRowItemBaseGeometry(
                item,
                trackedItem => this._clones.getStretchEntry(trackedItem)
            );
            if (!geometry)
                continue;

            entries.push({
                item,
                magnifies: Boolean(item._taskbarApp),
                length: vertical ? geometry.height : geometry.width,
                center: vertical
                    ? geometry.y + geometry.height / 2
                    : geometry.x + geometry.width / 2,
            });
        }

        if (!entries.length)
            return;

        const rowItems = new Set(entries.map(entry => entry.item));
        for (const item of [...this._clones.getItems()]) {
            if (!rowItems.has(item))
                this._raise(item, 0, items, 0);
        }

        this._setMagnifyActive(true);
        entries.sort((left, right) => left.center - right.center);

        const radius = this._getIconSize() * profile.extent / 2;
        const cursor = vertical ? pointerY : pointerX;
        for (const entry of entries) {
            const distance = Math.abs(cursor - entry.center);
            entry.level = entry.magnifies && distance < radius
                ? Math.pow(
                    (Math.cos(distance * Math.PI / radius) + 1) / 2,
                    profile.convexity
                )
                : 0;
            entry.growth = entry.length * (profile.zoom - 1) * entry.level;
        }

        entries[0].shifted = entries[0].center;
        for (let index = 1; index < entries.length; index++) {
            const previous = entries[index - 1];
            const current = entries[index];
            current.shifted = previous.shifted +
                (current.center - previous.center) +
                (previous.growth + current.growth) / 2;
        }

        const offset = cursor - this._mapCursorToMagnifiedRow(entries, cursor);
        for (const entry of entries) {
            entry.translation = entry.shifted + offset - entry.center;
            this._raise(entry.item, entry.level, items, entry.translation);
            this._clones.updateGeometry(entry.item);
        }

        const first = entries[0];
        const last = entries[entries.length - 1];
        this._displaceNeighbours({
            before: Math.min(0, first.translation - first.growth / 2),
            after: Math.max(0, last.translation + last.growth / 2),
            rowStart: first.center - first.length / 2,
            rowEnd: last.center + last.length / 2,
            duration: 0,
            vertical,
        });
    }

    _displaceNeighbours({
        before,
        after,
        rowStart,
        rowEnd,
        duration,
        vertical,
    }) {
        for (const actor of this._getNeighbourActors()) {
            const geometry = this._geometry.getActorGeometry(actor);
            if (!geometry)
                continue;

            const center = vertical
                ? geometry.y + geometry.height / 2
                : geometry.x + geometry.width / 2;
            if (center < rowStart)
                this._stretch(actor, before, duration);
            else if (center > rowEnd)
                this._stretch(actor, after, duration);
        }
    }

    _mapCursorToMagnifiedRow(entries, cursor) {
        const first = entries[0];
        if (cursor <= first.center)
            return first.shifted - (first.center - cursor);

        for (let index = 1; index < entries.length; index++) {
            const previous = entries[index - 1];
            const current = entries[index];
            if (cursor > current.center)
                continue;

            const span = current.center - previous.center;
            const progress = span > 0
                ? (cursor - previous.center) / span
                : 0;
            return previous.shifted +
                progress * (current.shifted - previous.shifted);
        }

        const last = entries[entries.length - 1];
        return last.shifted + (cursor - last.center);
    }

    _raise(item, level, items = this._geometry.getTaskbarItems(), rowTranslation = null) {
        const type = this.getAnimationType();
        const profile = this.getAnimationProfile(type);
        if (type === APP_ICON_HOVER_ANIMATION.MAGNIFY) {
            this._stretch(item, rowTranslation ?? 0, 0);
            if (!item._taskbarApp)
                return;
        }

        let entry = this._clones.get(item);
        if (entry)
            entry.clone.remove_all_transitions();
        else if (level > 0 || rowTranslation)
            entry = this._clones.create(item);
        else
            return;

        if (!entry)
            return;

        const vertical = this._getVertical();
        const panelPosition = this._settings.getPanelPosition();
        const translationProperty = vertical
            ? 'translation_x'
            : 'translation_y';
        const translationDirection = panelPosition === 'top' ||
            panelPosition === 'left' ? 1 : -1;
        const magnify = type === APP_ICON_HOVER_ANIMATION.MAGNIFY;
        const [width, height] = entry.clone.get_size();
        const size = vertical ? width : height;
        const translationMax = magnify
            ? size * profile.travel
            : size * (profile.travel + (profile.zoom - 1) / 2);
        const translationEnd = translationMax * level;
        const translationDone = entry.clone[translationProperty];
        const translationTodo = Math.sign(profile.travel) *
            Math.abs(translationEnd - translationDone);
        const rotationDirection = this._rotationDirection(item, items);
        const targets = {
            scale_x: 1 + (profile.zoom - 1) * level,
            scale_y: 1 + (profile.zoom - 1) * level,
            rotation_angle_z: rotationDirection * profile.rotation * level,
            [translationProperty]: translationDirection * translationEnd,
        };
        if (magnify) {
            const settled = applySmoothedProperties(
                entry.clone,
                targets,
                MAGNIFY_SMOOTHING,
                MAGNIFY_EPSILON
            );
            if (settled && level === 0 && !rowTranslation)
                this._clones.remove(item);
            return;
        }

        entry.clone.ease({
            ...targets,
            duration: Math.abs(
                profile.duration * translationTodo / translationMax
            ),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (level === 0 && !rowTranslation &&
                    this._clones.get(item) === entry) {
                    this._clones.remove(item);
                }
            },
        });
    }

    _rotationDirection(item, items) {
        const panelPosition = this._settings.getPanelPosition();
        if (panelPosition === 'left')
            return -1;
        if (panelPosition === 'right')
            return 1;
        if (items.length <= 1)
            return 0;

        const index = items.indexOf(item);
        const center = (items.length - 1) / 2;
        return (index - center) / center;
    }

    _stretch(item, translation, duration) {
        this._clones.stretch(item, translation, duration);
    }
}
