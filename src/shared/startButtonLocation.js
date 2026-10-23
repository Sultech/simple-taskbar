// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {isDefaultPanelWithoutDock} from './panelModeProfiles.js';
import {START_BUTTON_LOCATION_KEY, startButtonInPanel} from './taskbarPanelModes.js';

function startButtonEnabled(settings) {
    return settings.get_boolean('windows-start-menu-enabled') ||
        settings.get_boolean('gnome-start-button-visible');
}

export function startButtonVisible(settings) {
    if (settings.isDock) {
        return startButtonEnabled(settings) &&
            settings.get_string(START_BUTTON_LOCATION_KEY) !== 'panel';
    }
    if (settings.get_boolean('default-gnome-panel'))
        return startButtonEnabled(settings) && startButtonInPanel(settings);
    return startButtonEnabled(settings);
}

export function startMenuAvailable(settings) {
    return settings.get_boolean('windows-start-menu-enabled') &&
        (!isDefaultPanelWithoutDock(settings) || startButtonInPanel(settings));
}
