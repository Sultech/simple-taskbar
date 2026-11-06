// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DOCK_AUTO_HIDE_SETTINGS} from '../shared/autoHideSettings.js';
import {addPanelScrollGroup} from './panelPreferenceRows.js';
import {createSwitchRow} from './preferencesWidgets.js';
import {addWindowDodgeGroup} from './windowDodgeGroup.js';
import {DOCK_FLOATING_KEYS, dockFloatingEnabled} from '../shared/panelModeSettings.js';

export function addDockBehaviorGroup({visibilityPage, behaviorPage, settings, connectSettings}) {
    const dockAvailable = () => settings.get_boolean('dock-mode') &&
        !settings.get_boolean('windows-xp-theme-enabled');
    const autoHideSwitch = createSwitchRow(settings, {
        key: 'dock-autohide-enabled',
        title: _('Auto-hide Dock'),
        subtitle: _('Reveal the Dock when the pointer reaches its screen edge'),
    });
    const dodgeWindows = addWindowDodgeGroup(
        visibilityPage,
        settings,
        {
            enabledKey: 'dock-dodge-windows-enabled',
            modeKey: 'dock-dodge-windows-mode',
            pointerRevealKey: 'dock-dodge-pointer-reveal-enabled',
            autohideKey: 'dock-autohide-enabled',
            autoHideKeys: DOCK_AUTO_HIDE_SETTINGS,
            positionKey: 'dock-position',
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
            edgeReveal: {
                key: 'dock-edge-reveal-enabled',
                title: _('Limit Reveal to Dock Edge'),
                subtitle: _('Only reveal a floating Dock when the pointer reaches its edge'),
                isAvailable: () => !settings.get_boolean('dock-panel-mode') || dockFloatingEnabled(settings),
                changedKeys: DOCK_FLOATING_KEYS,
            },
            isAvailable: dockAvailable,
            connectSettings,
        }
    );

    const workspaceScroll = addPanelScrollGroup(behaviorPage, settings, connectSettings, {
        title: _('Dock Scroll'),
        description: _('Configure scrolling over empty Dock space'),
        actionKey: 'dock-workspace-scroll-action',
        actionSubtitle: _('Action used when scrolling over empty Dock space'),
        delayKey: 'dock-workspace-scroll-delay',
        delaySubtitle: _('Minimum delay between Dock scroll actions in milliseconds'),
        isAvailable: dockAvailable,
    });
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

    const groups = [dodgeWindows.group, workspaceScroll.group, behaviorGroup];
    const syncAvailability = () => {
        const available = dockAvailable();
        for (const group of groups)
            group.sensitive = available;
        dodgeWindows.syncAvailability();
        workspaceScroll.sync();
    };
    for (const key of [
        'dock-mode',
        ...DOCK_FLOATING_KEYS,
        'windows-xp-theme-enabled',
    ]) {
        connectSettings(settings, `changed::${key}`, syncAvailability);
    }
    syncAvailability();
}
