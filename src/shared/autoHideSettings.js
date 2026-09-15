// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const AUTO_HIDE_REVEAL_MODE = Object.freeze({
    INSTANT: 'instant',
    DELAY: 'delay',
});

export const AUTO_HIDE_SETTINGS = Object.freeze({
    revealMode: 'panel-autohide-reveal-mode',
    revealDelay: 'panel-autohide-reveal-delay',
    hideDelay: 'panel-autohide-hide-delay',
});

export const AUTO_HIDE_SETTING_KEYS = Object.freeze(
    Object.values(AUTO_HIDE_SETTINGS)
);

export function autoHideRevealDelay(settings) {
    if (settings.get_string(AUTO_HIDE_SETTINGS.revealMode) !==
        AUTO_HIDE_REVEAL_MODE.DELAY) {
        return 0;
    }

    return settings.get_int(AUTO_HIDE_SETTINGS.revealDelay);
}

export function autoHideHideDelay(settings) {
    return settings.get_int(AUTO_HIDE_SETTINGS.hideDelay);
}
