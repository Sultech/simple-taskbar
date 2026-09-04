// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {
    APPLICATION_CLICK_ANIMATION,
} from '../shared/applicationClickAnimation.js';

const EFFECT_FRAMES = {
    [APPLICATION_CLICK_ANIMATION.BOUNCE]: [
        {
            scale_x: 0.7,
            scale_y: 0.7,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            scale_x: 1.25,
            scale_y: 1.25,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            scale_x: 0.9,
            scale_y: 0.9,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
        {
            scale_x: 1.05,
            scale_y: 1.05,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.JUMP]: [
        {
            translation_y: -35,
            scale_x: 0.9,
            scale_y: 1.1,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            translation_y: 0,
            scale_x: 1.1,
            scale_y: 0.9,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        },
        {
            translation_y: -15,
            scale_x: 0.95,
            scale_y: 1.05,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            translation_y: 0,
            scale_x: 1,
            scale_y: 1,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.HEARTBEAT]: [
        {
            scale_x: 1.15,
            scale_y: 1.15,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            scale_x: 1,
            scale_y: 1,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        },
        {
            scale_x: 1.15,
            scale_y: 1.15,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            scale_x: 1,
            scale_y: 1,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.SQUISH]: [
        {
            scale_x: 1.5,
            scale_y: 0.4,
            translation_y: 20,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            scale_x: 0.9,
            scale_y: 1.1,
            translation_y: -5,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.JELLY]: [
        {
            scale_x: 1.25,
            scale_y: 0.75,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            scale_x: 0.75,
            scale_y: 1.25,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
        {
            scale_x: 1.15,
            scale_y: 0.85,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.SPIN]: [
        {
            rotation_angle_z: 360,
            scale_x: 1.15,
            scale_y: 1.15,
            duration: 450,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.SPIN_3D]: [
        {
            rotation_angle_y: 180,
            scale_x: 1.15,
            scale_y: 1.15,
            duration: 220,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            rotation_angle_y: 360,
            scale_x: 1,
            scale_y: 1,
            duration: 220,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.FLIP]: [
        {
            scale_x: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        },
        {
            scale_x: 1,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.ROLL]: [
        {
            translation_x: 40,
            rotation_angle_z: 180,
            opacity: 150,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            translation_x: 0,
            rotation_angle_z: 0,
            opacity: 255,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.ZOOM_FADE]: [
        {
            scale_x: 2,
            scale_y: 2,
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.SQUEEZE]: [
        {
            scale_x: 0.8,
            scale_y: 1.25,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            scale_x: 1.1,
            scale_y: 0.9,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.GLOW]: [
        {
            scale_x: 1.15,
            scale_y: 1.15,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.DIM]: [
        {
            opacity: 100,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.TADA]: [
        {
            scale_x: 0.9,
            scale_y: 0.9,
            rotation_angle_z: -3,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            scale_x: 1.1,
            scale_y: 1.1,
            rotation_angle_z: 3,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
        {
            rotation_angle_z: -3,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
        {
            rotation_angle_z: 3,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.SWING]: [
        {
            rotation_angle_z: 25,
            translation_x: 8,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
        {
            rotation_angle_z: -15,
            translation_x: -4,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
        {
            rotation_angle_z: 5,
            translation_x: 2,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        },
        {
            rotation_angle_z: 0,
            translation_x: 0,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.SHAKE]: [
        {
            translation_x: 10,
            duration: 50,
            mode: Clutter.AnimationMode.LINEAR,
        },
        {
            translation_x: -10,
            duration: 50,
            mode: Clutter.AnimationMode.LINEAR,
        },
        {
            translation_x: 10,
            duration: 50,
            mode: Clutter.AnimationMode.LINEAR,
        },
        {
            translation_x: -10,
            duration: 50,
            mode: Clutter.AnimationMode.LINEAR,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.MOVE_UP]: [
        {
            translation_y: -20,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.MOVE_DOWN]: [
        {
            translation_y: 20,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.MOVE_LEFT]: [
        {
            translation_x: -20,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.MOVE_RIGHT]: [
        {
            translation_x: 20,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.ENLARGE]: [
        {
            scale_x: 1.3,
            scale_y: 1.3,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
    [APPLICATION_CLICK_ANIMATION.SHRINK]: [
        {
            scale_x: 0.7,
            scale_y: 0.7,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        },
    ],
};

const GLOW_STYLE =
    'box-shadow: 0px 0px 20px 5px rgba(255, 255, 255, 0.6);' +
    'border-radius: 50%;' +
    'background-color: rgba(255,255,255,0.1);';

function canAnimate(actor) {
    return St.Settings.get().enable_animations &&
        actor.get_stage() && actor.has_allocation();
}

function restore(actor, clearStyle) {
    actor.ease({
        scale_x: 1,
        scale_y: 1,
        opacity: 255,
        translation_x: 0,
        translation_y: 0,
        rotation_angle_z: 0,
        rotation_angle_y: 0,
        duration: 200,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => {
            if (clearStyle)
                actor.set_style(null);
        },
    });
}

function animateFrames(actor, frames, clearStyle) {
    let index = 0;
    const next = () => {
        const frame = frames[index++];
        const {duration, mode, ...properties} = frame;
        actor.ease({
            ...properties,
            duration,
            mode,
            onComplete: index < frames.length
                ? next
                : () => restore(actor, clearStyle),
        });
    };
    next();
}

export function animateTaskbarIconClick(item, effect) {
    const actor = item._taskbarIconClickTarget;
    if (!canAnimate(actor) || effect === APPLICATION_CLICK_ANIMATION.NONE)
        return;

    actor.remove_all_transitions();
    actor.set_pivot_point(0.5, 0.5);
    actor.set_style(null);
    actor.rotation_angle_z = 0;
    actor.rotation_angle_y = 0;
    if (effect === APPLICATION_CLICK_ANIMATION.GLOW)
        actor.set_style(GLOW_STYLE);

    animateFrames(
        actor,
        EFFECT_FRAMES[effect],
        effect === APPLICATION_CLICK_ANIMATION.GLOW
    );
}
