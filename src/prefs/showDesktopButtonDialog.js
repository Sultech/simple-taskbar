// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addColorRow,
    addSpinRow,
    createSwitchRow,
    setButtonIcon,
} from './preferencesWidgets.js';

const SHOW_DESKTOP_BUTTON_SETTINGS = [
    'show-desktop-button-width',
    'show-desktop-button-custom-line-color-enabled',
    'show-desktop-button-custom-line-color',
];

export function createShowDesktopButtonOptionsButton(settings) {
    const button = new Gtk.Button({
        tooltip_text: _('Show Desktop Button Options'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(button, 'emblem-system-symbolic');
    button.add_css_class('flat');
    button.add_css_class('circular');
    button.connect('clicked', () => {
        const dialog = new ShowDesktopButtonOptionsDialog({
            settings,
            parent: button.get_root(),
        });
        dialog.present();
    });
    return button;
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
                    'Width in pixels; height is used when the panel is vertical'
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
        for (const key of SHOW_DESKTOP_BUTTON_SETTINGS)
            this._settings.reset(key);
    }
}
);
