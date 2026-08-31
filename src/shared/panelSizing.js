// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const MIN_PANEL_HEIGHT = 30;
export const STANDARD_MIN_PANEL_HEIGHT = 32;
export const ICON_VERTICAL_RESERVE = 19;
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
