// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {panelIsVertical} from './panelPositionUtils.js';
import {shouldHidePinnedApplications} from './taskbarPinnedVisibility.js';

export function defaultPanelWindowsEnabled(settings) {
    return settings.get_boolean('default-gnome-panel') &&
        settings.get_boolean('default-panel-show-running-windows') &&
        !panelIsVertical(settings);
}

export function panelApplicationsEnabled(settings) {
    return !settings.get_boolean('default-gnome-panel') ||
        defaultPanelWindowsEnabled(settings);
}

export function panelApplicationsVisible(settings, isSecondary) {
    return defaultPanelWindowsEnabled(settings) ||
        (!settings.get_boolean('default-gnome-panel') &&
            !(shouldHidePinnedApplications(settings, isSecondary) &&
                settings.get_boolean('hide-unpinned-taskbar-apps')));
}

