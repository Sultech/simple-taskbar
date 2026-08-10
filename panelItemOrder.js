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
    'tray-overflow',
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

export function getWindowsXpPanelItemOrder(order) {
    const normalized = normalizePanelItemOrder(order);
    return [
        ...normalized.filter(id =>
            id !== 'system-menu' && id !== 'clock'),
        'system-menu',
        'clock',
    ];
}

export function orderPanelItems(items, order) {
    const itemsById = new Map(items.map(item => [item.id, item]));
    return normalizePanelItemOrder(order)
        .map(id => itemsById.get(id))
        .filter(item => item !== undefined);
}

function reorderBoxChildren(box, actors) {
    for (let index = 0; index < actors.length; index++) {
        const actor = actors[index];
        if (box.get_child_at_index(index) === actor)
            continue;

        if (actor.get_parent() === box)
            box.set_child_at_index(actor, index);
        else
            box.insert_child_at_index(actor, index);
    }
}

export function placePanelItems(boxes, items, order) {
    const boxReached = new Set();
    const targets = new Map(PANEL_BOX_ITEMS.map(({position}) => [
        position,
        {leading: [], trailing: []},
    ]));
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

        const target = targets.get(item.position);
        if (boxReached.has(item.position))
            target.trailing.push(item.actor);
        else
            target.leading.push(item.actor);
    }

    const managedActors = new Set();
    for (const {actor, position, visible} of items) {
        if (!actor)
            continue;

        managedActors.add(actor);
        const parent = actor.get_parent();
        if (parent && (!visible || parent !== boxes[position]))
            parent.remove_child(actor);
    }

    for (const [position, {leading, trailing}] of targets) {
        const box = boxes[position];
        const unmanaged = box.get_children()
            .filter(child => !managedActors.has(child));
        reorderBoxChildren(box, [...leading, ...unmanaged, ...trailing]);
    }
}
