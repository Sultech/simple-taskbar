// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

export class StartMenuNavigationController {
    constructor({
        getActors,
        getView,
        setSearchFocusVisible,
    }) {
        this._getActors = getActors;
        this._getView = getView;
        this._setSearchFocusVisible = setSearchFocusVisible;
    }

    handle(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;

        const {searchEntry} = this._getActors();
        const symbol = event.get_key_symbol();
        const actors = this._focusableActors();
        if (actors.length === 0)
            return Clutter.EVENT_PROPAGATE;

        const focus = global.stage.get_key_focus();
        const current = focus
            ? actors.find(actor =>
                actor === focus || actor.contains(focus)
            ) ?? null
            : null;
        let target = null;
        if (symbol === Clutter.KEY_Tab) {
            target = this._nextActor(actors, current, 1);
        } else if (symbol === Clutter.KEY_ISO_Left_Tab) {
            target = this._nextActor(actors, current, -1);
        } else if (symbol === Clutter.KEY_Down) {
            target = this._spatialActor(actors, current, 0, 1);
        } else if (symbol === Clutter.KEY_Up) {
            target = this._spatialActor(actors, current, 0, -1);
        } else if (current !== searchEntry) {
            if (symbol === Clutter.KEY_Left)
                target = this._spatialActor(actors, current, -1, 0);
            else if (symbol === Clutter.KEY_Right)
                target = this._spatialActor(actors, current, 1, 0);
        }

        if (!target)
            return Clutter.EVENT_PROPAGATE;

        target.grab_key_focus();
        if (target === searchEntry)
            this._setSearchFocusVisible(true);
        else if (!searchEntry.get_text())
            this._setSearchFocusVisible(false);
        this._ensureFocusedActorVisible();
        return Clutter.EVENT_STOP;
    }

    enable(actor) {
        actor.connect('key-press-event', (_actor, event) =>
            this.handle(event)
        );
    }

    focusFirstViewControl() {
        const {
            allAppsButton,
            backButton,
            categorySidebar,
            content,
            searchEntry,
        } = this._getActors();
        let target = null;
        if (categorySidebar.visible)
            target = this._focusableActorsIn(categorySidebar)[0] ?? null;
        if (!target)
            target = this._focusableActorsIn(content)[0] ?? null;
        if (!target) {
            target = this._getView() === 'all'
                ? backButton.visible
                    ? backButton
                    : searchEntry
                : allAppsButton;
        }

        target.grab_key_focus();
        this._ensureFocusedActorVisible();
    }

    focusAfterViewChange(pointerActivated) {
        if (!pointerActivated) {
            this.focusFirstViewControl();
            return;
        }

        const {searchEntry} = this._getActors();
        searchEntry.grab_key_focus();
        this._setSearchFocusVisible(false);
    }

    destroy() {
        this._setSearchFocusVisible = null;
        this._getView = null;
        this._getActors = null;
    }

    _focusableActors() {
        return this._focusableActorsIn(this._getActors().root);
    }

    _focusableActorsIn(root) {
        const {searchEntry} = this._getActors();
        const actors = [];
        const collect = actor => {
            const focusable = actor === searchEntry ||
                actor instanceof St.Button;
            if (focusable && actor.can_focus && actor.reactive && actor.mapped)
                actors.push(actor);
            for (const child of actor.get_children())
                collect(child);
        };
        collect(root);
        return actors;
    }

    _nextActor(actors, current, step) {
        const currentIndex = actors.indexOf(current);
        const nextIndex = currentIndex < 0
            ? step > 0 ? 0 : actors.length - 1
            : (currentIndex + step + actors.length) % actors.length;
        return actors[nextIndex];
    }

    _spatialActor(actors, current, horizontal, vertical) {
        if (!current)
            return actors[0];

        const [currentX, currentY] = current.get_transformed_position();
        const [currentWidth, currentHeight] = current.get_transformed_size();
        const centerX = currentX + currentWidth / 2;
        const centerY = currentY + currentHeight / 2;
        let closest = null;
        let closestScore = Number.POSITIVE_INFINITY;
        for (const actor of actors) {
            if (actor === current)
                continue;

            const [actorX, actorY] = actor.get_transformed_position();
            const [actorWidth, actorHeight] = actor.get_transformed_size();
            const deltaX = actorX + actorWidth / 2 - centerX;
            const deltaY = actorY + actorHeight / 2 - centerY;
            const primary = horizontal !== 0
                ? deltaX * horizontal
                : deltaY * vertical;
            if (primary <= 0)
                continue;

            const secondary = horizontal !== 0
                ? Math.abs(deltaY)
                : Math.abs(deltaX);
            const score = primary * 4 + secondary;
            if (score < closestScore) {
                closest = actor;
                closestScore = score;
            }
        }
        return closest;
    }

    _ensureFocusedActorVisible() {
        const {content, scrollView} = this._getActors();
        const focus = global.stage.get_key_focus();
        if (!focus || !content.contains(focus))
            return;

        const [, focusY] = focus.get_transformed_position();
        const [, focusHeight] = focus.get_transformed_size();
        const [, viewY] = scrollView.get_transformed_position();
        const [, viewHeight] = scrollView.get_transformed_size();
        const adjustment = scrollView.vadjustment;
        if (focusY < viewY) {
            adjustment.value -= viewY - focusY;
        } else if (focusY + focusHeight > viewY + viewHeight) {
            adjustment.value +=
                focusY + focusHeight - viewY - viewHeight;
        }
    }
}
