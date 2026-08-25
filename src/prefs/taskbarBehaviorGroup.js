// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {resolveTaskManagerAppId} from '../shared/taskManagerUtils.js';
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
    advancedBehaviorGroup,
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
    behaviorGroup.add(panelAutoHideSwitch);
    addWindowDodgeRows(
        behaviorGroup,
        settings,
        {
            enabledKey: 'panel-dodge-windows-enabled',
            modeKey: 'panel-dodge-windows-mode',
            pointerRevealKey: 'panel-dodge-pointer-reveal-enabled',
            autohideKey: 'panel-autohide-enabled',
            connectSettings,
        }
    );

    const hotEdgeOverviewSwitch = createSwitchRow(settings, {
        key: 'hot-edge-overview-enabled',
        title: _('Bottom Hot Edge'),
        subtitle: _('Push the pointer against the bottom screen edge to toggle Overview'),
    });
    behaviorGroup.add(hotEdgeOverviewSwitch);

    const hotEdgePressureRow = addSpinRow(
        behaviorGroup,
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
        },
        connectSettings
    );

    const hotEdgeAnimationSwitch = createSwitchRow(settings, {
        key: 'hot-edge-animation-enabled',
        title: _('Hot Edge Animation'),
        subtitle: _('Show a ripple when the bottom hot edge activates'),
    });
    const updateHotEdgeAnimationSwitch = () => {
        hotEdgeAnimationSwitch.sensitive = hotEdgeOverviewSwitch.active;
        hotEdgePressureRow.visible = hotEdgeOverviewSwitch.active;
    };
    hotEdgeOverviewSwitch.connect(
        'notify::active',
        updateHotEdgeAnimationSwitch
    );
    updateHotEdgeAnimationSwitch();

    const workspaceScrollSwitch = createSwitchRow(settings, {
        key: 'workspace-scroll-enabled',
        title: _('Workspace Scroll'),
        subtitle: _('Scroll over empty taskbar space to switch workspaces'),
    });
    behaviorGroup.add(workspaceScrollSwitch);

    const workspaceScrollDelayRow = addSpinRow(
        behaviorGroup,
        settings,
        {
            key: 'workspace-scroll-delay',
            title: _('Workspace Scroll Delay'),
            subtitle: _('Minimum delay between workspace changes in milliseconds'),
            lower: 5,
            upper: 250,
            step: 5,
        },
        connectSettings
    );
    workspaceScrollDelayRow.sensitive = workspaceScrollSwitch.active;
    workspaceScrollSwitch.connect('notify::active', widget => {
        workspaceScrollDelayRow.sensitive = widget.active;
    });

    const panelMenuClickOnlySwitch = createSwitchRow(settings, {
        key: 'panel-menu-click-only',
        title: _('Panel Menus Require Click'),
        subtitle: _('Switch between clock, system, and tray menus only when clicked'),
    });
    advancedBehaviorGroup.add(panelMenuClickOnlySwitch);

    const notificationBannerSwitch = createSwitchRow(settings, {
        key: 'notification-banner-bottom-end',
        title: _('Taskbar-aligned Notification Banners'),
        subtitle: _('Follow the taskbar edge and the clock position'),
    });
    advancedBehaviorGroup.add(notificationBannerSwitch);
    advancedBehaviorGroup.add(hotEdgeAnimationSwitch);

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
        },
        connectSettings
    );
    taskManagerAppRow.expression = Gtk.PropertyExpression.new(
        Gtk.StringObject.$gtype,
        null,
        'string'
    );
    taskManagerAppRow.search_match_mode =
        Gtk.StringFilterMatchMode.SUBSTRING;
    taskManagerAppRow.enable_search = true;

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
