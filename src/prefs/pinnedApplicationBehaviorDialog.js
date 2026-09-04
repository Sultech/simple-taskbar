// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';

const PINNED_APPLICATION_BEHAVIOR_SETTINGS = [
    'super-number-keybindings-enabled',
    'hide-pinned-taskbar-apps',
    'hide-pinned-secondary-monitors',
    'use-pinned-apps-as-launchers',
    'hide-unpinned-taskbar-apps',
];

export function createPinnedApplicationBehaviorOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Pinned Application Behavior'),
        PinnedApplicationBehaviorOptionsDialog
    );
}

export const PinnedApplicationBehaviorOptionsDialog = GObject.registerClass(
class PinnedApplicationBehaviorOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Pinned Application Behavior'),
            transient_for: parent,
            modal: true,
            default_width: 560,
            default_height: 500,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);
        const applicationsGroup = new Adw.PreferencesGroup({
            title: _('Pinned and Running Applications'),
            description: _('Control which applications appear on the taskbar'),
        });
        content.append(applicationsGroup);

        const hidePinnedAppsSwitch = createSwitchRow(settings, {
            key: 'hide-pinned-taskbar-apps',
            title: _('Hide Pinned Applications'),
            subtitle: _(
                'Show pinned taskbar applications only while they are running'
            ),
        });
        applicationsGroup.add(hidePinnedAppsSwitch);

        const hidePinnedSecondarySwitch = createSwitchRow(settings, {
            key: 'hide-pinned-secondary-monitors',
            title: _('Hide Pinned Applications on Secondary Monitors'),
            subtitle: _(
                'Show pinned applications only on the primary monitor'
            ),
        });
        applicationsGroup.add(hidePinnedSecondarySwitch);

        const hideUnpinnedAppsSwitch = createSwitchRow(settings, {
            key: 'hide-unpinned-taskbar-apps',
            title: _('Hide Unpinned Applications'),
            subtitle: _(
                'Show only pinned applications and their running windows'
            ),
        });
        applicationsGroup.add(hideUnpinnedAppsSwitch);

        const pinnedAppsAsLaunchersSwitch = createSwitchRow(settings, {
            key: 'use-pinned-apps-as-launchers',
            title: _('Use Pinned Apps as Application Launchers'),
            subtitle: _(
                'Keep pinned applications as launchers and show running applications separately'
            ),
        });
        applicationsGroup.add(pinnedAppsAsLaunchersSwitch);
        applicationsGroup.add(createSwitchRow(settings, {
            key: 'super-number-keybindings-enabled',
            title: _('Super+Number Shortcuts'),
            subtitle: _('Open pinned applications with Super+1 through Super+9'),
        }));

        const syncApplicationBehaviorSensitivity = () => {
            const enabled = !settings.get_boolean('windows-xp-theme-enabled');
            pinnedAppsAsLaunchersSwitch.sensitive = enabled;
            hideUnpinnedAppsSwitch.sensitive = enabled;
        };
        connectSettings(
            settings,
            'changed::windows-xp-theme-enabled',
            syncApplicationBehaviorSensitivity
        );
        syncApplicationBehaviorSensitivity();
    }

    _reset() {
        for (const key of PINNED_APPLICATION_BEHAVIOR_SETTINGS)
            this._settings.reset(key);
    }
}
);
