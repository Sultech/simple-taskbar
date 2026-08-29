// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';

const ITEM_EXIT_DURATION = 120;
const ITEM_ENTER_DURATION = 170;
const FOLDER_ABSORB_DURATION = 140;

function canAnimate(actor) {
    return St.Settings.get().enable_animations && actor.get_stage();
}

export function animateStartMenuItemOut(actor, onStopped) {
    if (!canAnimate(actor)) {
        onStopped();
        return;
    }

    actor.remove_all_transitions();
    actor.set_pivot_point(0.5, 0.5);
    actor.ease({
        scale_x: 0.72,
        scale_y: 0.72,
        opacity: 0,
        duration: ITEM_EXIT_DURATION,
        mode: Clutter.AnimationMode.EASE_IN_QUAD,
        onStopped: finished => {
            if (finished)
                onStopped();
        },
    });
}

export function animateStartMenuItemIn(actor) {
    if (!canAnimate(actor))
        return;

    actor.remove_all_transitions();
    actor.set_pivot_point(0.5, 0.5);
    actor.scale_x = 0.78;
    actor.scale_y = 0.78;
    actor.opacity = 0;
    actor.ease({
        scale_x: 1,
        scale_y: 1,
        opacity: 255,
        duration: ITEM_ENTER_DURATION,
        mode: Clutter.AnimationMode.EASE_OUT_BACK,
    });
}

export function animateStartMenuFolderAbsorb(
    sourceActor,
    targetActor,
    onStopped
) {
    if (!canAnimate(sourceActor) || !canAnimate(targetActor)) {
        onStopped();
        return;
    }

    sourceActor.remove_all_transitions();
    targetActor.remove_all_transitions();
    sourceActor.set_pivot_point(0.5, 0.5);
    targetActor.set_pivot_point(0.5, 0.5);
    targetActor.scale_x = 0.84;
    targetActor.scale_y = 0.84;
    targetActor.ease({
        scale_x: 1.04,
        scale_y: 1.04,
        duration: FOLDER_ABSORB_DURATION,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    });
    sourceActor.ease({
        scale_x: 0.35,
        scale_y: 0.35,
        opacity: 0,
        duration: FOLDER_ABSORB_DURATION,
        mode: Clutter.AnimationMode.EASE_IN_QUAD,
        onStopped: finished => {
            if (finished)
                onStopped();
        },
    });
}

export function animateStartMenuLaunch(actor) {
    if (canAnimate(actor) && actor.has_allocation())
        IconGrid.zoomOutActor(actor);
}
