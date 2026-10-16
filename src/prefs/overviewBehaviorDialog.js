// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DefaultPanelWindowSettings} from '../shared/defaultPanelWindowSettings.js';
import {PANEL_MODE_DEFAULT, setPanelAxisProfilesEnabled} from '../shared/panelModeProfiles.js';
import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {createApplicationGroupingOptionsButton} from './applicationGroupingDialog.js';

import {
    addSwitchRow,
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
            default_height: axisProfile && axisProfile.mode === PANEL_MODE_DEFAULT
                ? 580 : axisProfile ? 430 : 300,
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

        const hideDashRow = createSwitchRow(settings, {
            key: keys.hideDash,
            title: _('Hide the Dash'),
            subtitle: _('Hide the Overview Dash while applications are shown on the taskbar or Dock'),
        });
        overviewGroup.add(hideDashRow);
        const launchToDesktopRow = createSwitchRow(settings, {
            key: keys.launchToDesktop,
            title: _('Launch to Desktop'),
            subtitle: _('Start the session on the desktop instead of the Overview; applies at the next login'),
        });
        overviewGroup.add(launchToDesktopRow);

        if (axisProfile && axisProfile.mode === PANEL_MODE_DEFAULT) {
            const windowsGroup = new Adw.PreferencesGroup({
                title: _('Running Windows'),
            });
            content.append(windowsGroup);
            const labelOptionsButton = createApplicationGroupingOptionsButton(new DefaultPanelWindowSettings(settings), true);
            const {row: windowsRow, toggle: windowsToggle} = addSwitchRow(windowsGroup, settings, {
                key: 'default-panel-show-running-windows',
                title: _('Show Running Windows'),
                subtitle: _('Show running windows with labels on horizontal default panels'),
                addSuffix: row => row.add_suffix(labelOptionsButton),
            });
            const syncOverviewOptions = () => {
                const available = !settings.get_boolean('dock-mode');
                hideDashRow.sensitive = available;
                launchToDesktopRow.sensitive = available;
            };
            connectSettings(settings, 'changed::dock-mode', syncOverviewOptions);
            syncOverviewOptions();
            const syncWindowsOptions = () => {
                windowsRow.sensitive = settings.get_boolean('default-gnome-panel') &&
                    !panelIsVertical(settings);
                labelOptionsButton.sensitive = windowsToggle.active;
            };
            for (const key of ['default-gnome-panel', 'default-panel-show-running-windows', 'panel-position'])
                connectSettings(settings, `changed::${key}`, syncWindowsOptions);
            syncWindowsOptions();
        }

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
        if (this._axisProfile && this._axisProfile.mode === PANEL_MODE_DEFAULT)
            this._settings.reset('default-panel-show-running-windows');
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
