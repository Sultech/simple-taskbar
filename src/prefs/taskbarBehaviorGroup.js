// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {resolveTaskManagerAppId} from '../shared/taskManagerUtils.js';
import {AUTO_HIDE_SETTINGS} from '../shared/autoHideSettings.js';
import {PANEL_SCROLL_ACTION} from '../shared/panelScrollActions.js';
import {TASKBAR_GEOMETRY_KEYS, taskbarGeometryEnabled} from '../shared/taskbarPanelModes.js';
import {
    addComboRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {addWindowDodgeGroup} from './windowDodgeGroup.js';
import {addSliderRow} from './sliderRow.js';

export function getPanelScrollActionChoices() {
    return [
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
    ];
}

export function addTaskbarBehaviorGroup({
    visibilityPage,
    behaviorPage,
    settings,
    connectSettings,
    isolateMonitorsSwitch,
}) {
    const panelAutoHideSwitch = createSwitchRow(settings, {
        key: 'panel-autohide-enabled',
        title: _('Auto-hide Taskbar'),
        subtitle: _('Reveal the taskbar when the pointer reaches its screen edge'),
    });
    addWindowDodgeGroup(
        visibilityPage,
        settings,
        {
            enabledKey: 'panel-dodge-windows-enabled',
            modeKey: 'panel-dodge-windows-mode',
            pointerRevealKey: 'panel-dodge-pointer-reveal-enabled',
            autohideKey: 'panel-autohide-enabled',
            autoHideKeys: AUTO_HIDE_SETTINGS,
            positionKey: 'panel-position',
            autohideSwitch: panelAutoHideSwitch,
            visibilityTitle: _('Taskbar Auto-hide and Window Dodge'),
            visibilityDescription: _(
                'Choose when the taskbar hides and how it is revealed'
            ),
            dodgeSubtitle: _(
                'Hide the taskbar when a qualifying window overlaps it'
            ),
            modeSubtitle: _(
                'Choose which windows make the taskbar hide'
            ),
            pointerRevealSubtitle: _(
                'Let the pointer reveal the hidden taskbar at its screen edge'
            ),
            timingDescriptions: {
                reveal: _(
                    'Choose how quickly the pointer brings the taskbar back'
                ),
                revealMode: _(
                    'Choose when the taskbar appears at the screen edge'
                ),
                hide: _('Choose how soon the taskbar hides again'),
                hideDelay: _(
                    'How long the taskbar waits after the pointer leaves, in milliseconds'
                ),
            },
            edgeReveal: {
                key: 'edge-reveal-enabled',
                title: _('Limit Reveal to Taskbar Edge'),
                subtitle: _('Only reveal a dynamic or floating taskbar when the pointer reaches its edge'),
                isAvailable: () => taskbarGeometryEnabled(settings),
                changedKeys: TASKBAR_GEOMETRY_KEYS,
            },
            connectSettings,
        }
    );

    const workspaceScrollGroup = behaviorPage.addGroup({
        title: _('Taskbar Scroll'),
        description: _('Configure scrolling over empty taskbar space'),
    });
    addComboRow(
        workspaceScrollGroup,
        settings,
        {
            key: 'workspace-scroll-action',
            title: _('Scroll Action'),
            subtitle: _('Action used when scrolling over empty taskbar space'),
            choices: getPanelScrollActionChoices(),
        },
        connectSettings
    );

    const workspaceScrollDelayRow = addSliderRow(
        workspaceScrollGroup,
        settings,
        {
            key: 'workspace-scroll-delay',
            unit: 'ms',
            title: _('Scroll Delay'),
            subtitle: _('Minimum delay between taskbar scroll actions in milliseconds'),
            lower: 5,
            upper: 250,
            step: 5,
        },
        connectSettings
    );
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

    const panelNotificationGroup = behaviorPage.addGroup({
        title: _('Taskbar Menus and Notifications'),
        description: _(
            'Configure taskbar menu activation and notification banner placement'
        ),
    });
    const panelMenuClickOnlySwitch = createSwitchRow(settings, {
        key: 'panel-menu-click-only',
        title: _('Taskbar Menus Require Click'),
        subtitle: _('Switch between clock, system, and tray menus only when clicked'),
    });
    panelNotificationGroup.add(panelMenuClickOnlySwitch);

    const notificationBannerSwitch = createSwitchRow(settings, {
        key: 'notification-banner-bottom-end',
        title: _('Taskbar-aligned Notification Banners'),
        subtitle: _('Follow the taskbar edge and the clock position'),
    });
    panelNotificationGroup.add(notificationBannerSwitch);

    const behaviorGroup = behaviorPage.addGroup({
        title: _('Taskbar Behavior'),
        description: _('Choose the task manager and which monitors show the taskbar'),
    });

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
    addComboRow(
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
