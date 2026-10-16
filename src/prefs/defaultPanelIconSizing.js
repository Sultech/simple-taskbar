// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    defaultPanelWindowMaxEdgePadding,
    defaultPanelWindowMaxIconSize,
    MAX_ICON_EDGE_PADDING,
    MIN_ICON_EDGE_PADDING,
    MIN_ICON_SIZE,
    MAX_ICON_SIZE,
} from '../shared/panelSizing.js';
import {createSliderRow} from './sliderRow.js';

function createSizingRow(settings, connectSettings, {key, title, subtitle, minimum, maximum}) {
    const row = createSliderRow({title, subtitle, lower: minimum, upper: maximum(), unit: 'px'}, connectSettings);
    let syncing = false;
    const sync = () => {
        syncing = true;
        const upper = maximum();
        row.get_adjustment().set_upper(upper);
        row.set_value(Math.min(settings.get_int(key), upper));
        syncing = false;
    };
    row.get_adjustment().connect('value-changed', () => {
        if (!syncing)
            settings.set_int(key, Math.round(row.get_value()));
    });
    for (const changedKey of new Set([key, 'panel-height', 'icon-edge-padding']))
        connectSettings(settings, `changed::${changedKey}`, sync);
    sync();
    return row;
}

export function createDefaultPanelIconSizingRows(settings, connectSettings) {
    const iconSizeRow = createSizingRow(settings, connectSettings, {
        key: 'icon-size',
        title: _('Icon Size'),
        subtitle: _('Icon size is limited by the current panel thickness'),
        minimum: MIN_ICON_SIZE,
        maximum: () => Math.min(MAX_ICON_SIZE, defaultPanelWindowMaxIconSize(settings)),
    });
    const iconEdgePaddingRow = createSizingRow(settings, connectSettings, {
        key: 'icon-edge-padding',
        title: _('Icon Edge Padding'),
        subtitle: _('Space between window icons and the panel edges'),
        minimum: MIN_ICON_EDGE_PADDING,
        maximum: () => Math.min(MAX_ICON_EDGE_PADDING, defaultPanelWindowMaxEdgePadding(settings)),
    });
    return {iconSizeRow, iconEdgePaddingRow};
}
