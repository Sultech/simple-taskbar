// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    runningIndicatorBottomReserve,
    runningIndicatorLeftReserve,
    runningIndicatorRightReserve,
    runningIndicatorTopReserve,
} from './runningIndicatorSettings.js';
import {setInteger} from './settingsUtils.js';
import {
    HIGHLIGHT_LENGTH_SETTINGS,
    HIGHLIGHT_SIZE_SETTINGS,
} from './classicHighlightSettings.js';
import {panelIsVertical} from './panelPositionUtils.js';

export const MIN_PANEL_HEIGHT = 30;
export const MAX_PANEL_HEIGHT = 175;
export const MIN_ICON_SIZE = 13;
export const MAX_ICON_SIZE = 128;
export const MIN_ICON_EDGE_PADDING = 3;
export const MAX_ICON_EDGE_PADDING = 20;
export const DEFAULT_ICON_EDGE_PADDING = 7;
export const RUNNING_INDICATOR_CLEARANCE = 5;
export const DOCK_FLOATING_CHROME_RESERVE = 5;
export const DOCK_EDGE_GAP = 4;
export const GLASS_VERTICAL_INSET = 3;

export const MIN_HIGHLIGHT_SIZE = 8;

export const MAX_HIGHLIGHT_SIZE = MAX_PANEL_HEIGHT + 1;

export const MAX_HIGHLIGHT_LENGTH = 256;

export function matchHighlightSizeParity(size, iconSize) {
    return size - Math.abs(size - iconSize) % 2;
}

function raiseToIconParity(extent, iconSize) {
    return extent + Math.abs(extent - iconSize) % 2;
}

export function highlightSizeLowerBound(iconSize) {
    return raiseToIconParity(MIN_HIGHLIGHT_SIZE, iconSize);
}

export function highlightSizeUpperBound(iconSize) {
    return matchHighlightSizeParity(MAX_HIGHLIGHT_SIZE, iconSize);
}

export function taskbarAppLabelsVisible(settings) {
    return !panelIsVertical(settings) &&
        settings.get_string('combine-app-buttons-mode') !== 'always' &&
        (settings.isDefaultPanelWindows ||
            !settings.get_boolean('hide-app-labels'));
}

export function taskbarHighlightLength(settings, iconSize) {
    if (settings.get_boolean('windows-xp-theme-enabled') ||
        !settings.get_boolean(HIGHLIGHT_LENGTH_SETTINGS.enabled) ||
        taskbarAppLabelsVisible(settings)) {
        return 0;
    }

    return matchHighlightSizeParity(
        settings.get_int(HIGHLIGHT_LENGTH_SETTINGS.size),
        iconSize
    );
}

function highlightMainAxisReserve(settings) {
    const position = settings.get_string('running-indicator-position');
    if (panelIsVertical(settings)) {
        return runningIndicatorTopReserve(settings, position) +
            runningIndicatorBottomReserve(settings, position);
    }

    return runningIndicatorLeftReserve(settings, position) +
        runningIndicatorRightReserve(settings, position);
}

export function highlightLengthLowerBound(settings, iconSize) {
    return raiseToIconParity(
        taskbarIconButtonWidth(iconSize) + highlightMainAxisReserve(settings),
        iconSize
    );
}

export function highlightLengthUpperBound(iconSize) {
    return matchHighlightSizeParity(MAX_HIGHLIGHT_LENGTH, iconSize);
}

export function iconEdgePadding(settings) {
    if (settings.get_boolean('windows-xp-theme-enabled'))
        return DEFAULT_ICON_EDGE_PADDING;

    const padding = settings.get_int('icon-edge-padding');
    if (settings.isDefaultPanelWindows)
        return Math.min(padding, defaultPanelWindowMaxEdgePadding(settings));
    return padding;
}

export function iconEdgeReserve(settings) {
    return iconEdgePadding(settings) * 2 + RUNNING_INDICATOR_CLEARANCE;
}

export function defaultPanelWindowMaxEdgePadding(settings) {
    return Math.floor(
        (settings.get_int('panel-height') - MIN_ICON_SIZE -
            RUNNING_INDICATOR_CLEARANCE) / 2
    );
}

export function defaultPanelWindowMaxIconSize(settings) {
    return Math.max(
        MIN_ICON_SIZE,
        settings.get_int('panel-height') - iconEdgeReserve(settings)
    );
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

export function taskbarGlassHeight(
    settings,
    panelHeight,
    windowsXpTheme,
    iconSize
) {
    if (windowsXpTheme)
        return panelHeight - 5;

    const centreOnIcon = panelIsVertical(settings);
    const insetExtent = Math.max(1, panelHeight - GLASS_VERTICAL_INSET * 2);
    if (!settings.get_boolean(HIGHLIGHT_SIZE_SETTINGS.enabled)) {
        return centreOnIcon
            ? matchHighlightSizeParity(insetExtent, iconSize)
            : insetExtent;
    }

    const requested = settings.get_int(HIGHLIGHT_SIZE_SETTINGS.size);
    if (requested >= panelHeight)
        return panelHeight;

    return centreOnIcon
        ? matchHighlightSizeParity(requested, iconSize)
        : requested;
}

export function taskbarGlassCrossOffset(panelHeight, glassExtent, parityOffset) {
    const centred = Math.floor((panelHeight - glassExtent) / 2) + parityOffset;
    return Math.max(0, Math.min(centred, panelHeight - glassExtent));
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

export function taskbarPanelHeight(settings, iconSize) {
    if (settings.isDock ||
        settings.get_boolean('default-gnome-panel') ||
        !settings.get_boolean('panel-height-follow-icon-size'))
        return settings.get_int('panel-height');

    return panelHeightForIconSize(settings, iconSize);
}

export function minimumTaskbarPanelHeight(settings) {
    return taskbarPanelHeight(
        settings,
        Math.min(
            settings.get_int('dock-min-icon-size'),
            settings.get_int('icon-size')
        )
    );
}

export function dockPanelModeHeight(settings, iconSize) {
    const derivedHeight = panelHeightForIconSize(settings, iconSize);
    if (settings.get_boolean('dock-panel-height-follow-icon-size'))
        return derivedHeight;

    return Math.max(settings.get_int('dock-panel-height'), derivedHeight);
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
        settings.get_int('icon-size')
    );
    if (settings.get_int(heightKey) < minimumPanelHeight)
        setInteger(settings, heightKey, minimumPanelHeight);
}
