// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const CLICK_ACTION = {
    CYCLE_MINIMIZE: 'cycle-windows-minimize',
    CYCLE: 'cycle-windows',
    TOGGLE_SHOW_PREVIEW: 'toggle-show-preview',
    TOGGLE_CYCLE: 'toggle-cycle',
    TOGGLE_SPREAD: 'toggle-spread',
    TOGGLE_WINDOWS: 'toggle-windows',
    RAISE_WINDOWS: 'raise-windows',
    LAUNCH: 'launch-new-instance',
    MINIMIZE: 'minimize-window',
    QUIT: 'quit-applications',
};

export const LEGACY_MIDDLE_CLICK_ACTION = {
    OPEN_NEW_WINDOW: 'open-new-window',
    CLOSE_APPLICATIONS: 'close-applications',
};

export function normalizeLegacyMiddleClickAction(settings) {
    const action = settings.get_string('middle-click-action');
    if (action === LEGACY_MIDDLE_CLICK_ACTION.OPEN_NEW_WINDOW) {
        settings.set_string('middle-click-action', CLICK_ACTION.LAUNCH);
        return CLICK_ACTION.LAUNCH;
    }
    if (action === LEGACY_MIDDLE_CLICK_ACTION.CLOSE_APPLICATIONS) {
        settings.set_string('middle-click-action', CLICK_ACTION.QUIT);
        return CLICK_ACTION.QUIT;
    }

    return action;
}
