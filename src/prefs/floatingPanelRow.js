// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {createSwitchExpanderRow, createSwitchRow} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

export function addFloatingPanelRow(group, settings, connectSettings, dock) {
    const prefix = dock ? 'dock' : 'taskbar';
    const modeKey = dock ? 'dock-panel-mode' : 'taskbar-dynamic';
    const gapKey = `${prefix}-floating-gap`;
    const snapKey = `${prefix}-floating-snap-to-edge`;
    const windowGapKey = `${prefix}-floating-window-gap`;
    const autoHideKey = dock ? 'dock-autohide-enabled' : 'panel-autohide-enabled';
    const dodgeKey = dock ? 'dock-dodge-windows-enabled' : 'panel-dodge-windows-enabled';
    const expander = createSwitchExpanderRow(settings, {
        title: dock ? _('Floating Dock') : _('Floating Panel Mode'),
        subtitle: dock
            ? _('Keep a gap between the Dock and the screen edge')
            : _('Keep a gap between the taskbar and the screen edge'),
        getKey: () => settings.get_boolean(modeKey)
            ? dock ? 'dock-panel-mode-floating' : 'taskbar-dynamic-floating'
            : `${prefix}-floating`,
        keyChangedKey: modeKey,
    }, connectSettings);
    group.add(expander);
    const addRow = row => expander.add_row(row);
    addSliderRow(null, settings, {
        key: gapKey,
        title: _('Floating Gap'),
        subtitle: dock
            ? _('Distance between the floating Dock and the screen edge')
            : _('Distance between the floating taskbar and the screen edge'),
        lower: 1,
        upper: 32,
        addRow,
    }, connectSettings);
    const snapRow = createSwitchRow(settings, {
        key: snapKey,
        title: _('Snap to Screen Edge When Maximized'),
    });
    expander.add_row(snapRow);
    const windowGapSubtitle = dock
        ? _('Distance between maximized windows and the floating Dock')
        : _('Distance between maximized windows and the floating taskbar');
    const windowGapRow = addSliderRow(null, settings, {
        key: windowGapKey,
        title: _('Maximized Window Gap'),
        subtitle: windowGapSubtitle,
        lower: 0,
        upper: 32,
        addRow,
    }, connectSettings);
    const syncSensitivity = () => {
        const available = !settings.get_boolean(autoHideKey) && !settings.get_boolean(dodgeKey);
        const snaps = settings.get_boolean(snapKey);
        const unavailableSubtitle = _('Unavailable while auto-hide or dodge windows is enabled');
        snapRow.sensitive = available;
        snapRow.subtitle = available
            ? _('Close the floating gap for maximized windows; full-length panels also expand to the screen edge')
            : unavailableSubtitle;
        windowGapRow.sensitive = available && !snaps;
        windowGapRow.subtitle = !available
            ? unavailableSubtitle
            : snaps ? _('Turn off snapping to use this setting') : windowGapSubtitle;
    };
    for (const key of [snapKey, autoHideKey, dodgeKey])
        connectSettings(settings, `changed::${key}`, syncSensitivity);
    syncSensitivity();
    return expander;
}
