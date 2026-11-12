// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {panelApplicationSettings} from '../shared/defaultPanelWindowSettings.js';
import {defaultPanelWindowsEnabled, panelApplicationsVisible} from '../shared/panelApplicationVisibility.js';

import {isDefaultPanelWithoutDock} from '../shared/panelModeProfiles.js';
import {startButtonVisible} from '../shared/startButtonLocation.js';
import {
    PANEL_BUTTON_PADDING_KEYS,
    START_BUTTON_LOCATION_KEY,
    dynamicTaskbarEnabled,
    panelApplicationAlignment,
    panelButtonCornerRadiusKey,
    panelButtonsFollowAppHighlightKey,
    panelButtonPaddingKey,
    startButtonAlignmentKey,
    startButtonInPanel,
} from '../shared/panelModeSettings.js';
import {
    DEFAULT_PANEL_ITEM_ORDER,
    normalizePanelItemOrder,
    swapItemOrderNeighbour,
} from '../shared/panelItemOrder.js';
import {selectFolderMenuLocation} from './preferencesDialogs.js';
import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {axisPanelPositions} from './panelPositionChoices.js';
import {addItemOrderGroups, connectItemMoveButtons, syncItemOrderRows} from './panelItemOrderRows.js';
import {
    createShowDesktopButtonOptionsButton,
} from './showDesktopButtonDialog.js';
import {createClockOptionsButton} from './clockDialog.js';
import {createFocusedAppOptionsButton} from './focusedAppDialog.js';
import {
    createStartButtonOptionsButton,
} from './startButtonDialog.js';
import {
    addSpinRow,
    addSwitchRow,
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
            getKey: () => panelButtonPaddingKey(settings),
            changedKeys: [
                ...PANEL_BUTTON_PADDING_KEYS,
                'taskbar-dynamic',
            ],
            title: _('Taskbar Button Padding'),
            subtitle: _(
                'Space between taskbar buttons. Use -1 for automatic: Just Perfection’s value when it is configured, otherwise 3 px'
            ),
            lower: -1,
            upper: 20,
        },
        connectSettings
    );
    const quickSettingsIconSpacingRow = addSpinRow(
        panelGroup,
        settings,
        {
            key: 'quick-settings-icon-spacing',
            title: _('Quick Settings Icon Spacing'),
            subtitle: _(
                'Space between the Quick Settings status icons. Use -1 for the GNOME default'
            ),
            lower: -1,
            upper: 20,
        },
        connectSettings
    );
    const panelButtonCornerRadiusRow = addSpinRow(
        panelGroup,
        settings,
        {
            getKey: () => panelButtonCornerRadiusKey(settings),
            changedKeys: [
                'panel-button-corner-radius',
                'default-panel-button-corner-radius',
                'default-gnome-panel',
            ],
            title: _('Taskbar Buttons Corner Radius'),
            subtitle: _(
                'Rounding of the clock, Quick Settings and other taskbar item highlights. Use -1 for the theme default'
            ),
            lower: -1,
            upper: 16,
        },
        connectSettings
    );
    const followAppHighlightSwitch = createSwitchRow(settings, {
        getKey: () => panelButtonsFollowAppHighlightKey(settings),
        keyChangedKey: 'default-gnome-panel',
        title: _('Match Application Highlight'),
        subtitle: _(
            'Give the clock, Quick Settings and extension indicators the hover highlight style, size and corner radius of application icons'
        ),
    }, connectSettings);
    panelGroup.add(followAppHighlightSwitch);
    const syncPanelButtonPaddingSensitivity = () => {
        const enabled = !settings.get_boolean('windows-xp-theme-enabled');
        panelButtonPaddingRow.sensitive = enabled;
        quickSettingsIconSpacingRow.sensitive = enabled;
        followAppHighlightSwitch.sensitive = enabled;
        panelButtonCornerRadiusRow.sensitive = enabled &&
            !settings.get_boolean(panelButtonsFollowAppHighlightKey(settings));
    };
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncPanelButtonPaddingSensitivity
    );
    for (const key of [
        'panel-buttons-follow-app-highlight',
        'default-panel-buttons-follow-app-highlight',
        'default-gnome-panel',
    ])
        connectSettings(settings, `changed::${key}`, syncPanelButtonPaddingSensitivity);
    syncPanelButtonPaddingSensitivity();

    const modulesExpander = new Adw.ExpanderRow({
        title: _('Modules'),
        subtitle: _('Optional features you can turn on or off'),
    });
    panelGroup.add(modulesExpander);
    const moduleRows = {add: row => modulesExpander.add_row(row)};
    for (const module of [
        {
            key: 'tray-overflow-enabled',
            title: _('Tray Icon Arrow'),
            subtitle: _('Gather application tray icons behind a taskbar arrow'),
        },
        {
            key: 'volume-mixer-enabled',
            title: _('Application Volume Mixer'),
            subtitle: _('Add per-application volume controls to Quick Settings'),
        },
    ])
        addSwitchRow(moduleRows, settings, module);
    const {row: focusedAppModuleRow} = addSwitchRow(moduleRows, settings, {
        key: 'focused-app-visible',
        title: _('Focused Application'),
        subtitle: _('Icon and name of the application in focus'),
    });
    addSwitchRow(moduleRows, settings, {
        key: 'folder-menu-enabled',
        title: _('Folder Menu'),
        subtitle: _('Selected folder shortcuts'),
    });

    const folderMenuLocationRow = new Adw.ActionRow({
        title: _('Folder Menu Location'),
    });
    const chooseFolderButton = new Gtk.Button({
        label: _('Choose…'),
        valign: Gtk.Align.CENTER,
    });
    folderMenuLocationRow.add_suffix(chooseFolderButton);
    folderMenuLocationRow.activatable_widget = chooseFolderButton;
    modulesExpander.add_row(folderMenuLocationRow);

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

    const applicationsAreVisible = () => panelApplicationsVisible(settings, false);
    const startButtonVisibility = {
        get: () => startButtonVisible(settings),
        set: visible => settings.set_boolean(
            'gnome-start-button-visible',
            visible
        ),
        changedKeys: [
            'default-gnome-panel',
            'windows-start-menu-enabled',
            'gnome-start-button-visible',
            START_BUTTON_LOCATION_KEY,
        ],
    };
    const applicationsVisibility = {
        get: applicationsAreVisible,
        set: visible => {
            if (settings.get_boolean('default-gnome-panel')) {
                settings.set_boolean('default-panel-show-running-windows', visible);
                return;
            }
            const hidden = !visible;
            settings.set_boolean('hide-pinned-taskbar-apps', hidden);
            settings.set_boolean('hide-unpinned-taskbar-apps', hidden);
        },
        changedKeys: [
            'default-gnome-panel',
            'default-panel-show-running-windows',
            'panel-position',
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
    const initialPositions = axisPanelPositions(settings.get_string('panel-position'), panelPositions);
    const panelOrderGroups = addItemOrderGroups(
        page,
        _('Move items only within their current taskbar position.')
    );

    const showDesktopOptionsButton =
        createShowDesktopButtonOptionsButton(settings);
    const startButtonOptionsButton =
        createStartButtonOptionsButton(settings);
    const clockOptionsButton = createClockOptionsButton(settings);
    const focusedAppOptionsButton = createFocusedAppOptionsButton(settings);
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
            positionState: {
                get: () => settings.get_string(startButtonAlignmentKey(settings, 'start-button-position')),
                set: value => settings.set_string(startButtonAlignmentKey(settings, 'start-button-position'), value),
                changedKeys: ['start-button-position', 'default-panel-start-button-position',
                    START_BUTTON_LOCATION_KEY, 'default-gnome-panel'],
            },
            visibleState: startButtonVisibility,
            title: _('Start Button'),
            subtitle: _('Eleven-style or original GNOME Start button'),
            choices: initialPositions,
            optionsButton: startButtonOptionsButton,
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
            positionState: {
                get: () => panelApplicationAlignment(panelApplicationSettings(settings)),
                set: value => panelApplicationSettings(settings).set_string('app-alignment', value),
                changedKeys: ['taskbar-dynamic', 'app-alignment', 'default-panel-window-app-alignment',
                    'default-gnome-panel', 'default-panel-show-running-windows', 'panel-position'],
            },
            visibleState: applicationsVisibility,
            title: _('Applications'),
            subtitle: _('Taskbar applications'),
            choices: initialPositions.slice(0, 2),
        }],
        ['focused-app', {
            key: 'focused-app-position',
            visibleKey: 'focused-app-visible',
            title: _('Focused Application'),
            subtitle: _('Icon and name of the application in focus'),
            choices: initialPositions,
            optionsButton: focusedAppOptionsButton,
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
            optionsButton: clockOptionsButton,
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
        const positions = axisPanelPositions(settings.get_string('panel-position'), panelPositions);
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
            'focused-app',
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
        if (dynamicTaskbarEnabled(settings) &&
            (id === 'applications' || id === 'start-button')) {
            return 'center';
        }
        const definition = panelOrderDefinitions.get(id);
        if (definition.fixedPosition)
            return definition.fixedPosition;

        if (id === 'start-button' &&
            followAppAlignmentSwitch.active) {
            return getPanelItemPosition('applications');
        }

        return definition.positionState
            ? definition.positionState.get()
            : settings.get_string(definition.key);
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
        if (id === 'applications' && defaultPanelWindowsEnabled(settings))
            return false;
        if (id === 'start-button' && startButtonInPanel(settings))
            return false;
        if (settings.get_boolean('dock-mode'))
            return id === 'start-button' || id === 'applications';
        if (isDefaultPanelWithoutDock(settings))
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
        const positionOrders = syncItemOrderRows(settings, {
            key: 'panel-item-order',
            normalizeOrder: normalizePanelItemOrder,
            rows: panelOrderRows,
            groups: panelOrderGroups,
            getPosition: getPanelItemPosition,
            syncPosition: (controls, position) => controls.syncPosition(position),
        });
        if (!positionOrders)
            return;

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
        const swapped = swapItemOrderNeighbour(order, positionOrder, id, offset,
            otherId => !isPanelItemLocked(otherId));
        if (swapped)
            settings.set_strv('panel-item-order', swapped);
    };
    connectItemMoveButtons(panelOrderRows, movePanelItem);
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
        const defaultPanel = isDefaultPanelWithoutDock(settings);
        const windowsXpTheme = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const dockMode = settings.get_boolean('dock-mode');
        const runningWindows = defaultPanelWindowsEnabled(settings);
        const startInPanel = startButtonInPanel(settings);
        windowsStartMenuSwitch.sensitive = !windowsXpTheme;
        panelOrderRows.get('start-button').row.sensitive = !dockMode || startInPanel;
        panelOrderRows.get('applications').row.sensitive = !dockMode || runningWindows;
        panelOrderRows.get('start-button').positionDropDown.sensitive =
            (startInPanel || !defaultPanel) && !windowsXpTheme && !dynamicTaskbarEnabled(settings) &&
            !followAppAlignmentSwitch.active &&
            startButtonVisibility.get();
        panelOrderRows.get('applications').positionDropDown.sensitive =
            (!defaultPanel || runningWindows) && !windowsXpTheme &&
            !dynamicTaskbarEnabled(settings) && applicationsAreVisible();
        panelOrderRows.get('system-menu').positionDropDown.sensitive =
            !windowsXpTheme && systemMenuVisibility.get();
        const clockActive = !windowsXpTheme && settings.get_boolean('clock-visible');
        panelOrderRows.get('clock').positionDropDown.sensitive = clockActive;
        clockOptionsButton.sensitive = clockActive;
        panelOrderRows.get('start-button').visibleButton.sensitive =
            (startInPanel || (!dockMode && !defaultPanel)) &&
            !settings.get_boolean('windows-start-menu-enabled');
        startButtonOptionsButton.sensitive = !windowsXpTheme;
        panelOrderRows.get('applications').visibleButton.sensitive =
            (runningWindows || (!dockMode && !defaultPanel)) && !windowsXpTheme;
        panelOrderRows.get('system-menu').visibleButton.sensitive =
            !windowsXpTheme;
        panelOrderRows.get('clock').visibleButton.sensitive =
            !windowsXpTheme;
        panelOrderRows.get('activities').positionDropDown.sensitive =
            settings.get_boolean('activities-button-visible');
        panelOrderRows.get('folder-menu').positionDropDown.sensitive =
            !windowsXpTheme && settings.get_boolean('folder-menu-enabled');
        const focusedAppAvailable = !windowsXpTheme && !panelIsVertical(settings);
        const focusedAppVisible = focusedAppAvailable && settings.get_boolean('focused-app-visible');
        focusedAppModuleRow.sensitive = focusedAppAvailable;
        panelOrderRows.get('focused-app').visibleButton.sensitive = focusedAppAvailable;
        panelOrderRows.get('focused-app').positionDropDown.sensitive = focusedAppVisible;
        focusedAppOptionsButton.sensitive = focusedAppVisible;
        panelOrderRows.get('tray-overflow').positionDropDown.sensitive =
            !windowsXpTheme && settings.get_boolean('tray-overflow-enabled');
        panelOrderRows.get('show-desktop').positionDropDown.sensitive =
            !windowsXpTheme && settings.get_boolean(
                'show-desktop-button-visible'
            );
    };
    connectSettings(settings, 'changed::taskbar-dynamic', () => {
        syncPanelPositionSensitivity();
        syncPanelItemOrder();
    });
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
        'focused-app-visible',
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
    for (const key of [
        'default-panel-show-running-windows',
        'default-panel-window-app-alignment',
        'panel-position',
        START_BUTTON_LOCATION_KEY,
        'default-panel-start-button-position',
    ]) {
        connectSettings(settings, `changed::${key}`, () => {
            syncPanelItemOrder();
            syncPanelPositionSensitivity();
        });
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
