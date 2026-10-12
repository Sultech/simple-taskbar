// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {positionIsVertical} from '../shared/panelPositionUtils.js';

export function axisPanelPositions(position, panelPositions) {
    if (!positionIsVertical(position))
        return panelPositions;

    return [
        {value: 'left', label: _('Top')},
        {value: 'center', label: _('Middle')},
        {value: 'right', label: _('Bottom')},
    ];
}
