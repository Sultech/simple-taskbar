// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const AUTO_HIDE_REVEAL_MODE = Object.freeze({
    INSTANT: 'instant',
    DELAY: 'delay',
    PRESSURE: 'pressure',
});

export const AUTO_HIDE_SETTINGS = Object.freeze({
    revealMode: 'panel-autohide-reveal-mode',
    revealFullscreen: 'panel-autohide-reveal-fullscreen',
    revealOverview: 'panel-autohide-reveal-overview',
    revealDelay: 'panel-autohide-reveal-delay',
    pressureThreshold: 'panel-autohide-pressure-threshold',
    hideDelay: 'panel-autohide-hide-delay',
});

export const DOCK_AUTO_HIDE_SETTINGS = Object.freeze({
    revealMode: 'dock-autohide-reveal-mode',
    revealFullscreen: 'dock-autohide-reveal-fullscreen',
    revealOverview: 'dock-autohide-reveal-overview',
    revealDelay: 'dock-autohide-reveal-delay',
    pressureThreshold: 'dock-autohide-pressure-threshold',
    hideDelay: 'dock-autohide-hide-delay',
});

export function autoHideRevealDelay(settings) {
    if (settings.get_string(AUTO_HIDE_SETTINGS.revealMode) !==
        AUTO_HIDE_REVEAL_MODE.DELAY) {
        return 0;
    }

    return settings.get_int(AUTO_HIDE_SETTINGS.revealDelay);
}

export function autoHideRevealsInOverview(settings) {
    return settings.get_boolean(AUTO_HIDE_SETTINGS.revealOverview);
}

export function pressureRevealAtBottom(settings, modeKey, positionKey) {
    return settings.get_string(positionKey) === 'bottom' &&
        settings.get_string(modeKey) === AUTO_HIDE_REVEAL_MODE.PRESSURE;
}

export function autoHideUsesPressure(settings) {
    return settings.get_string(AUTO_HIDE_SETTINGS.revealMode) ===
        AUTO_HIDE_REVEAL_MODE.PRESSURE;
}

export function autoHideHideDelay(settings) {
    return settings.get_int(AUTO_HIDE_SETTINGS.hideDelay);
}
