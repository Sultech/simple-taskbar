// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    DEFAULT_PANEL_ITEM_ORDER,
    normalizePanelItemOrder,
} from '../shared/panelItemOrder.js';
import {selectFolderMenuLocation} from './preferencesDialogs.js';
import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {axisPanelPositions} from './panelAxis.js';
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

    const initialPositions = axisPanelPositions(settings, panelPositions);
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
            choices: [initialPositions[0]],
            fixedPosition: 'left',
        }],
        ['center-box', {
            title: _('Center Box'),
            subtitle: _('Other GNOME Shell and extension items'),
            choices: [initialPositions[1]],
            fixedPosition: 'center',
        }],
        ['right-box', {
            title: _('Right Box'),
            subtitle: _('Other GNOME Shell and extension items'),
            choices: [initialPositions[2]],
            fixedPosition: 'right',
        }],
        ['start-button', {
            key: 'start-button-position',
            title: _('Start Button'),
            subtitle: _('Eleven-style or original GNOME Start button'),
            choices: initialPositions.slice(0, 2),
        }],
        ['activities', {
            key: 'activities-button-position',
            title: _('Activities'),
            subtitle: _('GNOME workspace overview button'),
            choices: initialPositions,
        }],
        ['applications', {
            key: 'app-alignment',
            title: _('Applications'),
            subtitle: _('Taskbar application buttons'),
            choices: initialPositions.slice(0, 2),
        }],
        ['folder-menu', {
            key: 'folder-menu-position',
            title: _('Folder Menu'),
            subtitle: _('Selected folder shortcuts'),
            choices: initialPositions,
        }],
        ['tray-overflow', {
            key: 'tray-overflow-position',
            title: _('Tray icons'),
            subtitle: _('Gather application tray icons behind a panel arrow'),
            choices: initialPositions,
        }],
        ['system-menu', {
            key: 'system-menu-position',
            title: _('System Menu'),
            subtitle: _('Quick Settings, volume, network, and power'),
            choices: initialPositions,
        }],
        ['clock', {
            key: 'clock-position',
            title: _('Clock'),
            choices: initialPositions,
        }],
        ['show-desktop', {
            key: 'show-desktop-button-position',
            title: _('Show Desktop Button'),
            subtitle: _('Minimize or restore all windows'),
            choices: initialPositions.filter(
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
    const syncPanelAxis = () => {
        const positions = axisPanelPositions(settings, panelPositions);
        const vertical = panelIsVertical(settings);
        const groupTitles = vertical
            ? [_('Top Items'), _('Middle Items'), _('Bottom Items')]
            : [_('Left Items'), _('Center Items'), _('Right Items')];
        const boxTitles = vertical
            ? [_('Top Box'), _('Middle Box'), _('Bottom Box')]
            : [_('Left Box'), _('Center Box'), _('Right Box')];
        for (const [index, position] of [
            'left',
            'center',
            'right',
        ].entries()) {
            panelOrderGroups.get(position).title = groupTitles[index];
            panelOrderRows.get(`${position}-box`).row.title = boxTitles[index];
            panelOrderRows.get(`${position}-box`).setChoices([
                positions[index],
            ]);
        }
        panelOrderRows.get('start-button').setChoices(
            positions.slice(0, 2)
        );
        panelOrderRows.get('applications').setChoices(
            positions.slice(0, 2)
        );
        panelOrderRows.get('show-desktop').setChoices(
            positions.filter(position => position.value !== 'center')
        );
        const activitiesPositions = settings.get_boolean(
            'windows-xp-theme-enabled'
        )
            ? positions.filter(position => position.value !== 'center')
            : positions;
        panelOrderRows.get('activities').setChoices(activitiesPositions);
        for (const id of [
            'folder-menu',
            'tray-overflow',
            'system-menu',
            'clock',
        ])
            panelOrderRows.get(id).setChoices(positions);
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncPanelAxis
    );
    connectSettings(
        settings,
        'changed::panel-position',
        syncPanelAxis
    );
    syncPanelAxis();

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
        if (settings.get_boolean('dock-mode'))
            return id === 'start-button' || id === 'applications';
        if (settings.get_boolean('default-gnome-panel') &&
            !settings.get_boolean('dock-mode'))
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
        const defaultPanel = settings.get_boolean('default-gnome-panel') &&
            !settings.get_boolean('dock-mode');
        const windowsXpTheme = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const dockMode = settings.get_boolean('dock-mode');
        windowsStartMenuSwitch.sensitive = !windowsXpTheme;
        panelOrderRows.get('start-button').row.sensitive = !dockMode;
        panelOrderRows.get('applications').row.sensitive = !dockMode;
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
        'changed::dock-mode',
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
