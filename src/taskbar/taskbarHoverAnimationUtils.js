// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

export const MAGNIFY_SETTLE_TIME_CONSTANTS = 2;
export const MAGNIFY_MOTION_THROTTLE = 50;
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

export class TaskbarHoverAnimationSmoothing {
    constructor() {
        this._factor = 0;
        this._lastPassTime = 0;
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

        this._factor = 1 - Math.exp(-(now - previous) / 1000 / timeConstant);
    }

    reset() {
        this._factor = 0;
        this._lastPassTime = 0;
    }
}
