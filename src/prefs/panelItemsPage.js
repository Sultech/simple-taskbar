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
import {
    createShowDesktopButtonOptionsButton,
} from './showDesktopButtonDialog.js';
import {
    addSpinRow,
    createPanelOrderRow,
    createSwitchRow,
} from './preferencesWidgets.js';

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
        title: _('Taskbar Items'),
        description: _('Configure optional taskbar items and the folder menu.'),
    });
    page.add(panelGroup);

    const panelButtonPaddingRow = addSpinRow(
        panelGroup,
        settings,
        {
            key: 'panel-button-padding',
            title: _('Taskbar Button Padding'),
            subtitle: _(
                'Space between taskbar buttons. Use -1 for automatic: Just Perfection’s value when it is configured, otherwise 3 px'
            ),
            lower: -1,
            upper: 20,
        },
        connectSettings
    );
    const syncPanelButtonPaddingSensitivity = () => {
        panelButtonPaddingRow.sensitive =
            !settings.get_boolean('windows-xp-theme-enabled');
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncPanelButtonPaddingSensitivity
    );
    syncPanelButtonPaddingSensitivity();

    const volumeMixerSwitch = createSwitchRow(settings, {
        key: 'volume-mixer-enabled',
        title: _('Application Volume Mixer'),
        subtitle: _('Add per-application volume controls to Quick Settings'),
    });
    panelGroup.add(volumeMixerSwitch);

    const folderMenuLocationRow = new Adw.ActionRow({
        title: _('Folder Menu Location'),
    });
    const chooseFolderButton = new Gtk.Button({
        label: _('Choose…'),
        valign: Gtk.Align.CENTER,
    });
    folderMenuLocationRow.add_suffix(chooseFolderButton);
    folderMenuLocationRow.activatable_widget = chooseFolderButton;
    panelGroup.add(folderMenuLocationRow);

    const updateFolderMenuRow = () => {
        const location = settings.get_string('folder-menu-uri');
        if (location) {
            const file = location.includes('://')
                ? Gio.File.new_for_uri(location)
                : Gio.File.new_for_path(location);
            folderMenuLocationRow.subtitle = file.get_parse_name();
        } else {
            folderMenuLocationRow.subtitle = _('No folder selected');
        }
    };
    chooseFolderButton.connect('clicked', () => {
        selectFolderMenuLocation(window);
    });
    connectSettings(
        settings,
        'changed::folder-menu-uri',
        updateFolderMenuRow
    );
    connectSettings(
        settings,
        'changed::folder-menu-enabled',
        updateFolderMenuRow
    );
    updateFolderMenuRow();

    const applicationsAreVisible = () =>
        !settings.get_boolean('default-gnome-panel') &&
        !(settings.get_boolean('hide-pinned-taskbar-apps') &&
            settings.get_boolean('hide-unpinned-taskbar-apps'));
    const startButtonVisibility = {
        get: () => !settings.get_boolean('default-gnome-panel') &&
            (settings.get_boolean('windows-start-menu-enabled') ||
                settings.get_boolean('gnome-start-button-visible')),
        set: visible => settings.set_boolean(
            'gnome-start-button-visible',
            visible
        ),
        changedKeys: [
            'default-gnome-panel',
            'windows-start-menu-enabled',
            'gnome-start-button-visible',
        ],
    };
    const applicationsVisibility = {
        get: applicationsAreVisible,
        set: visible => {
            const hidden = !visible;
            settings.set_boolean('hide-pinned-taskbar-apps', hidden);
            settings.set_boolean('hide-unpinned-taskbar-apps', hidden);
        },
        changedKeys: [
            'default-gnome-panel',
            'hide-pinned-taskbar-apps',
            'hide-unpinned-taskbar-apps',
        ],
    };
    const systemMenuVisibility = {
        get: () => settings.get_boolean('system-menu-visible') &&
            !settings.get_boolean('windows-xp-theme-enabled'),
        set: visible => settings.set_boolean('system-menu-visible', visible),
        changedKeys: [
            'system-menu-visible',
            'windows-xp-theme-enabled',
        ],
    };
    const initialPositions = axisPanelPositions(settings, panelPositions);
    const panelOrderGroups = new Map([
        ['left', new Adw.PreferencesGroup({
            title: _('Left Items'),
            description: _(
                'Move items only within their current taskbar position.'
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

    const showDesktopOptionsButton =
        createShowDesktopButtonOptionsButton(settings);
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
            visibleState: startButtonVisibility,
            title: _('Start Button'),
            subtitle: _('Eleven-style or original GNOME Start button'),
            choices: initialPositions,
        }],
        ['activities', {
            key: 'activities-button-position',
            visibleKey: 'activities-button-visible',
            title: _('Activities'),
            subtitle: _('GNOME workspace overview button'),
            choices: initialPositions,
        }],
        ['applications', {
            key: 'app-alignment',
            visibleState: applicationsVisibility,
            title: _('Applications'),
            subtitle: _('Taskbar application buttons'),
            choices: initialPositions.slice(0, 2),
        }],
        ['folder-menu', {
            key: 'folder-menu-position',
            visibleKey: 'folder-menu-enabled',
            title: _('Folder Menu'),
            subtitle: _('Selected folder shortcuts'),
            choices: initialPositions,
        }],
        ['tray-overflow', {
            key: 'tray-overflow-position',
            visibleKey: 'tray-overflow-enabled',
            title: _('Tray Icon Arrow'),
            subtitle: _('Gather application tray icons behind a taskbar arrow'),
            choices: initialPositions,
        }],
        ['system-menu', {
            key: 'system-menu-position',
            visibleState: systemMenuVisibility,
            title: _('System Menu'),
            subtitle: _('Quick Settings, volume, network, and power'),
            choices: initialPositions,
        }],
        ['clock', {
            key: 'clock-position',
            visibleKey: 'clock-visible',
            title: _('Clock'),
            choices: initialPositions,
        }],
        ['show-desktop', {
            key: 'show-desktop-button-position',
            visibleKey: 'show-desktop-button-visible',
            title: _('Show Desktop Button'),
            subtitle: _('Minimize or restore all windows'),
            choices: initialPositions.filter(
                position => position.value !== 'center'
            ),
            optionsButton: showDesktopOptionsButton,
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
        panelOrderRows.get('start-button').setChoices(positions);
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
    const syncShowDesktopOptionsButton = () => {
        showDesktopOptionsButton.sensitive =
            !settings.get_boolean('windows-xp-theme-enabled') &&
            settings.get_boolean('show-desktop-button-visible');
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncPanelAxis
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncShowDesktopOptionsButton
    );
    connectSettings(
        settings,
        'changed::show-desktop-button-visible',
        syncShowDesktopOptionsButton
    );
    connectSettings(
        settings,
        'changed::panel-position',
        syncPanelAxis
    );
    syncPanelAxis();
    syncShowDesktopOptionsButton();

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
    const getMovablePositionOrder = positionOrder => {
        if (!settings.get_boolean('dock-mode') &&
            !settings.get_boolean('default-gnome-panel')) {
            return positionOrder;
        }

        return positionOrder.filter(id => !isPanelItemLocked(id));
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
            const movablePositionOrder =
                getMovablePositionOrder(positionOrder);
            for (const [index, id] of movablePositionOrder.entries()) {
                const controls = panelOrderRows.get(id);
                const previousId = movablePositionOrder[index - 1];
                const nextId = movablePositionOrder[index + 1];
                controls.upButton.sensitive =
                    index > 0 &&
                    !isPanelItemLocked(id) &&
                    !isPanelItemLocked(previousId);
                controls.downButton.sensitive =
                    index < movablePositionOrder.length - 1 &&
                    !isPanelItemLocked(id) &&
                    !isPanelItemLocked(nextId);
            }
            for (const id of positionOrder) {
                if (!isPanelItemLocked(id))
                    continue;

                const controls = panelOrderRows.get(id);
                controls.upButton.sensitive = false;
                controls.downButton.sensitive = false;
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
        const positionOrder = getMovablePositionOrder(
            order.filter(
                candidate => getPanelItemPosition(candidate) === position
            )
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
            !followAppAlignmentSwitch.active &&
            startButtonVisibility.get();
        panelOrderRows.get('applications').positionDropDown.sensitive =
            !defaultPanel && !windowsXpTheme && applicationsAreVisible();
        panelOrderRows.get('system-menu').positionDropDown.sensitive =
            !windowsXpTheme && systemMenuVisibility.get();
        panelOrderRows.get('clock').positionDropDown.sensitive =
            !windowsXpTheme && settings.get_boolean('clock-visible');
        panelOrderRows.get('start-button').visibleButton.sensitive =
            !dockMode && !defaultPanel &&
            !settings.get_boolean('windows-start-menu-enabled');
        panelOrderRows.get('applications').visibleButton.sensitive =
            !dockMode && !defaultPanel && !windowsXpTheme;
        panelOrderRows.get('system-menu').visibleButton.sensitive =
            !windowsXpTheme;
        panelOrderRows.get('clock').visibleButton.sensitive =
            !windowsXpTheme;
        panelOrderRows.get('activities').positionDropDown.sensitive =
            settings.get_boolean('activities-button-visible');
        panelOrderRows.get('folder-menu').positionDropDown.sensitive =
            !windowsXpTheme && settings.get_boolean('folder-menu-enabled');
        panelOrderRows.get('tray-overflow').positionDropDown.sensitive =
            !windowsXpTheme && settings.get_boolean('tray-overflow-enabled');
        panelOrderRows.get('show-desktop').positionDropDown.sensitive =
            !windowsXpTheme && settings.get_boolean(
                'show-desktop-button-visible'
            );
    };
    followAppAlignmentSwitch.connect(
        'notify::active',
        () => {
            syncPanelPositionSensitivity();
            syncPanelItemOrder();
        }
    );
    for (const key of [
        'activities-button-visible',
        'folder-menu-enabled',
        'tray-overflow-enabled',
        'show-desktop-button-visible',
        'windows-start-menu-enabled',
        'gnome-start-button-visible',
        'hide-pinned-taskbar-apps',
        'hide-unpinned-taskbar-apps',
        'system-menu-visible',
        'clock-visible',
    ]) {
        connectSettings(
            settings,
            `changed::${key}`,
            syncPanelPositionSensitivity
        );
    }
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
