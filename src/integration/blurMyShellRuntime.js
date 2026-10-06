// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    blurMyShellBackgroundOnProximity,
    blurMyShellOverridesDockBackground,
    blurMyShellOverridesPanelBackground,
} from '../shared/blurMyShellUtils.js';

const BLUR_MY_SHELL_ROUNDED_PIPELINE = 'pipeline_default_rounded';
const DOCK_BLUR_TARGET_NAME = 'SimpleTaskbarDock';
const DOCK_PANEL_BLUR_NAME = 'panelBox';
export const DOCK_BOX_NAME = 'simpleTaskbarDockBox';

export function panelBlurIsActive(panel) {
    const panelBlur = getPanelBlur();
    if (!panelBlur || !blurMyShellOverridesPanelBackground())
        return false;

    const actors = panelBlur.actors_list.find(
        actors => actors.widgets.panel === panel
    );
    if (!actors)
        return false;

    return actors.should_override !== false ||
        !blurMyShellBackgroundOnProximity();
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
    if (actors.rounded_pipeline) {
        actors.rounded_pipeline.getRadius = () => radius;
        actors.rounded_pipeline.update();
        return;
    }

    if (typeof pipeline.set_corner_radius === 'function') {
        pipeline.set_corner_radius(radius);
        return;
    }

    if (actors.static_blur) {
        pipeline.effect_overrides = {
            ...pipeline.effect_overrides,
            corner: {radius},
        };
        const pipelineId = radius
            ? BLUR_MY_SHELL_ROUNDED_PIPELINE
            : panelBlur.settings.panel.PIPELINE;
        if (pipeline.pipeline_id !== pipelineId) {
            pipeline.change_pipeline_to(pipelineId);
            return;
        }

        for (const effect of pipeline.effects) {
            if (effect._bms_effect_type === 'corner')
                effect.radius = radius;
        }
        return;
    }

    pipeline.effect.unscaled_corner_radius = radius;
}

export function getPanelBlur() {
    const panelBlur = global.blur_my_shell?._panel_blur;
    return panelBlur?.enabled ? panelBlur : null;
}

export function panelBlurSuitsDock() {
    const panelBlur = global.blur_my_shell?._panel_blur;
    return Boolean(panelBlur) &&
        typeof panelBlur.update_panel_border_radius !== 'function';
}

export function blurMyShellDockMode() {
    if (!global.blur_my_shell)
        return null;
    if (blurMyShellSupportsDock())
        return 'dock';
    return panelBlurSuitsDock() ? 'panel' : 'none';
}

function blurMyShellSupportsDock() {
    return Boolean(global.blur_my_shell?._dash_to_dock_blur) &&
        Boolean(global.blur_my_shell._panel_blur) &&
        !panelBlurSuitsDock();
}

function getDockBlur() {
    const dockBlur = global.blur_my_shell?._dash_to_dock_blur;
    return blurMyShellSupportsDock() && dockBlur.enabled ? dockBlur : null;
}

export function dockBlurStylesDock(settings) {
    return settings.get_boolean('dock-panel-blur-enabled') &&
        Boolean(getDockBlur()) &&
        blurMyShellOverridesDockBackground();
}

export function dockBlurIsActive(panel) {
    return blurMyShellOverridesDockBackground() &&
        dockBlurSurfaces(getDockBlur(), panel).length > 0;
}

export function syncDockBlurTarget(panelBox, panel, enabled) {
    const dockBlur = getDockBlur();
    let name = DOCK_BOX_NAME;
    if (enabled && blurMyShellSupportsDock())
        name = DOCK_BLUR_TARGET_NAME;
    else if (enabled && panelBlurSuitsDock())
        name = DOCK_PANEL_BLUR_NAME;
    if (panelBox.get_name() !== name)
        panelBox.set_name(name);

    if (!dockBlur)
        return;

    if (name === DOCK_BLUR_TARGET_NAME) {
        dockBlur.queue_discovery();
        return;
    }

    for (const surface of dockBlurSurfaces(dockBlur, panel))
        surface.remove_dash_blur();
}

function dockBlurSurfaces(dockBlur, panel) {
    return dockBlur?.dashes.filter(surface => surface.dash === panel) ?? [];
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

export function syncDockBlurGeometry(panel) {
    for (const surface of dockBlurSurfaces(getDockBlur(), panel))
        surface.update_size();
}

export function syncPanelBlurGeometry(panel) {
    const panelBlur = getPanelBlur();
    if (!panelBlur)
        return;

    const actors = panelBlur.actors_list.find(
        actors => actors.widgets.panel === panel
    );
    if (actors)
        panelBlur.update_size(actors);
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

export function removePanelBlurForPanel(panel) {
    const panelBlur = getPanelBlur();
    if (!panelBlur)
        return;

    const actors = panelBlur.actors_list.find(
        actors => actors.widgets.panel === panel
    );
    panelBlur.connections.disconnect_all_for(panel);
    if (actors)
        panelBlur.destroy_blur(actors, false);
}
