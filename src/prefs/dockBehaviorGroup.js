// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {PANEL_SCROLL_ACTION} from '../shared/panelScrollActions.js';
import {getPanelScrollActionChoices} from './taskbarBehaviorGroup.js';
import {
    addComboRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {addWindowDodgeGroup} from './windowDodgeGroup.js';
import {addSliderRow} from './sliderRow.js';
import {DOCK_FLOATING_KEYS, dockFloatingEnabled} from '../shared/taskbarPanelModes.js';

export function addDockBehaviorGroup({visibilityPage, behaviorPage, settings, connectSettings}) {
    const dockAvailable = () => settings.get_boolean('dock-mode') &&
        !settings.get_boolean('windows-xp-theme-enabled');
    const autoHideSwitch = createSwitchRow(settings, {
        key: 'dock-autohide-enabled',
        title: _('Auto-hide Dock'),
        subtitle: _('Reveal the Dock when the pointer reaches its screen edge'),
    });
    const edgeRevealSwitch = createSwitchRow(settings, {
        key: 'dock-edge-reveal-enabled',
        title: _('Limit Reveal to Dock Edge'),
        subtitle: _('Only reveal a floating Dock when the pointer reaches its edge'),
    });
    const dodgeWindows = addWindowDodgeGroup(
        visibilityPage,
        settings,
        {
            enabledKey: 'dock-dodge-windows-enabled',
            modeKey: 'dock-dodge-windows-mode',
            pointerRevealKey: 'dock-dodge-pointer-reveal-enabled',
            autohideKey: 'dock-autohide-enabled',
            autohideSwitch: autoHideSwitch,
            visibilityTitle: _('Dock Auto-hide and Window Dodge'),
            visibilityDescription: _(
                'Choose when the Dock hides and how it is revealed'
            ),
            dodgeSubtitle: _(
                'Hide the Dock when a qualifying window overlaps it'
            ),
            modeSubtitle: _('Choose which windows make the Dock hide'),
            pointerRevealSubtitle: _(
                'Let the pointer reveal the hidden Dock at its screen edge'
            ),
            timingDescriptions: {
                reveal: _(
                    'Choose how quickly the pointer brings the Dock back'
                ),
                revealMode: _(
                    'Choose when the Dock appears at the screen edge'
                ),
                hide: _('Choose how soon the Dock hides again'),
                hideDelay: _(
                    'How long the Dock waits after the pointer leaves, in milliseconds'
                ),
            },
            visibilityRows: [edgeRevealSwitch],
            isAvailable: dockAvailable,
            connectSettings,
        }
    );

    const workspaceScrollGroup = behaviorPage.addGroup({
        title: _('Dock Scroll'),
        description: _('Configure scrolling over empty Dock space'),
    });
    const workspaceScrollActionRow = addComboRow(
        workspaceScrollGroup,
        settings,
        {
            key: 'dock-workspace-scroll-action',
            title: _('Scroll Action'),
            subtitle: _('Action used when scrolling over empty Dock space'),
            choices: getPanelScrollActionChoices(),
        },
        connectSettings
    );

    const workspaceScrollDelayRow = addSliderRow(
        workspaceScrollGroup,
        settings,
        {
            key: 'dock-workspace-scroll-delay',
            unit: 'ms',
            title: _('Scroll Delay'),
            subtitle: _('Minimum delay between Dock scroll actions in milliseconds'),
            lower: 5,
            upper: 250,
            step: 5,
        },
        connectSettings
    );
    const behaviorGroup = behaviorPage.addGroup({
        title: _('Monitors'),
        description: _('Choose which monitors show the Dock'),
    });
    const multiMonitorSwitch = createSwitchRow(settings, {
        key: 'dock-multi-monitor-panels',
        title: _('Show Dock on All Monitors'),
        subtitle: _('Show the Dock on every connected monitor'),
    });
    behaviorGroup.add(multiMonitorSwitch);

    const groups = [dodgeWindows.group, workspaceScrollGroup, behaviorGroup];
    const syncWorkspaceScrollControls = () => {
        const available = dockAvailable();
        workspaceScrollActionRow.sensitive = available;
        workspaceScrollDelayRow.sensitive = available &&
            settings.get_string('dock-workspace-scroll-action') !==
                PANEL_SCROLL_ACTION.DO_NOTHING;
    };
    const syncAvailability = () => {
        const available = dockAvailable();
        for (const group of groups)
            group.sensitive = available;
        edgeRevealSwitch.sensitive = available &&
            (!settings.get_boolean('dock-panel-mode') || dockFloatingEnabled(settings));
        dodgeWindows.syncAvailability();
        syncWorkspaceScrollControls();
    };
    for (const key of [
        'dock-mode',
        ...DOCK_FLOATING_KEYS,
        'windows-xp-theme-enabled',
    ]) {
        connectSettings(settings, `changed::${key}`, syncAvailability);
    }
    connectSettings(
        settings,
        'changed::dock-workspace-scroll-action',
        syncWorkspaceScrollControls
    );
    syncAvailability();
}
