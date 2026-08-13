// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    DEFAULT_PANEL_ITEM_ORDER,
    normalizePanelItemOrder,
} from '../panelItemOrder.js';
import {selectFolderMenuLocation} from './preferencesDialogs.js';
import {createPanelOrderRow} from './preferencesWidgets.js';

export function addPanelItemsPage({
    window,
    settings,
    connectSettings,
    page,
    panelPositions,
    windowsStartMenuSwitch,
    followAppAlignmentSwitch,
}) {
    const panelGroup = new Adw.PreferencesGroup({
        title: _('Panel Items'),
        description: _('Choose which optional panel items appear.'),
    });
    page.add(panelGroup);

    const activitiesButtonSwitch = new Adw.SwitchRow({
        title: _('Show Activities Button'),
        subtitle: _('Display GNOME’s workspace overview button on the taskbar'),
        active: settings.get_boolean('activities-button-visible'),
    });
    panelGroup.add(activitiesButtonSwitch);
    settings.bind(
        'activities-button-visible',
        activitiesButtonSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const showDesktopSwitch = new Adw.SwitchRow({
        title: _('Show Desktop Button'),
        subtitle: _('Display a button that minimizes or restores all windows'),
        active: settings.get_boolean(
            'show-desktop-button-visible'
        ),
    });
    panelGroup.add(showDesktopSwitch);
    settings.bind(
        'show-desktop-button-visible',
        showDesktopSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const volumeMixerSwitch = new Adw.SwitchRow({
        title: _('Application Volume Mixer'),
        subtitle: _('Add per-application volume controls to Quick Settings'),
        active: settings.get_boolean('volume-mixer-enabled'),
    });
    panelGroup.add(volumeMixerSwitch);
    settings.bind(
        'volume-mixer-enabled',
        volumeMixerSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const trayOverflowSwitch = new Adw.SwitchRow({
        title: _('Collect Tray Icons'),
        subtitle: _('Gather application tray icons behind a panel arrow'),
        active: settings.get_boolean('tray-overflow-enabled'),
    });
    panelGroup.add(trayOverflowSwitch);
    settings.bind(
        'tray-overflow-enabled',
        trayOverflowSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const folderMenuSwitch = new Adw.SwitchRow({
        title: _('Show Folder Menu'),
        subtitle: _('Show a selected folder on the taskbar'),
        active: settings.get_boolean('folder-menu-enabled'),
    });
    panelGroup.add(folderMenuSwitch);
    settings.bind(
        'folder-menu-enabled',
        folderMenuSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const folderMenuRow = new Adw.ActionRow({
        title: _('Folder Menu Location'),
    });
    const chooseFolderButton = new Gtk.Button({
        label: _('Choose…'),
        valign: Gtk.Align.CENTER,
    });
    folderMenuRow.add_suffix(chooseFolderButton);
    folderMenuRow.activatable_widget = chooseFolderButton;
    panelGroup.add(folderMenuRow);

    const updateFolderMenuRow = () => {
        const location = settings.get_string('folder-menu-uri');
        if (location) {
            const file = location.includes('://')
                ? Gio.File.new_for_uri(location)
                : Gio.File.new_for_path(location);
            folderMenuRow.subtitle = file.get_parse_name();
        } else {
            folderMenuRow.subtitle = _('No folder selected');
        }
        folderMenuRow.sensitive = folderMenuSwitch.active;
    };
    chooseFolderButton.connect('clicked', () => {
        selectFolderMenuLocation(window);
    });
    connectSettings(
        settings,
        'changed::folder-menu-uri',
        updateFolderMenuRow
    );
    folderMenuSwitch.connect('notify::active', updateFolderMenuRow);
    updateFolderMenuRow();

    const panelOrderGroups = new Map([
        ['left', new Adw.PreferencesGroup({
            title: _('Left Items'),
            description: _(
                'Move items only within their current panel position.'
            ),
        })],
        ['center', new Adw.PreferencesGroup({
            title: _('Center Items'),
        })],
        ['right', new Adw.PreferencesGroup({
            title: _('Right Items'),
        })],
    ]);
    for (const group of panelOrderGroups.values())
        page.add(group);

    const panelOrderDefinitions = new Map([
        ['left-box', {
            title: _('Left Box'),
            subtitle: _('Other GNOME Shell and extension items'),
            choices: [panelPositions[0]],
            fixedPosition: 'left',
        }],
        ['center-box', {
            title: _('Center Box'),
            subtitle: _('Other GNOME Shell and extension items'),
            choices: [panelPositions[1]],
            fixedPosition: 'center',
        }],
        ['right-box', {
            title: _('Right Box'),
            subtitle: _('Other GNOME Shell and extension items'),
            choices: [panelPositions[2]],
            fixedPosition: 'right',
        }],
        ['start-button', {
            key: 'start-button-position',
            title: _('Start Button'),
            subtitle: _('Eleven-style or original GNOME Start button'),
            choices: panelPositions.slice(0, 2),
        }],
        ['activities', {
            key: 'activities-button-position',
            title: _('Activities'),
            subtitle: _('GNOME workspace overview button'),
            choices: panelPositions,
        }],
        ['applications', {
            key: 'app-alignment',
            title: _('Applications'),
            subtitle: _('Taskbar application buttons'),
            choices: panelPositions.slice(0, 2),
        }],
        ['folder-menu', {
            key: 'folder-menu-position',
            title: _('Folder Menu'),
            subtitle: _('Selected folder shortcuts'),
            choices: panelPositions,
        }],
        ['tray-overflow', {
            key: 'tray-overflow-position',
            title: _('Tray icons'),
            subtitle: _('Gather application tray icons behind a panel arrow'),
            choices: panelPositions,
        }],
        ['system-menu', {
            key: 'system-menu-position',
            title: _('System Menu'),
            subtitle: _('Quick Settings, volume, network, and power'),
            choices: panelPositions,
        }],
        ['clock', {
            key: 'clock-position',
            title: _('Clock'),
            choices: panelPositions,
        }],
        ['show-desktop', {
            key: 'show-desktop-button-position',
            title: _('Show Desktop Button'),
            subtitle: _('Minimize or restore all windows'),
            choices: panelPositions.filter(
                position => position.value !== 'center'
            ),
        }],
    ]);
    const panelOrderRows = new Map();
    for (const id of DEFAULT_PANEL_ITEM_ORDER) {
        const controls = createPanelOrderRow(
            settings,
            panelOrderDefinitions.get(id),
            connectSettings
        );
        panelOrderRows.set(id, controls);
    }
    const activitiesPanelPositions = panelPositions.filter(
        position => position.value !== 'center'
    );
    const syncActivitiesPositionChoices = () => {
        const choices = settings.get_boolean(
            'windows-xp-theme-enabled'
        ) ? activitiesPanelPositions : panelPositions;
        panelOrderRows.get('activities').setChoices(choices);
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncActivitiesPositionChoices
    );
    syncActivitiesPositionChoices();

    const getPanelItemPosition = id => {
        const definition = panelOrderDefinitions.get(id);
        if (definition.fixedPosition)
            return definition.fixedPosition;

        if (id === 'start-button' &&
            followAppAlignmentSwitch.active) {
            return settings.get_string('app-alignment');
        }

        return settings.get_string(definition.key);
    };
    const isPanelItemLocked = id => {
        if (settings.get_boolean('windows-xp-theme-enabled')) {
            return [
                'right-box',
                'start-button',
                'activities',
                'applications',
                'show-desktop',
                'tray-overflow',
                'system-menu',
                'clock',
            ].includes(id);
        }
        if (settings.get_boolean('default-gnome-panel'))
            return id === 'start-button' || id === 'applications';
        return false;
    };
    const syncPanelItemOrder = () => {
        const stored = settings.get_strv('panel-item-order');
        const order = normalizePanelItemOrder(stored);
        if (stored.length !== order.length ||
            stored.some((id, index) => id !== order[index])) {
            settings.set_strv('panel-item-order', order);
            return;
        }

        for (const controls of panelOrderRows.values()) {
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
            const controls = panelOrderRows.get(id);
            const position = getPanelItemPosition(id);
            const group = panelOrderGroups.get(position);
            controls.syncPosition(position);
            group.add(controls.row);
            controls.group = group;
            positionOrders.get(position).push(id);
        }
        for (const positionOrder of positionOrders.values()) {
            for (const [index, id] of positionOrder.entries()) {
                const controls = panelOrderRows.get(id);
                const previousId = positionOrder[index - 1];
                const nextId = positionOrder[index + 1];
                controls.upButton.sensitive =
                    index > 0 &&
                    !isPanelItemLocked(id) &&
                    !isPanelItemLocked(previousId);
                controls.downButton.sensitive =
                    index < positionOrder.length - 1 &&
                    !isPanelItemLocked(id) &&
                    !isPanelItemLocked(nextId);
            }
        }
    };
    const movePanelItem = (id, offset) => {
        if (isPanelItemLocked(id))
            return;

        const order = normalizePanelItemOrder(
            settings.get_strv('panel-item-order')
        );
        const position = getPanelItemPosition(id);
        const positionOrder = order.filter(
            candidate => getPanelItemPosition(candidate) === position
        );
        const index = positionOrder.indexOf(id);
        const targetIndex = index + offset;
        if (index < 0 || targetIndex < 0 ||
            targetIndex >= positionOrder.length) {
            return;
        }

        const otherId = positionOrder[targetIndex];
        if (isPanelItemLocked(otherId))
            return;

        const orderIndex = order.indexOf(id);
        const otherOrderIndex = order.indexOf(otherId);
        [order[orderIndex], order[otherOrderIndex]] =
            [order[otherOrderIndex], order[orderIndex]];
        settings.set_strv('panel-item-order', order);
    };
    for (const [id, controls] of panelOrderRows) {
        controls.upButton.connect('clicked', () => {
            movePanelItem(id, -1);
        });
        controls.downButton.connect('clicked', () => {
            movePanelItem(id, 1);
        });
    }
    connectSettings(
        settings,
        'changed::panel-item-order',
        syncPanelItemOrder
    );
    for (const definition of panelOrderDefinitions.values()) {
        if (definition.fixedPosition)
            continue;

        connectSettings(
            settings,
            `changed::${definition.key}`,
            syncPanelItemOrder
        );
    }

    const syncPanelPositionSensitivity = () => {
        const defaultPanel = settings.get_boolean(
            'default-gnome-panel'
        );
        const windowsXpTheme = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        windowsStartMenuSwitch.sensitive = !windowsXpTheme;
        panelOrderRows.get('start-button').positionDropDown.sensitive =
            !defaultPanel && !windowsXpTheme &&
            !followAppAlignmentSwitch.active;
        panelOrderRows.get('applications').positionDropDown.sensitive =
            !defaultPanel && !windowsXpTheme;
        panelOrderRows.get('system-menu').positionDropDown.sensitive =
            !windowsXpTheme;
        panelOrderRows.get('clock').positionDropDown.sensitive =
            !windowsXpTheme;
        panelOrderRows.get('activities').positionDropDown.sensitive =
            activitiesButtonSwitch.active;
        panelOrderRows.get('folder-menu').positionDropDown.sensitive =
            !windowsXpTheme && folderMenuSwitch.active;
        panelOrderRows.get('tray-overflow').positionDropDown.sensitive =
            !windowsXpTheme && trayOverflowSwitch.active;
        panelOrderRows.get('show-desktop').positionDropDown.sensitive =
            !windowsXpTheme && showDesktopSwitch.active;
    };
    followAppAlignmentSwitch.connect(
        'notify::active',
        () => {
            syncPanelPositionSensitivity();
            syncPanelItemOrder();
        }
    );
    activitiesButtonSwitch.connect(
        'notify::active',
        syncPanelPositionSensitivity
    );
    folderMenuSwitch.connect(
        'notify::active',
        syncPanelPositionSensitivity
    );
    trayOverflowSwitch.connect(
        'notify::active',
        syncPanelPositionSensitivity
    );
    showDesktopSwitch.connect(
        'notify::active',
        syncPanelPositionSensitivity
    );
    connectSettings(
        settings,
        'changed::default-gnome-panel',
        () => {
            syncPanelItemOrder();
            syncPanelPositionSensitivity();
        }
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        () => {
            syncPanelItemOrder();
            syncPanelPositionSensitivity();
        }
    );
    syncPanelItemOrder();
    syncPanelPositionSensitivity();
}
