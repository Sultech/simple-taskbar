// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    blurMyShellPanelStyleIsTransparent,
} from '../shared/blurMyShellUtils.js';

export const BLUR_MY_SHELL_ACTIVE_CLASS =
    'simple-taskbar-blur-my-shell-active';
export const BLUR_TRANSPARENT_CLASS =
    'simple-taskbar-blur-transparent';
export const BLUR_TINTED_CLASS =
    'simple-taskbar-blur-tinted';
export const LIGHT_BLUR_OVERLAY_CLASS =
    'simple-taskbar-light-blur-overlay';

export const PANEL_BLUR_CLASSES = [
    BLUR_MY_SHELL_ACTIVE_CLASS,
    BLUR_TRANSPARENT_CLASS,
    BLUR_TINTED_CLASS,
    LIGHT_BLUR_OVERLAY_CLASS,
];

function setStyleClass(actor, styleClass, present) {
    if (present === actor.has_style_class_name(styleClass))
        return;

    if (present)
        actor.add_style_class_name(styleClass);
    else
        actor.remove_style_class_name(styleClass);
}

export function syncPanelBlurClasses(panel, active, light) {
    const transparent = active && blurMyShellPanelStyleIsTransparent();
    setStyleClass(panel, BLUR_MY_SHELL_ACTIVE_CLASS, active);
    setStyleClass(panel, BLUR_TRANSPARENT_CLASS, transparent);
    setStyleClass(panel, BLUR_TINTED_CLASS, active && !transparent);
    setStyleClass(panel, LIGHT_BLUR_OVERLAY_CLASS, active && light);
}
