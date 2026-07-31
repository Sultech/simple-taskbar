// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const DEFAULT_PANEL_ITEM_ORDER = Object.freeze([
    'start-button',
    'activities',
    'applications',
    'folder-menu',
    'system-menu',
    'clock',
    'show-desktop',
]);

export function normalizePanelItemOrder(order) {
    const validItems = new Set(DEFAULT_PANEL_ITEM_ORDER);
    const normalized = [];

    for (const item of order) {
        if (validItems.delete(item))
            normalized.push(item);
    }
    for (const item of DEFAULT_PANEL_ITEM_ORDER) {
        if (validItems.has(item))
            normalized.push(item);
    }

    return normalized;
}

export function orderPanelItems(items, order) {
    const itemsById = new Map(items.map(item => [item.id, item]));
    return normalizePanelItemOrder(order)
        .map(id => itemsById.get(id))
        .filter(item => item !== undefined);
}
