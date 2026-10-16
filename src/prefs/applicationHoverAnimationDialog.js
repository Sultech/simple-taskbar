// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    APP_ICON_HOVER_ANIMATION_SETTINGS,
} from '../shared/applicationHoverAnimation.js';
import {
    createPreferencesDialogButton,
    createPreferencesDialogContent,
} from './preferencesWidgets.js';
import {createSliderRow} from './sliderRow.js';

const SLIDER_WIDTH = 312;

function controlDefinitions() {
    return [
        {
            property: 'duration',
            unit: 'ms',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.duration,
            factor: 1,
            lower: 0,
            upper: 300,
            step: 1,
            digits: 0,
            integer: true,
            title: _('Duration'),
            subtitle: _('Animation time in milliseconds'),
        },
        {
            property: 'rotation',
            unit: '°',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.rotation,
            factor: 1,
            lower: -30,
            upper: 30,
            step: 1,
            digits: 0,
            integer: true,
            title: _('Rotation'),
            subtitle: _('Rotation angle in degrees'),
        },
        {
            property: 'travel',
            unit: '%',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.travel,
            factor: 100,
            lower: -100,
            upper: 100,
            step: 1,
            digits: 0,
            integer: false,
            title: _('Travel'),
            subtitle: _(
                'Movement beyond the taskbar or Dock edge as a percentage of icon size'
            ),
        },
        {
            property: 'zoom',
            unit: '%',
            key: APP_ICON_HOVER_ANIMATION_SETTINGS.zoom,
            factor: 100,
            lower: 10,
            upper: 250,
            step: 1,
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
            digits: 0,
            integer: true,
            title: _('Extent'),
            subtitle: _('Number of icons affected by the pointer'),
        },
    ];
}

export function createApplicationHoverAnimationOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Animation Options'),
        ApplicationHoverAnimationDialog
    );
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
        this._sliders = new Map();
        this._syncing = false;
        const {content, connectSettings} = createPreferencesDialogContent(
            this,
            () => {
                this._sliders.clear();
                this._sliders = null;
                this._controlDefinitions = null;
            }
        );
        const optionsGroup = new Adw.PreferencesGroup({
            title: _('Animation Profile'),
            description: _(
                'Adjust the profile selected in the application icon settings'
            ),
        });
        content.append(optionsGroup);

        for (const definition of this._controlDefinitions) {
            const slider = createSliderRow({
                title: definition.title,
                subtitle: definition.subtitle,
                lower: definition.lower,
                upper: definition.upper,
                step: definition.step,
                digits: definition.digits,
                unit: definition.unit,
                width: SLIDER_WIDTH,
            }, connectSettings);
            this._sliders.set(definition.property, slider);
            connectSettings(
                slider.get_adjustment(),
                'value-changed',
                () => this._setValue(definition, slider)
            );
            optionsGroup.add(slider);
        }

        connectSettings(
            settings,
            'changed::animate-appicon-hover-animation-type',
            () => this._sync()
        );
        for (const key of Object.values(APP_ICON_HOVER_ANIMATION_SETTINGS)) {
            connectSettings(
                settings,
                `changed::${key}`,
                () => this._sync()
            );
        }
        this._sync();
    }

    _sync() {
        const type = this._settings.get_string(
            'animate-appicon-hover-animation-type'
        );
        this._syncing = true;
        for (const definition of this._controlDefinitions) {
            const slider = this._sliders.get(definition.property);
            const values = this._settings.get_value(
                definition.key
            ).deepUnpack();
            const defaults = this._settings.get_default_value(
                definition.key
            ).deepUnpack();
            const defaultValue = defaults[type];
            const value = values[type] ?? defaultValue ?? 0;
            slider.sensitive = defaultValue !== undefined;
            slider.set_value(value * definition.factor);
            slider.set_mark(defaultValue === undefined ? null : defaultValue * definition.factor);
        }
        this._syncing = false;
    }

    _setValue(definition, slider) {
        if (this._syncing)
            return;

        const type = this._settings.get_string(
            'animate-appicon-hover-animation-type'
        );
        const variant = this._settings.get_value(definition.key);
        const values = variant.deepUnpack();
        const rawValue = slider.get_value() / definition.factor;
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
