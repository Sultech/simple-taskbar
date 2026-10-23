// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {defaultPanelWindowMaxIconSize} from '../shared/panelSizing.js';

export function panelTaskbarIconSize(settings, configuredIconSize) {
    if (!settings.get_boolean('default-gnome-panel'))
        return configuredIconSize;

    return Math.min(configuredIconSize, defaultPanelWindowMaxIconSize(settings));
}

export function adaptiveTaskbarIconSize({
    settings,
    taskbarController,
    startButtonController,
    availableLength,
    maximumIconSize,
    iconSize,
}) {
    const minimum = Math.min(
        settings.get_int('dock-min-icon-size'),
        maximumIconSize
    );
    return taskbarController.getIconSizeForLength(
        availableLength,
        maximumIconSize,
        minimum,
        startButtonController.actor.visible ? iconSize : null
    );
}

export function applyTaskbarIconSize({
    settings,
    taskbarController,
    startButtonController,
    iconSize,
}) {
    taskbarController.setIconSize(iconSize);
    startButtonController.applyAppearance(
        iconSize,
        settings.get_int('start-button-padding')
    );
}

export function prepareTaskbarIconSizeChange(taskbarController, startButtonController) {
    startButtonController.preparePositionAnimation();
    taskbarController.finishItemShowAnimations();
}
