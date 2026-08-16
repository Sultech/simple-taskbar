// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    blurMyShellDynamicPanelOverride,
} from '../shared/blurMyShellUtils.js';

export function getPanelBlur() {
    const panelBlur = global.blur_my_shell?._panel_blur;
    return panelBlur?.enabled ? panelBlur : null;
}

export function getPopupBlur() {
    const popupBlur = global.blur_my_shell?._popup;
    return popupBlur?.enabled ? popupBlur : null;
}

// panel_hide_blur_dynamically() was added in a later Blur My Shell build.
// Calling it on an older one throws, which skipped update_visibility() and
// left freshly blurred panels invisible until Blur My Shell was toggled.
export function refreshPanelBlurVisibility(panelBlur) {
    panelBlur.panel_hide_blur_dynamically?.();
    if (blurMyShellDynamicPanelOverride()) {
        panelBlur.update_visibility();
        return;
    }

    for (const actors of panelBlur.actors_list)
        panelBlur.set_should_override_panel(actors, true);
}
