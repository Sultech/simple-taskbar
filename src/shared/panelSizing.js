// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {RUNNING_INDICATOR_RESERVE} from './runningIndicatorSettings.js';
import {setInteger} from './settingsUtils.js';

export const MIN_PANEL_HEIGHT = 30;
export const MAX_PANEL_HEIGHT = 80;
export const MIN_ICON_SIZE = 13;
export const ICON_VERTICAL_RESERVE = 19;
export const STANDARD_MIN_PANEL_HEIGHT =
    MIN_ICON_SIZE + ICON_VERTICAL_RESERVE;
export const DOCK_FLOATING_PANEL_RESERVE = 24;
export const DOCK_EDGE_GAP = 4;
export const GLASS_VERTICAL_INSET = 3;

export function taskbarVisualPanelHeight(
    panelHeight,
    iconSize,
    floatingDock
) {
    return floatingDock ? iconSize + ICON_VERTICAL_RESERVE : panelHeight;
}

export function taskbarGlassHeight(panelHeight, windowsXpTheme) {
    if (windowsXpTheme)
        return panelHeight - 5;

    return Math.max(1, panelHeight - GLASS_VERTICAL_INSET * 2);
}

export function taskbarIconButtonWidth(iconSize) {
    const minimumIconWidth = iconSize % 2 === 0 ? 22 : 21;
    return Math.max(iconSize, minimumIconWidth) + 8;
}

export function taskbarVerticalItemExtent(iconSize) {
    return iconSize + GLASS_VERTICAL_INSET * 2 + RUNNING_INDICATOR_RESERVE;
}

export function panelHeightForIconSize(iconSize) {
    return iconSize + ICON_VERTICAL_RESERVE;
}

function clampIconSizeToMaximumPanelHeight(settings) {
    const iconSize = settings.get_int('icon-size');
    const maximumIconSize = MAX_PANEL_HEIGHT - ICON_VERTICAL_RESERVE;
    if (iconSize <= maximumIconSize)
        return iconSize;

    setInteger(settings, 'icon-size', maximumIconSize);
    return maximumIconSize;
}

export function fitIconSizeToPanelHeight(settings, heightKey = 'panel-height') {
    let panelHeight = settings.get_int(heightKey);
    if (panelHeight < STANDARD_MIN_PANEL_HEIGHT) {
        panelHeight = STANDARD_MIN_PANEL_HEIGHT;
        setInteger(settings, heightKey, panelHeight);
        return;
    }

    const maximumIconSize = panelHeight - ICON_VERTICAL_RESERVE;
    if (settings.get_int('icon-size') > maximumIconSize)
        setInteger(settings, 'icon-size', maximumIconSize);
}

export function fitPanelHeightToIconSize(settings, heightKey = 'panel-height') {
    const minimumPanelHeight = panelHeightForIconSize(
        clampIconSizeToMaximumPanelHeight(settings)
    );
    if (settings.get_int(heightKey) < minimumPanelHeight)
        setInteger(settings, heightKey, minimumPanelHeight);
}

export function derivePanelHeightFromIconSize(settings, heightKey = 'panel-height') {
    setInteger(
        settings,
        heightKey,
        panelHeightForIconSize(clampIconSizeToMaximumPanelHeight(settings))
    );
}
