// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {panelIsVertical} from './panelPosition.js';
import {windowsClockEnabled} from '../shared/taskbarPanelModes.js';

const DIGITS = '0123456789';
const WINDOWS_CLOCK_CLASS = 'simple-taskbar-clock-windows';
const WINDOWS_DATE_FORMATS = {
    'day-month-year': '%d/%m/%Y',
    'month-day-year': '%m/%d/%Y',
    'year-month-day': '%Y/%m/%d',
};

function clockMarkup(text, useTimeSeparator) {
    if (!Array.isArray(text))
        return text.trim();

    const separator = `\n<span size="8192"> ${
        useTimeSeparator ? '‧‧' : '—'
    } </span>\n`;
    return text.join(separator).trim();
}

function windowsClockMarkup({lines, singleLine}) {
    const font = singleLine ? 'size="10.5pt" weight="600"' : 'size="9.75pt" weight="500"';
    return `<span ${font} font_features="tnum">${lines.join('\n')}</span>`;
}

function verticalFrame(widget) {
    const themeNode = widget.get_theme_node();
    return themeNode.get_vertical_padding() +
        themeNode.get_border_width(St.Side.TOP) +
        themeNode.get_border_width(St.Side.BOTTOM);
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
            this
        );
        this._desktopSettings.connectObject(
            'changed::clock-format', () => {
                this._clockFormat = null;
                this.sync();
            },
            this
        );
        this._settings.connectObject(
            'changed::clock-style', () => this.sync(),
            'changed::default-panel-clock-style', () => this.sync(),
            'changed::default-gnome-panel', () => this.sync(),
            'changed::windows-xp-theme-enabled', () => this.sync(),
            'changed::clock-date-order', () => this.sync(),
            this
        );
        this._syncPanelPosition();
    }

    sync() {
        if (this._syncWindowsClock())
            return;

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
        const layout = this._measureLayout();
        const widestDigit = this._widestDigit(layout);
        const chosen = candidates.find(candidate =>
            this._fits(layout, candidate, widestDigit, textWidth)
        ) ?? {text: timeParts, useTimeSeparator: true};
        clockText.set_text(clockMarkup(chosen.text, chosen.useTimeSeparator));
        clockText.set_use_markup(Array.isArray(chosen.text));
    }

    _syncWindowsClock() {
        const clockDisplay = this._dateMenu._clockDisplay;
        const windowsLayout = windowsClockEnabled(this._settings)
            ? this._windowsClockLayouts().find(candidate => this._windowsClockFits(candidate))
            : undefined;
        if (!windowsLayout) {
            clockDisplay.remove_style_class_name(WINDOWS_CLOCK_CLASS);
            return false;
        }

        if (!this._formatted)
            this._captureClockText();
        this._formatted = true;
        clockDisplay.add_style_class_name(WINDOWS_CLOCK_CLASS);
        clockDisplay.clutter_text.set_text(windowsClockMarkup(windowsLayout));
        clockDisplay.clutter_text.set_use_markup(true);
        return true;
    }

    _windowsClockLayouts() {
        const now = GLib.DateTime.new_now_local();
        const seconds = this._desktopSettings.get_boolean('clock-show-seconds') ? ':%S' : '';
        const time = now.format(this._desktopSettings.get_string('clock-format') === '12h'
            ? `%l:%M${seconds} %p` : `%R${seconds}`).trim();
        const weekday = this._desktopSettings.get_boolean('clock-show-weekday')
            ? now.format('%a') : null;
        const date = this._desktopSettings.get_boolean('clock-show-date')
            ? now.format(WINDOWS_DATE_FORMATS[this._settings.get_string('clock-date-order')]) : null;
        const details = [];
        if (weekday && date)
            details.push(`${weekday} ${date}`);
        if (date)
            details.push(date);
        if (weekday)
            details.push(weekday);

        return [
            ...details.flatMap(detail => [
                {lines: [time, detail], singleLine: false},
                {lines: [`${detail} ${time}`], singleLine: true},
            ]),
            {lines: [time], singleLine: true},
        ];
    }

    _windowsClockFits({lines, singleLine}) {
        const layout = this._measureLayout();
        if (!panelIsVertical(this._settings)) {
            const [, height] = this._measure(layout, windowsClockMarkup({lines, singleLine}), true);
            return height <= this._getPanelThickness() - this._clockTextVerticalInset();
        }

        const widestDigit = this._widestDigit(layout);
        const [width] = this._measure(layout, windowsClockMarkup({
            lines: lines.map(line => line.replace(/\d/g, widestDigit)),
            singleLine,
        }), true);
        return width <= this._getPanelThickness() - this._clockTextInset();
    }

    _measureLayout() {
        const layout = this._dateMenu._clockDisplay.clutter_text.get_layout().copy();
        layout.set_width(-1);
        layout.set_ellipsize(Pango.EllipsizeMode.NONE);
        return layout;
    }

    _measure(layout, text, useMarkup) {
        layout.set_attributes(null);
        if (useMarkup)
            layout.set_markup(text, -1);
        else
            layout.set_text(text, -1);
        return layout.get_pixel_size();
    }

    _widestDigit(layout) {
        let widestDigit = DIGITS[0];
        let widestWidth = -1;
        for (const digit of DIGITS) {
            const [width] = this._measure(layout, digit, false);
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
        const [width] = this._measure(
            layout,
            clockMarkup(sample, useTimeSeparator),
            stacks
        );
        return width <= textWidth;
    }

    _clockTextVerticalInset() {
        let inset = verticalFrame(this._dateMenu);
        for (let actor = this._dateMenu._clockDisplay;
            actor !== this._dateMenu;
            actor = actor.get_parent())
            inset += verticalFrame(actor) + actor.margin_top + actor.margin_bottom;
        return inset;
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
        this._dateMenu._clock.disconnectObject(this);
        this._desktopSettings.disconnectObject(this);
        this._settings.disconnectObject(this);
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
        const clockDisplay = this._dateMenu._clockDisplay;
        clockDisplay.remove_style_class_name(WINDOWS_CLOCK_CLASS);
        const clockText = clockDisplay.clutter_text;
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
