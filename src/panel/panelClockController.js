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
const CLOCK_LAYOUT_CLASS = 'simple-taskbar-clock-layout';
const WINDOWS_DATE_FORMATS = {
    'day-month-year': '%d/%m/%Y',
    'month-day-year': '%m/%d/%Y',
    'year-month-day': '%Y/%m/%d',
};
const GNOME_DATE_FORMAT = '%b %-e';
const WINDOWS_STACKED_FONT = 'size="9.75pt" weight="500" font_features="tnum"';
const WINDOWS_SINGLE_LINE_FONT = 'size="10.5pt" weight="600" font_features="tnum"';
const TIME_PART_SEPARATOR_ATTRIBUTES = 'size="small" line_height="0.5"';
const TIME_PART_SEPARATOR_TEXT = '‥';

function isMarkupLine(line) {
    return line.includes('<');
}

function clockLayoutMarkup({lines, font}) {
    const text = lines.join('\n');
    return font ? `<span ${font}>${text}</span>` : text;
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
    constructor(settings, dateMenu, getPanelThickness) {
        this._settings = settings;
        this._dateMenu = dateMenu;
        this._getPanelThickness = getPanelThickness;
        this._desktopSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._originalUseMarkup = null;
        this._originalLabelXExpand = null;
        this._originalTextXAlign = null;
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
            'changed::clock-format', () => this.sync(),
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
        const clockLayout = this._chooseClockLayout();
        if (!clockLayout) {
            if (this._formatted)
                this._restoreClockText();
            return;
        }

        const clockDisplay = this._dateMenu._clockDisplay;
        if (!this._formatted) {
            this._originalUseMarkup = clockDisplay.clutter_text.get_use_markup();
            this._originalLabelXExpand = clockDisplay.x_expand;
            this._originalTextXAlign = clockDisplay.clutter_text.x_align;
        }
        this._formatted = true;
        if (panelIsVertical(this._settings)) {
            clockDisplay.x_expand = true;
            clockDisplay.clutter_text.x_align = Clutter.ActorAlign.CENTER;
        }
        clockDisplay.add_style_class_name(CLOCK_LAYOUT_CLASS);
        clockDisplay.clutter_text.set_text(clockLayoutMarkup(clockLayout));
        clockDisplay.clutter_text.set_use_markup(true);
    }

    _chooseClockLayout() {
        const vertical = panelIsVertical(this._settings);
        const windows = windowsClockEnabled(this._settings);
        if (!vertical && !windows)
            return null;

        const clockLayouts = this._clockLayouts(windows, vertical);
        return clockLayouts.find(candidate => this._clockLayoutFits(candidate)) ??
            (vertical ? clockLayouts.at(-1) : null);
    }

    _clockLayouts(windows, vertical) {
        const now = GLib.DateTime.new_now_local();
        const twelveHour = this._desktopSettings.get_string('clock-format') === '12h';
        const showSeconds = this._desktopSettings.get_boolean('clock-show-seconds');
        const seconds = showSeconds ? ':%S' : '';
        const time = now.format(twelveHour ? `%l:%M${seconds} %p` : `%R${seconds}`).trim();
        const weekday = this._desktopSettings.get_boolean('clock-show-weekday')
            ? now.format('%a') : null;
        const dateFormat = windows
            ? WINDOWS_DATE_FORMATS[this._settings.get_string('clock-date-order')]
            : GNOME_DATE_FORMAT;
        const date = this._desktopSettings.get_boolean('clock-show-date')
            ? now.format(dateFormat) : null;
        const details = [];
        if (weekday && date)
            details.push(`${weekday} ${date}`);
        if (date)
            details.push(date);
        if (weekday)
            details.push(weekday);

        const stackedFont = windows ? WINDOWS_STACKED_FONT : '';
        const singleLineFont = windows ? WINDOWS_SINGLE_LINE_FONT : '';
        const clockLayouts = [
            ...details.flatMap(detail => [
                {lines: [time, detail], font: stackedFont},
                {lines: [`${detail} ${time}`], font: singleLineFont},
            ]),
            {lines: [time], font: singleLineFont},
        ];
        if (vertical) {
            const timeParts = [now.format(twelveHour ? '%l' : '%H').trim(), now.format('%M')];
            if (showSeconds)
                timeParts.push(now.format('%S'));
            const separator = this._timePartSeparator(stackedFont);
            const lines = timeParts.flatMap((part, index) =>
                index === 0 ? [part] : [separator, part]);
            if (twelveHour)
                lines.push(now.format('%p'));
            clockLayouts.push({lines, font: stackedFont});
        }
        return clockLayouts;
    }

    _clockLayoutFits({lines, font}) {
        const layout = this._measureLayout();
        if (!panelIsVertical(this._settings)) {
            const [, height] = this._measure(layout, clockLayoutMarkup({lines, font}), true);
            return height <= this._getPanelThickness() - this._clockTextVerticalInset();
        }

        const widestDigit = this._widestDigit(layout);
        const [width] = this._measure(layout, clockLayoutMarkup({
            lines: lines.map(line => isMarkupLine(line) ? line : line.replace(/\d/g, widestDigit)),
            font,
        }), true);
        return width <= this._getPanelThickness() - this._clockTextInset();
    }

    _timePartSeparator(font) {
        const separator = `<span ${TIME_PART_SEPARATOR_ATTRIBUTES}>${TIME_PART_SEPARATOR_TEXT}</span>`;
        const layout = this._measureLayout();
        layout.set_attributes(null);
        layout.set_markup(clockLayoutMarkup({lines: ['0', separator, '0'], font}), -1);
        const lineInk = [];
        const iter = layout.get_iter();
        do
            lineInk.push(iter.get_line_extents()[0]);
        while (iter.next_line());
        const gapAbove = lineInk[1].y - (lineInk[0].y + lineInk[0].height);
        const gapBelow = lineInk[2].y - (lineInk[1].y + lineInk[1].height);
        return `<span ${TIME_PART_SEPARATOR_ATTRIBUTES} rise="${gapAbove - gapBelow}">${TIME_PART_SEPARATOR_TEXT}</span>`;
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
        clockDisplay.remove_style_class_name(CLOCK_LAYOUT_CLASS);
        clockDisplay.x_expand = this._originalLabelXExpand;
        clockDisplay.clutter_text.x_align = this._originalTextXAlign;
        clockDisplay.clutter_text.set_use_markup(this._originalUseMarkup);
        clockDisplay.clutter_text.set_text(this._dateMenu._clock.clock);
        this._formatted = false;
    }
}
