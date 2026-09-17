// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {setPanelAxisProfilesEnabled} from '../shared/panelModeProfiles.js';
import {
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';

export const DOCK_OVERVIEW_BEHAVIOR_KEYS = {
    hideDash: 'dock-hide-dash-enabled',
    launchToDesktop: 'dock-launch-to-desktop-enabled',
};

const PANEL_OVERVIEW_BEHAVIOR_KEYS = {
    hideDash: 'hide-dash-enabled',
    launchToDesktop: 'launch-to-desktop-enabled',
};

export function createOverviewBehaviorButton(
    settings,
    tooltip,
    keys = PANEL_OVERVIEW_BEHAVIOR_KEYS,
    axisProfile = null
) {
    return createPreferencesDialogButton(
        settings,
        tooltip,
        OverviewBehaviorDialog,
        {keys, axisProfile, title: tooltip}
    );
}

export const OverviewBehaviorDialog = GObject.registerClass(
class OverviewBehaviorDialog extends Adw.Window {
    _init({settings, parent, keys, axisProfile, title}) {
        super._init({
            title,
            transient_for: parent,
            modal: true,
            default_width: 560,
            default_height: axisProfile ? 430 : 300,
        });

        this._settings = settings;
        this._keys = keys;
        this._axisProfile = axisProfile;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);
        const overviewGroup = new Adw.PreferencesGroup({
            title: _('Overview'),
            description: _('These options apply to the mode that is currently active'),
        });
        content.append(overviewGroup);

        overviewGroup.add(createSwitchRow(settings, {
            key: keys.hideDash,
            title: _('Hide the Dash'),
            subtitle: _('Hide the Overview Dash while applications are shown on the taskbar or Dock'),
        }));
        overviewGroup.add(createSwitchRow(settings, {
            key: keys.launchToDesktop,
            title: _('Launch to Desktop'),
            subtitle: _('Start the session on the desktop instead of the Overview; applies at the next login'),
        }));

        if (axisProfile) {
            const profileGroup = new Adw.PreferencesGroup({
                title: _('Profiles'),
            });
            content.append(profileGroup);
            const profileRow = new Adw.SwitchRow({
                title: _('Separate Horizontal and Vertical Profiles'),
                subtitle: _('Remember different settings for horizontal and vertical layouts'),
                active: settings.get_boolean(axisProfile.key),
            });
            profileGroup.add(profileRow);

            let syncingProfile = false;
            profileRow.connect('notify::active', () => {
                if (syncingProfile || profileRow.active ===
                    settings.get_boolean(axisProfile.key)) {
                    return;
                }
                setPanelAxisProfilesEnabled(
                    settings,
                    axisProfile.mode,
                    profileRow.active
                );
            });
            connectSettings(
                settings,
                `changed::${axisProfile.key}`,
                () => {
                    syncingProfile = true;
                    profileRow.active = settings.get_boolean(
                        axisProfile.key
                    );
                    syncingProfile = false;
                }
            );
        }
    }

    _reset() {
        this._settings.reset(this._keys.hideDash);
        this._settings.reset(this._keys.launchToDesktop);
        if (this._axisProfile) {
            const {key, mode} = this._axisProfile;
            setPanelAxisProfilesEnabled(
                this._settings,
                mode,
                this._settings.get_default_value(key).deepUnpack()
            );
        }
    }
}
);
