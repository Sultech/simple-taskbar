// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    createPreferencesDialogContent,
    createSwitchRow,
    setButtonIcon,
} from './preferencesWidgets.js';

const PINNED_APPLICATION_BEHAVIOR_SETTINGS = [
    'hide-pinned-taskbar-apps',
    'use-pinned-apps-as-launchers',
    'hide-unpinned-taskbar-apps',
];

export function createPinnedApplicationBehaviorOptionsButton(settings) {
    const button = new Gtk.Button({
        tooltip_text: _('Pinned Application Behavior'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(button, 'emblem-system-symbolic');
    button.add_css_class('flat');
    button.add_css_class('circular');
    button.connect('clicked', () => {
        const dialog = new PinnedApplicationBehaviorOptionsDialog({
            settings,
            parent: button.get_root(),
        });
        dialog.present();
    });
    return button;
}

export const PinnedApplicationBehaviorOptionsDialog = GObject.registerClass(
class PinnedApplicationBehaviorOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Pinned Application Behavior'),
            transient_for: parent,
            modal: true,
            default_width: 560,
            default_height: 360,
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
