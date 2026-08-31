// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {resolveTaskManagerAppId} from '../shared/taskManagerUtils.js';
import {PANEL_SCROLL_ACTION} from '../shared/panelScrollActions.js';
import {
    addComboRow,
    addSpinRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {addWindowDodgeRows} from './windowDodgeGroup.js';

export function addTaskbarBehaviorGroup({
    page,
    settings,
    connectSettings,
    isolateMonitorsSwitch,
}) {
    const behaviorGroup = new Adw.PreferencesGroup({
        title: _('Taskbar Behavior'),
    });
    page.add(behaviorGroup);

    const panelAutoHideSwitch = createSwitchRow(settings, {
        key: 'panel-autohide-enabled',
        title: _('Auto-hide Panel'),
        subtitle: _('Reveal the taskbar when the pointer reaches its screen edge'),
    });
    addWindowDodgeRows(
        behaviorGroup,
        settings,
        {
            enabledKey: 'panel-dodge-windows-enabled',
            modeKey: 'panel-dodge-windows-mode',
            pointerRevealKey: 'panel-dodge-pointer-reveal-enabled',
            autohideKey: 'panel-autohide-enabled',
            autohideSwitch: panelAutoHideSwitch,
            visibilitySubtitle: _(
                'Choose when the taskbar hides and how it is revealed'
            ),
            visibilityRows: [],
            connectSettings,
        }
    );

    const hotEdgeRow = new Adw.ExpanderRow({
        title: _('Bottom Hot Edge'),
        subtitle: _(
            'Push the pointer against the bottom screen edge to toggle Overview'
        ),
    });
    const hotEdgeOverviewSwitch = createSwitchRow(settings, {
        key: 'hot-edge-overview-enabled',
        title: _('Enable Bottom Hot Edge'),
        subtitle: _(
            'Push the pointer against the bottom screen edge to toggle Overview'
        ),
    });
    hotEdgeRow.add_row(hotEdgeOverviewSwitch);

    const hotEdgePressureRow = addSpinRow(
        hotEdgeRow,
        settings,
        {
            key: 'hot-edge-pressure-threshold',
            title: _('Activation Pressure'),
            subtitle: _(
                'Pixels the pointer must travel past the bottom edge before Overview activates'
            ),
            lower: 0,
            upper: 500,
            step: 25,
            addRow: row => hotEdgeRow.add_row(row),
        },
        connectSettings
    );

    const hotEdgeAnimationSwitch = createSwitchRow(settings, {
        key: 'hot-edge-animation-enabled',
        title: _('Hot Edge Animation'),
        subtitle: _('Show a ripple when the bottom hot edge activates'),
    });
    hotEdgeRow.add_row(hotEdgeAnimationSwitch);
    const syncHotEdgeControls = () => {
        hotEdgeAnimationSwitch.sensitive = hotEdgeOverviewSwitch.active;
        hotEdgePressureRow.sensitive = hotEdgeOverviewSwitch.active;
    };
    hotEdgeOverviewSwitch.connect(
        'notify::active',
        syncHotEdgeControls
    );
    syncHotEdgeControls();
    behaviorGroup.add(hotEdgeRow);

    const workspaceScrollRow = new Adw.ExpanderRow({
        title: _('Taskbar Scroll'),
        subtitle: _('Choose what happens when scrolling over the taskbar'),
    });
    const workspaceScrollActionRow = addComboRow(
        workspaceScrollRow,
        settings,
        {
            key: 'workspace-scroll-action',
            title: _('Scroll Action'),
            subtitle: _('Action used when scrolling over empty taskbar space'),
            choices: [
                {
                    value: PANEL_SCROLL_ACTION.SWITCH_WORKSPACE,
                    label: _('Switch Workspace'),
                },
                {
                    value: PANEL_SCROLL_ACTION.CYCLE_WINDOWS,
                    label: _('Cycle Windows'),
                },
                {
                    value: PANEL_SCROLL_ACTION.CHANGE_VOLUME,
                    label: _('Change Volume'),
                },
                {
                    value: PANEL_SCROLL_ACTION.DO_NOTHING,
                    label: _('Do Nothing'),
                },
            ],
            addRow: row => workspaceScrollRow.add_row(row),
        },
        connectSettings
    );

    const workspaceScrollDelayRow = addSpinRow(
        workspaceScrollRow,
        settings,
        {
            key: 'workspace-scroll-delay',
            title: _('Scroll Delay'),
            subtitle: _('Minimum delay between taskbar scroll actions in milliseconds'),
            lower: 5,
            upper: 250,
            step: 5,
            addRow: row => workspaceScrollRow.add_row(row),
        },
        connectSettings
    );
    behaviorGroup.add(workspaceScrollRow);
    const syncWorkspaceScrollDelaySensitivity = () => {
        workspaceScrollDelayRow.sensitive =
            settings.get_string('workspace-scroll-action') !==
            PANEL_SCROLL_ACTION.DO_NOTHING;
    };
    connectSettings(
        settings,
        'changed::workspace-scroll-action',
        syncWorkspaceScrollDelaySensitivity
    );
    syncWorkspaceScrollDelaySensitivity();

    const panelNotificationRow = new Adw.ExpanderRow({
        title: _('Panel and Notification Behavior'),
        subtitle: _('Configure panel menus and notification banners'),
    });
    const panelMenuClickOnlySwitch = createSwitchRow(settings, {
        key: 'panel-menu-click-only',
        title: _('Panel Menus Require Click'),
        subtitle: _('Switch between clock, system, and tray menus only when clicked'),
    });
    panelNotificationRow.add_row(panelMenuClickOnlySwitch);

    const notificationBannerSwitch = createSwitchRow(settings, {
        key: 'notification-banner-bottom-end',
        title: _('Taskbar-aligned Notification Banners'),
        subtitle: _('Follow the taskbar edge and the clock position'),
    });
    panelNotificationRow.add_row(notificationBannerSwitch);
    behaviorGroup.add(panelNotificationRow);

    const allTaskManagerApps = Gio.AppInfo.get_all();
    const taskManagerApps = allTaskManagerApps
        .filter(app => app.should_show() && app.get_id())
        .map(app => ({
            value: app.get_id(),
            label: app.get_display_name() ?? app.get_name() ?? app.get_id(),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    const configuredTaskManager = settings.get_string(
        'task-manager-app'
    );
    const availableTaskManagerIds = new Set(
        allTaskManagerApps
            .map(app => app.get_id())
            .filter(Boolean)
    );
    const effectiveTaskManager = resolveTaskManagerAppId(
        configuredTaskManager,
        availableTaskManagerIds
    );
    if (!taskManagerApps.some(app =>
        app.value === configuredTaskManager)) {
        taskManagerApps.unshift({
            value: configuredTaskManager,
            label: _('Automatic Fallback'),
        });
    }
    const taskManagerAppRow = addComboRow(
        behaviorGroup,
        settings,
        {
            key: 'task-manager-app',
            title: _('Task Manager Application'),
            subtitle: _('Application opened from the taskbar context menu'),
            choices: taskManagerApps,
            initialValue: effectiveTaskManager ?? configuredTaskManager,
            configureDropDown: dropDown => {
                dropDown.expression = Gtk.PropertyExpression.new(
                    Gtk.StringObject.$gtype,
                    null,
                    'string'
                );
                dropDown.search_match_mode =
                    Gtk.StringFilterMatchMode.SUBSTRING;
                dropDown.enable_search = true;
            },
        },
        connectSettings
    );

    const multiMonitorPanelsSwitch = createSwitchRow(settings, {
        key: 'multi-monitor-panels',
        title: _('Show Taskbar on All Monitors'),
        subtitle: _('Show Activities, applications, clock, and system menu on every monitor'),
    });
    behaviorGroup.add(multiMonitorPanelsSwitch);
    const syncMonitorIsolationSensitivity = () => {
        isolateMonitorsSwitch.sensitive =
            settings.get_boolean('multi-monitor-panels');
    };
    connectSettings(
        settings,
        'changed::multi-monitor-panels',
        syncMonitorIsolationSensitivity
    );
    syncMonitorIsolationSensitivity();
}
