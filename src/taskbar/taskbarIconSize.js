// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

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
