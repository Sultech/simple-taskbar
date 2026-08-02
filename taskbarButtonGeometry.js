// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const TASKBAR_BUTTON_GLASS_TOP = 4;

export function getTaskbarIconButtonWidth(iconSize) {
    const minimumIconWidth = iconSize % 2 === 0 ? 22 : 21;
    return Math.max(iconSize, minimumIconWidth) + 8;
}

export function getTaskbarButtonSlotWidth(buttonWidth, iconSpacing) {
    return buttonWidth + Math.max(iconSpacing, 0);
}

export function getTaskbarButtonGlassHeight(panelHeight, roundedIndicators) {
    return Math.max(1, panelHeight - (roundedIndicators ? 7 : 8));
}
