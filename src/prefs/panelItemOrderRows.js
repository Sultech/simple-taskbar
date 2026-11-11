// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function addItemOrderGroups(page, description) {
    const groups = new Map([
        ['left', new Adw.PreferencesGroup({
            title: _('Left Items'),
            description,
        })],
        ['center', new Adw.PreferencesGroup({
            title: _('Center Items'),
        })],
        ['right', new Adw.PreferencesGroup({
            title: _('Right Items'),
        })],
    ]);
    for (const group of groups.values())
        page.add(group);
    return groups;
}

export function connectItemMoveButtons(rows, moveItem) {
    for (const [id, controls] of rows) {
        controls.upButton.connect('clicked', () => moveItem(id, -1));
        controls.downButton.connect('clicked', () => moveItem(id, 1));
    }
}

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
