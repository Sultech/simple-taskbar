// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    CLASSIC_HIGHLIGHT_SETTINGS,
    CLASSIC_HIGHLIGHT_SETTING_KEYS,
} from '../shared/classicHighlightSettings.js';
import {
    addColorRow,
    addSpinRow,
    createPreferencesDialogContent,
    createSwitchRow,
    setButtonIcon,
} from './preferencesWidgets.js';

export function createClassicHighlightOptionsButton(settings) {
    const button = new Gtk.Button({
        tooltip_text: _('Classic Effect Options'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(button, 'emblem-system-symbolic');
    button.add_css_class('flat');
    button.add_css_class('circular');
    button.connect('clicked', () => {
        const dialog = new ClassicHighlightOptionsDialog({
            settings,
            parent: button.get_root(),
        });
        dialog.present();
    });
    return button;
}

export const ClassicHighlightOptionsDialog = GObject.registerClass(
class ClassicHighlightOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Classic Effect Options'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 580,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);

        const hoverGroup = new Adw.PreferencesGroup({
            title: _('Hover Highlight'),
            description: _('Customize the Classic hover and pressed effect'),
        });
        content.append(hoverGroup);

        const hoverSwitch = createSwitchRow(settings, {
            key: CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled,
            title: _('Highlight Hovering Application Icons'),
        });
        hoverGroup.add(hoverSwitch);
        const hoverColorRow = addColorRow(
            hoverGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.hoverColor,
                title: _('Hover Highlight Color'),
            },
            connectSettings
        );
        const pressedColorRow = addColorRow(
            hoverGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.pressedColor,
                title: _('Pressed Highlight Color'),
            },
            connectSettings
        );
        const borderRadiusRow = addSpinRow(
            hoverGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.borderRadius,
                title: _('Hover Highlight Border Radius'),
                subtitle: _('Border radius in pixels'),
                lower: 0,
                upper: 10,
            },
            connectSettings
        );

        const focusGroup = new Adw.PreferencesGroup({
            title: _('Focused Application Highlight'),
            description: _('Customize the effect for the focused application'),
        });
        content.append(focusGroup);

        const focusSwitch = createSwitchRow(settings, {
            key: CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled,
            title: _('Highlight the Focused Application'),
        });
        focusGroup.add(focusSwitch);
        const focusDominantSwitch = createSwitchRow(settings, {
            key: CLASSIC_HIGHLIGHT_SETTINGS.focusDominant,
            title: _('Use Icon Dominant Color'),
        });
        focusGroup.add(focusDominantSwitch);
        const focusColorRow = addColorRow(
            focusGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.focusColor,
                title: _('Custom Focus Highlight Color'),
            },
            connectSettings
        );
        const focusOpacityRow = addSpinRow(
            focusGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.focusOpacity,
                title: _('Focus Highlight Opacity'),
                subtitle: _('Opacity percentage'),
                lower: 5,
                upper: 100,
                step: 5,
            },
            connectSettings
        );

        const syncHoverSensitivity = () => {
            const sensitive = settings.get_boolean(
                CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled
            );
            for (const row of [hoverColorRow, pressedColorRow, borderRadiusRow])
                row.sensitive = sensitive;
        };
        connectSettings(
            settings,
            `changed::${CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled}`,
            syncHoverSensitivity
        );
        syncHoverSensitivity();

        const syncFocusSensitivity = () => {
            const enabled = settings.get_boolean(
                CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled
            );
            const dominant = settings.get_boolean(
                CLASSIC_HIGHLIGHT_SETTINGS.focusDominant
            );
            focusDominantSwitch.sensitive = enabled;
            focusColorRow.sensitive = enabled && !dominant;
            focusOpacityRow.sensitive = enabled;
        };
        connectSettings(
            settings,
            `changed::${CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled}`,
            syncFocusSensitivity
        );
        connectSettings(
            settings,
            `changed::${CLASSIC_HIGHLIGHT_SETTINGS.focusDominant}`,
            syncFocusSensitivity
        );
        syncFocusSensitivity();

    }

    _reset() {
        for (const key of CLASSIC_HIGHLIGHT_SETTING_KEYS)
            this._settings.reset(key);
    }
}
);
