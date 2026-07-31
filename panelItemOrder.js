// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const PANEL_BOX_ITEMS = Object.freeze([
    Object.freeze({id: 'left-box', position: 'left'}),
    Object.freeze({id: 'center-box', position: 'center'}),
    Object.freeze({id: 'right-box', position: 'right'}),
]);

export const DEFAULT_PANEL_ITEM_ORDER = Object.freeze([
    ...PANEL_BOX_ITEMS.map(item => item.id),
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

    for (const {id} of PANEL_BOX_ITEMS) {
        if (!order.includes(id)) {
            validItems.delete(id);
            normalized.push(id);
        }
    }
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

export function placePanelItems(boxes, items, order) {
    const boxReached = new Set();
    const leadingItemCounts = new Map(
        PANEL_BOX_ITEMS.map(({position}) => [position, 0])
    );
    const boxItems = PANEL_BOX_ITEMS.map(item => ({
        ...item,
        isBox: true,
    }));

    for (const item of orderPanelItems([...boxItems, ...items], order)) {
        if (item.isBox) {
            boxReached.add(item.position);
            continue;
        }
        if (!item.actor || !item.visible)
            continue;

        const box = boxes[item.position];
        if (boxReached.has(item.position)) {
            box.add_child(item.actor);
        } else {
            const index = leadingItemCounts.get(item.position);
            box.insert_child_at_index(item.actor, index);
            leadingItemCounts.set(item.position, index + 1);
        }
    }
}
