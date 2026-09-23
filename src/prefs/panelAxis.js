// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    activePanelPosition,
    panelIsVertical,
    positionIsVertical,
} from '../shared/panelPositionUtils.js';

export function activePanelIsVertical(settings) {
    return positionIsVertical(activePanelPosition(settings));
}

export function axisPanelPositions(settings, panelPositions) {
    if (!panelIsVertical(settings))
        return panelPositions;

    return [
        {value: 'left', label: _('Top')},
        {value: 'center', label: _('Middle')},
        {value: 'right', label: _('Bottom')},
    ];
}
