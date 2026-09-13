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
    keys = PANEL_OVERVIEW_BEHAVIOR_KEYS
) {
    return createPreferencesDialogButton(
        settings,
        tooltip,
        OverviewBehaviorDialog,
        {keys}
    );
}

export const OverviewBehaviorDialog = GObject.registerClass(
class OverviewBehaviorDialog extends Adw.Window {
    _init({settings, parent, keys}) {
        super._init({
            title: _('Overview Behavior'),
            transient_for: parent,
            modal: true,
            default_width: 560,
            default_height: 300,
        });

        this._settings = settings;
        this._keys = keys;
        const {content} = createPreferencesDialogContent(this);
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
    }

    _reset() {
        this._settings.reset(this._keys.hideDash);
        this._settings.reset(this._keys.launchToDesktop);
    }
}
);
