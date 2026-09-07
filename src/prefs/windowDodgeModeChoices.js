// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DODGE_WINDOW_MODE} from '../shared/windowDodgeModes.js';

export function windowDodgeModeChoices() {
    return [
        {
            value: DODGE_WINDOW_MODE.ALL_WINDOWS,
            label: _('All windows'),
        },
        {
            value: DODGE_WINDOW_MODE.FOCUSED_APPLICATION,
            label: _('Only focused application’s windows'),
        },
        {
            value: DODGE_WINDOW_MODE.FOCUSED_WINDOW,
            label: _('Only focused window'),
        },
        {
            value: DODGE_WINDOW_MODE.MAXIMIZED_WINDOWS,
            label: _('Only maximized windows'),
        },
    ];
}
