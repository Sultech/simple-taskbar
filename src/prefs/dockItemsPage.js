// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    DEFAULT_DOCK_ITEM_ORDER,
    normalizeDockItemOrder,
} from '../shared/panelItemOrder.js';
import {axisPanelPositions} from './panelAxis.js';
import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {createPanelOrderRow} from './preferencesWidgets.js';

export function addDockItemsPage({
    page,
    settings,
    connectSettings,
    panelPositions,
}) {
    const groups = new Map([
        ['left', new Adw.PreferencesGroup({
            title: _('Left Items'),
            description: _(
                'Move items only within their current Dock position.'
            ),
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

    const startButtonVisibility = {
        get: () => settings.get_boolean('windows-start-menu-enabled') ||
            settings.get_boolean('gnome-start-button-visible'),
        set: visible => settings.set_boolean(
            'gnome-start-button-visible',
            visible
        ),
        changedKeys: [
            'windows-start-menu-enabled',
            'gnome-start-button-visible',
        ],
    };
    const applicationsVisibility = {
        get: () => !(settings.get_boolean('hide-pinned-taskbar-apps') &&
            settings.get_boolean('hide-unpinned-taskbar-apps')),
        set: visible => {
            const hidden = !visible;
            settings.set_boolean('hide-pinned-taskbar-apps', hidden);
            settings.set_boolean('hide-unpinned-taskbar-apps', hidden);
        },
        changedKeys: [
            'hide-pinned-taskbar-apps',
            'hide-unpinned-taskbar-apps',
        ],
    };

    const definitions = new Map([
        ['start-button', {
            key: 'start-button-position',
            title: _('Start Menu'),
            subtitle: _('Eleven-style or original GNOME Start menu'),
            visibleState: startButtonVisibility,
        }],
        ['applications', {
            key: 'app-alignment',
            title: _('Applications'),
            subtitle: _('Dock application buttons'),
            visibleState: applicationsVisibility,
        }],
    ]);
    const initialPositions = axisPanelPositions(settings, panelPositions);
    const rows = new Map();
    for (const id of DEFAULT_DOCK_ITEM_ORDER) {
        const definition = definitions.get(id);
        rows.set(id, createPanelOrderRow(
            settings,
            {
                ...definition,
                choices: id === 'applications'
                    ? initialPositions.slice(0, 2)
                    : initialPositions,
            },
            connectSettings
        ));
    }

    const itemPosition = id => {
        if ((id === 'applications' || id === 'start-button') &&
            !settings.get_boolean('dock-panel-mode')) {
            return 'center';
        }
        if (id === 'start-button' &&
            settings.get_boolean('start-button-follow-app-alignment')) {
            return settings.get_boolean('dock-panel-mode')
                ? settings.get_string('app-alignment')
                : 'center';
        }
        return settings.get_string(definitions.get(id).key);
    };

    const syncDockItemAxis = () => {
        const positions = axisPanelPositions(settings, panelPositions);
        const groupTitles = panelIsVertical(settings)
            ? [_('Top Items'), _('Middle Items'), _('Bottom Items')]
            : [_('Left Items'), _('Center Items'), _('Right Items')];
        for (const [index, position] of [
            'left',
            'center',
            'right',
        ].entries())
            groups.get(position).title = groupTitles[index];
        rows.get('start-button').setChoices(positions);
        rows.get('applications').setChoices(positions.slice(0, 2));
        for (const [id, controls] of rows)
            controls.syncPosition(itemPosition(id));
    };

    const syncDockItemOrder = () => {
        const stored = settings.get_strv('dock-item-order');
        const order = normalizeDockItemOrder(stored);
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
        const positionOrders = new Map([
            ['left', []],
            ['center', []],
            ['right', []],
        ]);
        for (const id of order) {
            const controls = rows.get(id);
            const position = itemPosition(id);
            const group = groups.get(position);
            group.add(controls.row);
            controls.group = group;
            positionOrders.get(position).push(id);
        }
        for (const positionOrder of positionOrders.values()) {
            for (const [index, id] of positionOrder.entries()) {
                const controls = rows.get(id);
                controls.upButton.sensitive = index > 0;
                controls.downButton.sensitive =
                    index < positionOrder.length - 1;
            }
        }
    };

    const syncDockItemSensitivity = () => {
        const enabled = settings.get_boolean('dock-mode') &&
            !settings.get_boolean('windows-xp-theme-enabled');
        for (const group of groups.values())
            group.sensitive = enabled;
        rows.get('start-button').positionDropDown.sensitive = enabled &&
            settings.get_boolean('dock-panel-mode') &&
            !settings.get_boolean('start-button-follow-app-alignment') &&
            startButtonVisibility.get();
        rows.get('applications').positionDropDown.sensitive = enabled &&
            settings.get_boolean('dock-panel-mode') &&
            applicationsVisibility.get();
        rows.get('start-button').visibleButton.sensitive = enabled &&
            !settings.get_boolean('windows-start-menu-enabled');
        rows.get('applications').visibleButton.sensitive = enabled;
    };

    const moveDockItem = (id, offset) => {
        if (!settings.get_boolean('dock-mode') ||
            settings.get_boolean('windows-xp-theme-enabled')) {
            return;
        }

        const order = normalizeDockItemOrder(
            settings.get_strv('dock-item-order')
        );
        const position = itemPosition(id);
        const positionOrder = order.filter(
            candidate => itemPosition(candidate) === position
        );
        const index = positionOrder.indexOf(id);
        const targetIndex = index + offset;
        if (index < 0 || targetIndex < 0 ||
            targetIndex >= positionOrder.length) {
            return;
        }

        const otherId = positionOrder[targetIndex];
        const orderIndex = order.indexOf(id);
        const otherOrderIndex = order.indexOf(otherId);
        [order[orderIndex], order[otherOrderIndex]] =
            [order[otherOrderIndex], order[orderIndex]];
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
    for (const key of [
        'app-alignment',
        'dock-mode',
        'dock-panel-mode',
        'gnome-start-button-visible',
        'hide-pinned-taskbar-apps',
        'hide-unpinned-taskbar-apps',
        'panel-position',
        'start-button-follow-app-alignment',
        'start-button-position',
        'windows-start-menu-enabled',
        'windows-xp-theme-enabled',
    ]) {
        connectSettings(settings, `changed::${key}`, () => {
            syncDockItemAxis();
            syncDockItemOrder();
            syncDockItemSensitivity();
        });
    }
    syncDockItemAxis();
    syncDockItemOrder();
    syncDockItemSensitivity();
}
