// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import {
    ApplicationOverflowController,
} from '../overflow/applicationOverflowController.js';
import {TaskbarViewport} from './taskbarViewport.js';

export function createTaskbarViewport({
    settings,
    taskbarController,
    previewController,
}) {
    const viewport = new TaskbarViewport({
        style_class: 'simple-taskbar-bin',
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.NEVER,
        enable_mouse_scrolling: true,
        clip_to_allocation: true,
        x_expand: false,
        y_expand: true,
    });
    viewport.add_child(taskbarController.actor);
    const overflowController = new ApplicationOverflowController({
        settings,
        taskbarController,
        previewController,
        viewport,
    });
    overflowController.actor.visible =
        !settings.get_boolean('default-gnome-panel');
    return {viewport, overflowController};
}
