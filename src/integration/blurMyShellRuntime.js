// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    blurMyShellOverridesPanelBackground,
} from '../shared/blurMyShellUtils.js';

const BLUR_MY_SHELL_ROUNDED_PIPELINE = 'pipeline_default_rounded';

export function panelBlurIsActive(panel) {
    const panelBlur = getPanelBlur();
    if (!panelBlur || !blurMyShellOverridesPanelBackground())
        return false;

    return panelBlur.actors_list.some(
        actors => actors.widgets.panel === panel
    );
}

export function syncPanelBlurCornerRadius(panel, radius) {
    const panelBlur = getPanelBlur();
    if (!panelBlur)
        return;

    const actors = panelBlur.actors_list.find(
        actors => actors.widgets.panel === panel
    );
    if (!actors)
        return;

    const pipeline = actors.bg_manager._bms_pipeline;
    if (actors.static_blur) {
        const pipelineId = radius
            ? BLUR_MY_SHELL_ROUNDED_PIPELINE
            : panelBlur.settings.panel.PIPELINE;
        if (pipeline.pipeline_id !== pipelineId)
            pipeline.change_pipeline_to(pipelineId);
        return;
    }

    pipeline.effect.unscaled_corner_radius = radius;
}

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
    for (const actors of panelBlur.actors_list) {
        if (panelBlur.queued_updates &&
            !panelBlur.queued_updates.has(actors))
            continue;
        if (!actors.widgets.panel.get_stage())
            continue;
        panelBlur.update_size(actors);
    }
    if (panelBlur.panel_hide_blur_dynamically)
        panelBlur.panel_hide_blur_dynamically();
    else
        panelBlur.show();
    panelBlur.update_visibility();
}

export function resetPanelBlur() {
    const panelBlur = getPanelBlur();
    if (!panelBlur)
        return;

    panelBlur.disable();
    panelBlur.enable();
    panelBlur.hide();
    refreshPanelBlurVisibility(panelBlur);
}

export function hidePanelBlur() {
    getPanelBlur()?.hide();
}

export function hidePanelBlurForPanel(panel) {
    const panelBlur = getPanelBlur();
    if (!panelBlur || !panelBlur.settings.panel.STATIC_BLUR)
        return;

    panelBlur.maybe_blur_panel(panel);
    const actors = panelBlur.actors_list.find(
        actors => actors.widgets.panel === panel
    );
    if (actors)
        actors.widgets.background.hide();
}
