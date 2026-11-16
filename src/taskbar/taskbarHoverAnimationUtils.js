// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

export const MAGNIFY_SETTLE_TIME_CONSTANTS = 2;
export const MAGNIFY_EPSILON = 0.01;

export function getTaskbarHoverAnimationNeighbours(
    taskbarBin,
    startButtonActor,
    taskbarViewport,
    panelBoxes
) {
    const neighbours = [
        ...taskbarBin.get_children(),
        ...startButtonActor.get_children(),
    ].filter(actor => actor !== taskbarViewport && actor.visible);
    for (const box of panelBoxes) {
        for (const child of box.get_children()) {
            if (child.visible && !child.contains(taskbarBin) &&
                !child.contains(startButtonActor)) {
                neighbours.push(child);
            }
        }
    }

    return neighbours;
}

export function applySmoothedProperties(actor, targets, smoothing, epsilon) {
    let settled = true;
    for (const [property, target] of Object.entries(targets)) {
        actor.remove_transition(property);
        const current = actor[property];
        const next = current + (target - current) * smoothing;
        if (Math.abs(target - next) < epsilon) {
            actor[property] = target;
            continue;
        }

        actor[property] = next;
        settled = false;
    }

    return settled;
}

export function smoothstep(value) {
    const clamped = Math.min(Math.max(value, 0), 1);
    return clamped * clamped * (3 - 2 * clamped);
}

const MAXIMUM_PASS_INTERVAL_MS = 50;

export class TaskbarHoverAnimationSmoothing {
    constructor() {
        this._factor = 0;
        this._lastPassTime = 0;
        this._rampElapsed = null;
    }

    getFactor() {
        return this._factor;
    }

    beginPass(settleDuration) {
        const now = GLib.get_monotonic_time();
        const previous = this._lastPassTime;
        this._lastPassTime = now;
        const timeConstant = settleDuration / MAGNIFY_SETTLE_TIME_CONSTANTS;
        if (!previous || timeConstant <= 0) {
            this._factor = previous ? 1 : 0;
            return;
        }

        const elapsed = Math.min((now - previous) / 1000, MAXIMUM_PASS_INTERVAL_MS);
        this._factor = 1 - Math.exp(-elapsed / timeConstant);
        if (this._rampElapsed === null)
            return;

        this._rampElapsed += elapsed;
        const progress = this._rampElapsed / settleDuration;
        if (progress < 1)
            this._factor *= smoothstep(progress);
        else
            this._rampElapsed = null;
    }

    easeIn() {
        this.reset();
        this._rampElapsed = 0;
    }

    isEasingIn() {
        return this._rampElapsed !== null;
    }

    reset() {
        this._factor = 0;
        this._lastPassTime = 0;
    }
}
