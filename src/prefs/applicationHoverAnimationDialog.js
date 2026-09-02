import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    APP_ICON_HOVER_ANIMATION_SETTINGS,
} from '../shared/applicationHoverAnimation.js';
import {setButtonIcon} from './preferencesWidgets.js';

function controlDefinitions() {
    return [
        {
            property: 'duration',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.duration,
            factor: 1,
            lower: 0,
            upper: 300,
            step: 1,
            page: 5,
            digits: 0,
            integer: true,
            title: _('Duration'),
            subtitle: _('Animation time in milliseconds'),
        },
        {
            property: 'expansion',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.expansion,
            factor: 1,
            lower: 0,
            upper: 600,
            step: 1,
            page: 5,
            digits: 0,
            integer: true,
            title: _('Dock Expansion'),
            subtitle: _('Dock resize time in milliseconds'),
            available: settings => settings.get_boolean('dock-mode') &&
                !settings.get_boolean('dock-panel-mode'),
        },
        {
            property: 'rotation',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.rotation,
            factor: 1,
            lower: -30,
            upper: 30,
            step: 1,
            page: 5,
            digits: 0,
            integer: true,
            title: _('Rotation'),
            subtitle: _('Rotation angle in degrees'),
        },
        {
            property: 'travel',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.travel,
            factor: 100,
            lower: -100,
            upper: 100,
            step: 1,
            page: 5,
            digits: 0,
            integer: false,
            title: _('Travel'),
            subtitle: _('Movement beyond the panel edge as a percentage of icon size'),
        },
        {
            property: 'zoom',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.zoom,
            factor: 100,
            lower: 10,
            upper: 250,
            step: 1,
            page: 5,
            digits: 0,
            integer: false,
            title: _('Zoom'),
            subtitle: _('Maximum icon scale as a percentage'),
        },
        {
            property: 'convexity',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.convexity,
            factor: 1,
            lower: 0,
            upper: 3,
            step: 0.1,
            page: 1,
            digits: 1,
            integer: false,
            title: _('Convexity'),
            subtitle: _('Shape of the hover curve'),
        },
        {
            property: 'extent',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.extent,
            factor: 1,
            lower: 1,
            upper: 10,
            step: 1,
            page: 1,
            digits: 0,
            integer: true,
            title: _('Extent'),
            subtitle: _('Number of icons affected by the pointer'),
        },
    ];
}

export function createApplicationHoverAnimationOptionsButton(settings) {
    const button = new Gtk.Button({
        tooltip_text: _('Animation Options'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(button, 'emblem-system-symbolic');
    button.add_css_class('flat');
    button.add_css_class('circular');
    button.connect('clicked', () => {
        const dialog = new ApplicationHoverAnimationDialog({
            settings,
            parent: button.get_root(),
        });
        dialog.present();
    });
    return button;
}

export const ApplicationHoverAnimationDialog = GObject.registerClass(
class ApplicationHoverAnimationDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Application Icon Hover Animation'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 620,
        });

        this._settings = settings;
        this._controlDefinitions = controlDefinitions();
        this._scales = new Map();
        this._settingsConnections = [];
        this._scaleConnections = [];
        this._syncing = false;

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
        const optionsGroup = new Adw.PreferencesGroup({
            title: _('Animation Profile'),
            description: _(
                'Adjust the profile selected in the application icon settings'
            ),
        });
        content.append(optionsGroup);

        for (const definition of this._controlDefinitions) {
            const scale = this._createScale(definition);
            this._scales.set(definition.property, scale);
            const scaleConnectionId = scale.connect(
                'value-changed',
                () => this._setValue(definition, scale),
            );
            this._scaleConnections.push({scale, id: scaleConnectionId});
            const row = new Adw.ActionRow({
                title: definition.title,
                subtitle: definition.subtitle,
            });
            row.add_suffix(scale);
            row.activatable_widget = scale;
            optionsGroup.add(row);
        }

        const scrolledWindow = new Gtk.ScrolledWindow({
            child: content,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vexpand: true,
        });
        toolbarView.content = scrolledWindow;

        this._settingsConnections.push(settings.connect(
            'changed::animate-appicon-hover-animation-type',
            () => this._sync()
        ));
        for (const key of ['dock-mode', 'dock-panel-mode']) {
            this._settingsConnections.push(settings.connect(
                `changed::${key}`,
                () => this._sync()
            ));
        }
        for (const key of Object.values(APP_ICON_HOVER_ANIMATION_SETTINGS)) {
            this._settingsConnections.push(settings.connect(
                `changed::${key}`,
                () => this._sync()
            ));
        }
        this.connect('close-request', () => {
            for (const id of this._settingsConnections)
                settings.disconnect(id);
            for (const {scale, id} of this._scaleConnections)
                scale.disconnect(id);
            this._settingsConnections = null;
            this._scaleConnections = null;
            this._scales.clear();
            this._settings = null;
        });
        this._sync();
    }

    _createScale(definition) {
        const adjustment = new Gtk.Adjustment({
            lower: definition.lower,
            upper: definition.upper,
            step_increment: definition.step,
            page_increment: definition.page,
        });
        return new Gtk.Scale({
            adjustment,
            digits: definition.digits,
            draw_value: true,
            hexpand: false,
            round_digits: definition.digits,
            valign: Gtk.Align.CENTER,
            value_pos: Gtk.PositionType.RIGHT,
            width_request: 300,
        });
    }

    _sync() {
        const type = this._settings.get_string(
            'animate-appicon-hover-animation-type'
        );
        this._syncing = true;
        for (const definition of this._controlDefinitions) {
            const scale = this._scales.get(definition.property);
            const values = this._settings.get_value(
                definition.key
            ).deepUnpack();
            const defaults = this._settings.get_default_value(
                definition.key
            ).deepUnpack();
            const value = values[type] ?? 0;
            const defaultValue = defaults[type];
            const available = definition.available
                ? definition.available(this._settings)
                : true;
            scale.sensitive = available && defaultValue !== undefined;
            scale.set_value(value * definition.factor);
            scale.clear_marks();
            if (defaultValue !== undefined) {
                scale.add_mark(
                    defaultValue * definition.factor,
                    Gtk.PositionType.TOP,
                    String(defaultValue * definition.factor)
                );
            }
        }
        this._syncing = false;
    }

    _setValue(definition, scale) {
        if (this._syncing)
            return;

        const type = this._settings.get_string(
            'animate-appicon-hover-animation-type'
        );
        const variant = this._settings.get_value(definition.key);
        const values = variant.deepUnpack();
        const rawValue = scale.get_value() / definition.factor;
        const value = definition.integer ? Math.round(rawValue) : rawValue;
        if (values[type] === value)
            return;

        values[type] = value;
        this._settings.set_value(
            definition.key,
            new GLib.Variant(variant.get_type_string(), values)
        );
    }

    _reset() {
        this._settings.reset('animate-appicon-hover-animation-type');
        for (const key of Object.values(APP_ICON_HOVER_ANIMATION_SETTINGS))
            this._settings.set_value(
                key,
                this._settings.get_default_value(key)
            );
    }
}
);
