// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    DEFAULT_DOCK_ITEM_ORDER,
    normalizeDockItemOrder,
} from '../shared/panelItemOrder.js';
import {createItemOrderRow} from './preferencesWidgets.js';

export function addDockItemsPage({page, settings, connectSettings}) {
    const group = new Adw.PreferencesGroup({
        title: _('Dock Items'),
        description: _('Choose the order of items in the Dock.'),
    });
    page.add(group);

    const definitions = new Map([
        ['start-button', {
            title: _('Start Menu'),
            subtitle: _('Eleven-style or original GNOME Start menu'),
        }],
        ['applications', {
            title: _('Applications'),
            subtitle: _('Dock application buttons'),
        }],
    ]);
    const rows = new Map();
    for (const id of DEFAULT_DOCK_ITEM_ORDER)
        rows.set(id, createItemOrderRow(definitions.get(id)));

    const syncDockItemOrder = () => {
        const stored = settings.get_strv('dock-item-order');
        const order = normalizeDockItemOrder(stored);
        group.sensitive = settings.get_boolean('dock-mode') &&
            !settings.get_boolean('windows-xp-theme-enabled');
        if (stored.length !== order.length ||
            stored.some((id, index) => id !== order[index])) {
            settings.set_strv('dock-item-order', order);
            return;
        }

        for (const controls of rows.values()) {
            if (controls.group) {
                controls.group.remove(controls.row);
                controls.group = null;
            }
        }
        for (const [index, id] of order.entries()) {
            const controls = rows.get(id);
            group.add(controls.row);
            controls.group = group;
            controls.upButton.sensitive = index > 0;
            controls.downButton.sensitive = index < order.length - 1;
        }
    };
    const moveDockItem = (id, offset) => {
        if (!group.sensitive)
            return;

        const order = normalizeDockItemOrder(
            settings.get_strv('dock-item-order')
        );
        const index = order.indexOf(id);
        const targetIndex = index + offset;
        if (targetIndex < 0 || targetIndex >= order.length)
            return;

        [order[index], order[targetIndex]] =
            [order[targetIndex], order[index]];
        settings.set_strv('dock-item-order', order);
    };
    for (const [id, controls] of rows) {
        controls.upButton.connect('clicked', () => {
            moveDockItem(id, -1);
        });
        controls.downButton.connect('clicked', () => {
            moveDockItem(id, 1);
        });
    }
    connectSettings(
        settings,
        'changed::dock-item-order',
        syncDockItemOrder
    );
    for (const key of ['dock-mode', 'windows-xp-theme-enabled']) {
        connectSettings(settings, `changed::${key}`, syncDockItemOrder);
    }
    syncDockItemOrder();
}
