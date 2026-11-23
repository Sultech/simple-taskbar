// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const PROGRESS_BAR_SETTINGS = Object.freeze({
    followIndicatorColors: 'progress-bar-follow-indicator-colors',
    color: 'progress-bar-color',
    automaticThickness: 'progress-bar-automatic-thickness',
    thickness: 'progress-bar-thickness',
});

export const PROGRESS_BAR_SETTING_KEYS = Object.freeze(
    Object.values(PROGRESS_BAR_SETTINGS)
);

export const NOTIFICATION_BADGE_SETTINGS = Object.freeze({
    size: 'notification-badge-size',
    position: 'notification-badge-position',
});

export const NOTIFICATION_BADGE_SETTING_KEYS = Object.freeze(
    Object.values(NOTIFICATION_BADGE_SETTINGS)
);

export const NOTIFICATION_BADGE_POSITION = Object.freeze({
    TOP_RIGHT: 'top-right',
    TOP_LEFT: 'top-left',
    BOTTOM_RIGHT: 'bottom-right',
    BOTTOM_LEFT: 'bottom-left',
});
