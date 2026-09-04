// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addColorRow,
    addSpinRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';

const SHOW_DESKTOP_BUTTON_SETTINGS = [
    'show-desktop-button-width',
    'show-desktop-button-custom-line-color-enabled',
    'show-desktop-button-custom-line-color',
];

export function createShowDesktopButtonOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Show Desktop Button Options'),
        ShowDesktopButtonOptionsDialog
    );
}

export const ShowDesktopButtonOptionsDialog = GObject.registerClass(
class ShowDesktopButtonOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Show Desktop Button'),
            transient_for: parent,
            modal: true,
            default_width: 560,
            default_height: 360,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);
        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Customize the Show Desktop button'),
        });
        content.append(appearanceGroup);

        addSpinRow(
            appearanceGroup,
            settings,
            {
                key: 'show-desktop-button-width',
                title: _('Button Width'),
                subtitle: _(
                    'Width in pixels; height is used when the taskbar or Dock is vertical'
                ),
                lower: 1,
                upper: 40,
            },
            connectSettings
        );

        const customLineColorSwitch = createSwitchRow(settings, {
            key: 'show-desktop-button-custom-line-color-enabled',
            title: _('Custom Separator Color'),
            subtitle: _('Use a chosen color for the Show Desktop separator'),
        });
        appearanceGroup.add(customLineColorSwitch);

        const customLineColorRow = addColorRow(
            appearanceGroup,
            settings,
            {
                key: 'show-desktop-button-custom-line-color',
                title: _('Separator Color'),
            },
            connectSettings
        );
        const syncCustomLineColor = () => {
            customLineColorRow.sensitive = settings.get_boolean(
                'show-desktop-button-custom-line-color-enabled'
            );
        };
        customLineColorSwitch.connect(
            'notify::active',
            syncCustomLineColor
        );
        connectSettings(
            settings,
            'changed::show-desktop-button-custom-line-color-enabled',
            syncCustomLineColor
        );
        syncCustomLineColor();

    }

    _reset() {
        for (const key of SHOW_DESKTOP_BUTTON_SETTINGS)
            this._settings.reset(key);
    }
}
);
