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
        this._settingsConnections = [];

        const connectSettings = (object, signal, callback) => {
            const id = object.connect(signal, callback);
            this._settingsConnections.push({object, id});
        };

        const toolbarView = new Adw.ToolbarView();
        this.content = toolbarView;

        const headerBar = new Adw.HeaderBar({
            show_end_title_buttons: false,
            show_start_title_buttons: false,
        });
        toolbarView.add_top_bar(headerBar);

        const resetButton = new Gtk.Button({
            label: _('Reset to Defaults'),
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => this._reset());
        headerBar.pack_start(resetButton);

        const closeButton = new Gtk.Button({
            label: _('Close'),
            valign: Gtk.Align.CENTER,
        });
        closeButton.connect('clicked', () => this.close());
        headerBar.pack_end(closeButton);

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 24,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
        });

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

        const scrolledWindow = new Gtk.ScrolledWindow({
            child: content,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vexpand: true,
        });
        toolbarView.content = scrolledWindow;

        this.connect('close-request', () => {
            for (const {object, id} of this._settingsConnections)
                object.disconnect(id);
            this._settingsConnections = null;
            this._settings = null;
        });
    }

    _reset() {
        for (const key of CLASSIC_HIGHLIGHT_SETTING_KEYS)
            this._settings.reset(key);
    }
}
);
