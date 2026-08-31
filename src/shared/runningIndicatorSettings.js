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

export const MAX_RUNNING_INDICATORS = 4;

export const RUNNING_INDICATOR_RESERVE = 4;

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
