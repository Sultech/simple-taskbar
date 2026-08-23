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

    const panelAutoHideSwitch = new Adw.SwitchRow({
        title: _('Auto-hide Panel'),
        subtitle: _('Reveal the taskbar when the pointer reaches its screen edge'),
        active: settings.get_boolean('panel-autohide-enabled'),
    });
    behaviorGroup.add(panelAutoHideSwitch);
    settings.bind(
        'panel-autohide-enabled',
        panelAutoHideSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
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

    const hotEdgeOverviewSwitch = new Adw.SwitchRow({
        title: _('Bottom Hot Edge'),
        subtitle: _('Push the pointer against the bottom screen edge to toggle Overview'),
        active: settings.get_boolean(
            'hot-edge-overview-enabled'
        ),
    });
    behaviorGroup.add(hotEdgeOverviewSwitch);
    settings.bind(
        'hot-edge-overview-enabled',
        hotEdgeOverviewSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

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

    const hotEdgeAnimationSwitch = new Adw.SwitchRow({
        title: _('Hot Edge Animation'),
        subtitle: _('Show a ripple when the bottom hot edge activates'),
        active: settings.get_boolean(
            'hot-edge-animation-enabled'
        ),
    });
    settings.bind(
        'hot-edge-animation-enabled',
        hotEdgeAnimationSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    const updateHotEdgeAnimationSwitch = () => {
        hotEdgeAnimationSwitch.sensitive = hotEdgeOverviewSwitch.active;
        hotEdgePressureRow.visible = hotEdgeOverviewSwitch.active;
    };
    hotEdgeOverviewSwitch.connect(
        'notify::active',
        updateHotEdgeAnimationSwitch
    );
    updateHotEdgeAnimationSwitch();

    const workspaceScrollSwitch = new Adw.SwitchRow({
        title: _('Workspace Scroll'),
        subtitle: _('Scroll over empty taskbar space to switch workspaces'),
        active: settings.get_boolean('workspace-scroll-enabled'),
    });
    behaviorGroup.add(workspaceScrollSwitch);
    settings.bind(
        'workspace-scroll-enabled',
        workspaceScrollSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

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

    const panelMenuClickOnlySwitch = new Adw.SwitchRow({
        title: _('Panel Menus Require Click'),
        subtitle: _('Switch between clock, system, and tray menus only when clicked'),
        active: settings.get_boolean('panel-menu-click-only'),
    });
    advancedBehaviorGroup.add(panelMenuClickOnlySwitch);
    settings.bind(
        'panel-menu-click-only',
        panelMenuClickOnlySwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    const notificationBannerSwitch = new Adw.SwitchRow({
        title: _('Taskbar-aligned Notification Banners'),
        subtitle: _('Follow the taskbar edge and the clock position'),
        active: settings.get_boolean(
            'notification-banner-bottom-end'
        ),
    });
    advancedBehaviorGroup.add(notificationBannerSwitch);
    advancedBehaviorGroup.add(hotEdgeAnimationSwitch);
    settings.bind(
        'notification-banner-bottom-end',
        notificationBannerSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

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

    const multiMonitorPanelsSwitch = new Adw.SwitchRow({
        title: _('Show Taskbar on All Monitors'),
        subtitle: _('Show Activities, applications, clock, and system menu on every monitor'),
        active: settings.get_boolean('multi-monitor-panels'),
    });
    behaviorGroup.add(multiMonitorPanelsSwitch);
    settings.bind(
        'multi-monitor-panels',
        multiMonitorPanelsSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
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
