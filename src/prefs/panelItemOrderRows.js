// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function syncItemOrderRows(settings, {
    key,
    normalizeOrder,
    rows,
    groups,
    getPosition,
    syncPosition = () => {},
}) {
    const stored = settings.get_strv(key);
    const order = normalizeOrder(stored);
    if (stored.length !== order.length ||
        stored.some((id, index) => id !== order[index])) {
        settings.set_strv(key, order);
        return null;
    }

    for (const controls of rows.values()) {
        if (controls.group) {
            controls.group.remove(controls.row);
            controls.group = null;
        }
    }

    const positionOrders = new Map([...groups.keys()].map(position => [position, []]));
    for (const id of order) {
        const controls = rows.get(id);
        const position = getPosition(id);
        const group = groups.get(position);
        syncPosition(controls, position);
        group.add(controls.row);
        controls.group = group;
        positionOrders.get(position).push(id);
    }
    return positionOrders;
}
