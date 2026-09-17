// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    runningIndicatorBottomReserve,
    runningIndicatorTopReserve,
} from './runningIndicatorSettings.js';
import {setInteger} from './settingsUtils.js';

export const MIN_PANEL_HEIGHT = 30;
export const MAX_PANEL_HEIGHT = 175;
export const MIN_ICON_SIZE = 13;
export const MIN_ICON_EDGE_PADDING = 3;
export const MAX_ICON_EDGE_PADDING = 20;
export const DEFAULT_ICON_EDGE_PADDING = 7;
export const RUNNING_INDICATOR_CLEARANCE = 5;
export const DOCK_FLOATING_CHROME_RESERVE = 5;
export const DOCK_EDGE_GAP = 4;
export const GLASS_VERTICAL_INSET = 3;

export function iconEdgePadding(settings) {
    if (settings.get_boolean('windows-xp-theme-enabled'))
        return DEFAULT_ICON_EDGE_PADDING;

    return settings.get_int('icon-edge-padding');
}

export function iconEdgeReserve(settings) {
    return iconEdgePadding(settings) * 2 + RUNNING_INDICATOR_CLEARANCE;
}

export function standardMinimumPanelHeight(settings) {
    return Math.max(
        MIN_PANEL_HEIGHT,
        MIN_ICON_SIZE + iconEdgeReserve(settings)
    );
}

export function dockFloatingPanelReserve(settings) {
    return iconEdgeReserve(settings) + DOCK_FLOATING_CHROME_RESERVE;
}

export function taskbarVisualPanelHeight(
    settings,
    panelHeight,
    iconSize,
    floatingDock
) {
    if (!floatingDock)
        return panelHeight;

    const reserve = iconEdgeReserve(settings);
    return iconSize + reserve + reserve % 2;
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

export function taskbarCrossAxisParityOffset(settings, panelThickness, iconSize) {
    if (settings.isDock && !settings.get_boolean('dock-panel-mode'))
        return 0;

    return iconSize % 2 !== 0 && panelThickness % 2 === 0 ? 1 : 0;
}

export function taskbarVerticalItemExtent(
    settings,
    iconSize,
    indicatorPosition
) {
    return taskbarIconButtonWidth(iconSize) +
        runningIndicatorTopReserve(settings, indicatorPosition) +
        runningIndicatorBottomReserve(settings, indicatorPosition);
}

export function panelHeightForIconSize(settings, iconSize) {
    return iconSize + iconEdgeReserve(settings);
}

function clampIconSizeToMaximumPanelHeight(settings) {
    const iconSize = settings.get_int('icon-size');
    const maximumIconSize = MAX_PANEL_HEIGHT - iconEdgeReserve(settings);
    if (iconSize <= maximumIconSize)
        return iconSize;

    setInteger(settings, 'icon-size', maximumIconSize);
    return maximumIconSize;
}

export function fitIconSizeToPanelHeight(settings, heightKey = 'panel-height') {
    let panelHeight = settings.get_int(heightKey);
    const minimumPanelHeight = standardMinimumPanelHeight(settings);
    if (panelHeight < minimumPanelHeight) {
        panelHeight = minimumPanelHeight;
        setInteger(settings, heightKey, panelHeight);
        return;
    }

    const maximumIconSize = panelHeight - iconEdgeReserve(settings);
    if (settings.get_int('icon-size') > maximumIconSize)
        setInteger(settings, 'icon-size', maximumIconSize);
}

export function fitPanelHeightToIconSize(settings, heightKey = 'panel-height') {
    const minimumPanelHeight = panelHeightForIconSize(
        settings,
        clampIconSizeToMaximumPanelHeight(settings)
    );
    if (settings.get_int(heightKey) < minimumPanelHeight)
        setInteger(settings, heightKey, minimumPanelHeight);
}

export function derivePanelHeightFromIconSize(settings, heightKey = 'panel-height') {
    setInteger(
        settings,
        heightKey,
        panelHeightForIconSize(
            settings,
            clampIconSizeToMaximumPanelHeight(settings)
        )
    );
}
