// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const RUNNING_INDICATOR_STYLES = [
    'rounded',
    'dots',
    'squares',
    'dashes',
    'segmented',
    'solid',
    'ciliora',
    'metro',
];

export const RUNNING_INDICATOR_POSITIONS = [
    'top',
    'bottom',
    'left',
    'right',
];

export const RUNNING_INDICATOR_RESERVE_SETTINGS = Object.freeze({
    enabled: 'running-indicator-reserve-enabled',
    symmetrical: 'running-indicator-reserve-symmetrical',
    size: 'running-indicator-reserve-size',
});

export const RUNNING_INDICATOR_RESERVE_SETTING_KEYS = Object.freeze(
    Object.values(RUNNING_INDICATOR_RESERVE_SETTINGS)
);

export const MAX_RUNNING_INDICATORS = 4;

export const RUNNING_INDICATOR_LENGTH_RATIO = 0.55;

export function runningIndicatorIsPill(style) {
    return style === 'rounded';
}

export function runningIndicatorFillsLength(style) {
    return style === 'solid' || style === 'metro' ||
        style === 'segmented' || style === 'ciliora';
}

export function runningIndicatorPositionIsHorizontal(position) {
    return position === 'top' || position === 'bottom';
}

export function runningIndicatorReserveIsPossible(
    panelPosition,
    indicatorPosition
) {
    const panelVertical = panelPosition === 'left' ||
        panelPosition === 'right';
    return panelVertical ===
        runningIndicatorPositionIsHorizontal(indicatorPosition);
}

function runningIndicatorReserveSize(settings) {
    if (settings.get_boolean('windows-xp-theme-enabled') ||
        !settings.get_boolean(RUNNING_INDICATOR_RESERVE_SETTINGS.enabled)) {
        return 0;
    }

    return settings.get_int(RUNNING_INDICATOR_RESERVE_SETTINGS.size);
}

function runningIndicatorOppositeReserve(settings, position, side) {
    const reserve = runningIndicatorReserveSize(settings);
    return position === side ||
        settings.get_boolean(RUNNING_INDICATOR_RESERVE_SETTINGS.symmetrical)
        ? reserve
        : 0;
}

export function runningIndicatorTopReserve(settings, position) {
    if (!runningIndicatorPositionIsHorizontal(position))
        return 0;

    return runningIndicatorOppositeReserve(settings, position, 'top');
}

export function runningIndicatorBottomReserve(settings, position) {
    if (!runningIndicatorPositionIsHorizontal(position))
        return 0;

    return runningIndicatorOppositeReserve(settings, position, 'bottom');
}

export function runningIndicatorLeftReserve(settings, position) {
    if (runningIndicatorPositionIsHorizontal(position))
        return 0;

    return runningIndicatorOppositeReserve(settings, position, 'left');
}

export function runningIndicatorRightReserve(settings, position) {
    if (runningIndicatorPositionIsHorizontal(position))
        return 0;

    return runningIndicatorOppositeReserve(settings, position, 'right');
}

export function runningIndicatorReserveOffset(startReserve, endReserve) {
    const difference = startReserve - endReserve;
    return Math.sign(difference) * Math.round(Math.abs(difference) / 2);
}
