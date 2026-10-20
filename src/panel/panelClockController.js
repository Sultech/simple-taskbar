// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {panelIsVertical} from './panelPosition.js';

const DIGITS = '0123456789';

function clockMarkup(text, useTimeSeparator) {
    if (!Array.isArray(text))
        return text.trim();

    const separator = `\n<span size="8192"> ${
        useTimeSeparator ? '‧‧' : '—'
    } </span>\n`;
    return text.join(separator).trim();
}

function horizontalFrame(widget) {
    const themeNode = widget.get_theme_node();
    return themeNode.get_horizontal_padding() +
        themeNode.get_border_width(St.Side.LEFT) +
        themeNode.get_border_width(St.Side.RIGHT);
}

export class PanelClockController {
    constructor(settings, dateMenu, getPanelThickness, getMinimumPanelThickness) {
        this._settings = settings;
        this._dateMenu = dateMenu;
        this._getPanelThickness = getPanelThickness;
        this._getMinimumPanelThickness = getMinimumPanelThickness;
        this._signalHolder = new TransientSignalHolder();
        this._desktopSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._originalEllipsize = null;
        this._originalNaturalWidth = null;
        this._originalNaturalWidthSet = null;
        this._originalUseMarkup = null;
        this._clockFormat = null;
        this._formatted = false;
        this._vertical = null;
        this._clockAfterUpdateId = 0;
    }

    enable() {
        this._dateMenu._clock.connectObject(
            'notify::clock', () => this.sync(),
            this._signalHolder
        );
        this._desktopSettings.connectObject(
            'changed::clock-format', () => {
                this._clockFormat = null;
                this.sync();
            },
            this._signalHolder
        );
        this._syncPanelPosition();
    }

    sync() {
        if (!panelIsVertical(this._settings)) {
            if (this._formatted)
                this._restoreClockText();
            return;
        }

        const datetime = this._dateMenu._clock.clock;
        let datetimeParts = datetime.split(' ');
        let time = datetimeParts[1];
        const clockText = this._dateMenu._clockDisplay.clutter_text;
        if (!this._formatted)
            this._captureClockText();
        if (clockText.ellipsize === Pango.EllipsizeMode.NONE)
            clockText.ellipsize = Pango.EllipsizeMode.END;
        const textWidth = this._getMinimumPanelThickness() - this._clockTextInset();
        clockText.natural_width = this._getPanelThickness();
        this._formatted = true;

        if (!time) {
            datetimeParts = datetime.split(' ');
            time = datetimeParts.pop();
            datetimeParts = [datetimeParts.join(' '), time];
        }

        const timeSeparator = time.includes('∶') ? '∶' : ':';
        const timeParts = time.split(timeSeparator);
        this._clockFormat ??=
            this._desktopSettings.get_string('clock-format');
        if (this._clockFormat === '12h')
            timeParts.push(...timeParts.pop().split(' '));

        const candidates = [
            {text: datetime, useTimeSeparator: false},
            {text: datetimeParts, useTimeSeparator: false},
            {text: time, useTimeSeparator: false},
        ];
        const layout = clockText.get_layout().copy();
        layout.set_width(-1);
        layout.set_ellipsize(Pango.EllipsizeMode.NONE);
        const widestDigit = this._widestDigit(layout);
        const chosen = candidates.find(candidate =>
            this._fits(layout, candidate, widestDigit, textWidth)
        ) ?? {text: timeParts, useTimeSeparator: true};
        clockText.set_text(clockMarkup(chosen.text, chosen.useTimeSeparator));
        clockText.set_use_markup(Array.isArray(chosen.text));
    }

    _measure(layout, text, useMarkup) {
        layout.set_attributes(null);
        if (useMarkup)
            layout.set_markup(text, -1);
        else
            layout.set_text(text, -1);
        return layout.get_pixel_size()[0];
    }

    _widestDigit(layout) {
        let widestDigit = DIGITS[0];
        let widestWidth = -1;
        for (const digit of DIGITS) {
            const width = this._measure(layout, digit, false);
            if (width > widestWidth) {
                widestDigit = digit;
                widestWidth = width;
            }
        }
        return widestDigit;
    }

    _fits(layout, {text, useTimeSeparator}, widestDigit, textWidth) {
        const stacks = Array.isArray(text);
        const sample = stacks
            ? text.map(part => part.replace(/\d/g, widestDigit))
            : text.replace(/\d/g, widestDigit);
        return this._measure(
            layout,
            clockMarkup(sample, useTimeSeparator),
            stacks
        ) <= textWidth;
    }

    _clockTextInset() {
        let inset = horizontalFrame(this._dateMenu);
        for (let actor = this._dateMenu._clockDisplay;
            actor !== this._dateMenu;
            actor = actor.get_parent()) {
            inset += horizontalFrame(actor) +
                actor.margin_left + actor.margin_right;
            const parent = actor.get_parent();
            if (parent instanceof St.BoxLayout &&
                parent.orientation === Clutter.Orientation.HORIZONTAL)
                inset += this._siblingsWidth(parent, actor);
        }
        return inset;
    }

    _siblingsWidth(box, actor) {
        const visibleChildren = box.get_children().filter(child => child.visible);
        const siblingsWidth = visibleChildren
            .filter(child => child !== actor)
            .reduce((width, child) => width +
                child.get_preferred_width(-1)[1] +
                child.margin_left + child.margin_right, 0);
        return siblingsWidth +
            box.layout_manager.spacing * (visibleChildren.length - 1);
    }

    destroy() {
        if (this._clockAfterUpdateId) {
            global.stage.disconnect(this._clockAfterUpdateId);
            this._clockAfterUpdateId = 0;
        }
        this._signalHolder.destroy();
        this._signalHolder = null;
        if (this._formatted)
            this._restoreClockText();
        this._desktopSettings = null;
        this._settings = null;
        this._dateMenu = null;
        this._getPanelThickness = null;
        this._getMinimumPanelThickness = null;
    }

    _syncPanelPosition() {
        const vertical = panelIsVertical(this._settings);
        if (vertical === this._vertical)
            return;

        this._vertical = vertical;
        if (this._clockAfterUpdateId) {
            global.stage.disconnect(this._clockAfterUpdateId);
            this._clockAfterUpdateId = 0;
        }
        if (!vertical) {
            this.sync();
            return;
        }

        this._clockAfterUpdateId = global.stage.connect(
            'after-update', () => {
                global.stage.disconnect(this._clockAfterUpdateId);
                this._clockAfterUpdateId = 0;
                this.sync();
            }
        );
        this._dateMenu._clockDisplay.queue_relayout();
    }

    _restoreClockText() {
        const clockText = this._dateMenu._clockDisplay.clutter_text;
        clockText.set_use_markup(this._originalUseMarkup);
        clockText.set_text(this._dateMenu._clock.clock);
        clockText.ellipsize = this._originalEllipsize;
        clockText.natural_width = this._originalNaturalWidth;
        clockText.natural_width_set = this._originalNaturalWidthSet;
        this._formatted = false;
    }

    _captureClockText() {
        const clockText = this._dateMenu._clockDisplay.clutter_text;
        this._originalEllipsize = clockText.ellipsize;
        this._originalNaturalWidth = clockText.natural_width;
        this._originalNaturalWidthSet = clockText.natural_width_set;
        this._originalUseMarkup = clockText.get_use_markup();
    }
}
