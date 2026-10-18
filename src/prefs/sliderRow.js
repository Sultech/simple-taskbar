// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {rgb, roundedRectangle, setColor} from './choiceCards.js';

const SLIDER_WIDTH = 160;
const SLIDER_HEIGHT = 38;
const TRACK_PADDING = 6;
const TRACK_HEIGHT = 12;
const THUMB_WIDTH = 4;
const THUMB_HEIGHT = 24;
const THUMB_GAP = 4;
const DOT_RADIUS = 1.6;
const MAX_DOTS = 10;
const INACTIVE_TRACK_ALPHA = 0.22;
const DISABLED_ALPHA = 0.35;
const INNER_RADIUS = 2;
const MARK_WIDTH = 2;
const MARK_GAP = 2;
const MARK_LENGTH = 4;
const MARK_ALPHA = 0.6;
const ATTACHED_UNITS = new Set(['%', '°']);

function doubleValue(value) {
    const gvalue = new GObject.Value();
    gvalue.init(GObject.TYPE_DOUBLE);
    gvalue.set_double(value);
    return gvalue;
}

function trackSegment(cr, x, y, width, height, startRadius, endRadius) {
    const start = Math.min(startRadius, width / 2, height / 2);
    const end = Math.min(endRadius, width / 2, height / 2);
    cr.newSubPath();
    cr.arc(x + width - end, y + end, end, -Math.PI / 2, 0);
    cr.arc(x + width - end, y + height - end, end, 0, Math.PI / 2);
    cr.arc(x + start, y + height - start, start, Math.PI / 2, Math.PI);
    cr.arc(x + start, y + start, start, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

const SliderArea = GObject.registerClass({
    Implements: [Gtk.AccessibleRange],
}, class SliderArea extends Gtk.DrawingArea {
    _init({setCurrentValue, ...params}) {
        super._init(params);
        this._setCurrentValue = setCurrentValue;
    }

    vfunc_set_current_value(value) {
        this._setCurrentValue(value);
        return true;
    }

    vfunc_state_flags_changed(previousFlags) {
        super.vfunc_state_flags_changed(previousFlags);
        this.queue_draw();
    }
});

export const SliderRow = GObject.registerClass(
class SliderRow extends Adw.ActionRow {
    _init({title, subtitle, lower, upper, step = 1, digits = 0, unit = '', format = null, width = SLIDER_WIDTH}) {
        super._init({title, subtitle});
        this._step = step;
        this._digits = digits;
        this._unit = unit;
        this._formatValue = format;
        this._dragValue = null;
        this._mark = null;
        this._styleManager = Adw.StyleManager.get_default();
        this._adjustment = new Gtk.Adjustment({
            lower,
            upper,
            step_increment: step,
            page_increment: step * 5,
        });

        this._valueLabel = new Gtk.Label({
            valign: Gtk.Align.CENTER,
            width_chars: 6,
            xalign: 1,
            css_classes: ['numeric', 'heading'],
        });

        this._area = new SliderArea({
            setCurrentValue: value => this._adjustment.set_value(this._snap(value)),
            content_width: width,
            content_height: SLIDER_HEIGHT,
            valign: Gtk.Align.CENTER,
            focusable: true,
            accessible_role: Gtk.AccessibleRole.SLIDER,
        });
        this._area.update_property(
            [Gtk.AccessibleProperty.LABEL, Gtk.AccessibleProperty.DESCRIPTION],
            [title, subtitle]
        );
        this._area.set_draw_func((area, cr, width, height) => {
            this._draw(area, cr, width, height);
            cr.$dispose();
        });
        this._addControllers();

        const box = new Gtk.Box({spacing: 12, valign: Gtk.Align.CENTER});
        box.append(this._valueLabel);
        box.append(this._area);
        this.add_suffix(box);

        this._adjustment.connect('value-changed', () => this._sync());
        this._adjustment.connect('changed', () => this._sync());
        this._sync();
    }

    get_adjustment() {
        return this._adjustment;
    }

    get_value() {
        return this._adjustment.get_value();
    }

    set_value(value) {
        this._adjustment.set_value(this._clamp(value));
    }

    set_mark(value) {
        this._mark = value;
        this._area.queue_draw();
    }

    redraw() {
        this._area.queue_draw();
    }

    _clamp(value) {
        const precision = 10 ** this._digits;
        const clamped = Math.min(this._adjustment.get_upper(), Math.max(this._adjustment.get_lower(), value));
        return Math.round(clamped * precision) / precision;
    }

    _snap(value) {
        const lower = this._adjustment.get_lower();
        const steps = Math.round((this._clamp(value) - lower) / this._step);
        return this._clamp(lower + steps * this._step);
    }

    _format(value) {
        if (this._formatValue)
            return this._formatValue(value);

        const text = value.toFixed(this._digits);
        if (!this._unit)
            return text;
        return ATTACHED_UNITS.has(this._unit) ? `${text}${this._unit}` : `${text} ${this._unit}`;
    }

    _displayValue() {
        return this._dragValue ?? this.get_value();
    }

    _sync() {
        const value = this._displayValue();
        const text = this._format(value);
        this._valueLabel.label = text;
        this._area.update_property([
            Gtk.AccessibleProperty.VALUE_MIN,
            Gtk.AccessibleProperty.VALUE_MAX,
            Gtk.AccessibleProperty.VALUE_NOW,
            Gtk.AccessibleProperty.VALUE_TEXT,
        ], [
            doubleValue(this._adjustment.get_lower()),
            doubleValue(this._adjustment.get_upper()),
            doubleValue(value),
            text,
        ]);
        this._area.queue_draw();
    }

    _setFromX(x) {
        const trackWidth = this._area.get_width() - TRACK_PADDING * 2;
        const ratio = Math.min(1, Math.max(0, (x - TRACK_PADDING) / trackWidth));
        const lower = this._adjustment.get_lower();
        this._dragValue = this._snap(lower + ratio * (this._adjustment.get_upper() - lower));
        this._sync();
    }

    _stepBy(direction) {
        this.set_value(this.get_value() + direction * this._step);
    }

    _addControllers() {
        const drag = new Gtk.GestureDrag();
        let dragStartX = 0;
        drag.connect('drag-begin', (_gesture, x) => {
            dragStartX = x;
            this._area.grab_focus();
            this._setFromX(x);
        });
        drag.connect('drag-update', (_gesture, offsetX) => {
            this._setFromX(dragStartX + offsetX);
        });
        drag.connect('drag-end', () => {
            const value = this._dragValue;
            this._dragValue = null;
            this.set_value(value);
            this._sync();
        });
        this._area.add_controller(drag);

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_controller, keyval) => {
            if (keyval === Gdk.KEY_Left || keyval === Gdk.KEY_Down)
                this._stepBy(-1);
            else if (keyval === Gdk.KEY_Right || keyval === Gdk.KEY_Up)
                this._stepBy(1);
            else if (keyval === Gdk.KEY_Home)
                this.set_value(this._adjustment.get_lower());
            else if (keyval === Gdk.KEY_End)
                this.set_value(this._adjustment.get_upper());
            else
                return Gdk.EVENT_PROPAGATE;
            return Gdk.EVENT_STOP;
        });
        this._area.add_controller(keys);

        const scroll = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        scroll.connect('scroll', (_controller, _dx, dy) => {
            if (!this._area.has_focus)
                return Gdk.EVENT_PROPAGATE;

            this._stepBy(dy < 0 ? 1 : -1);
            return Gdk.EVENT_STOP;
        });
        this._area.add_controller(scroll);
    }

    _draw(area, cr, width, height) {
        const foreground = rgb(area.get_color());
        const color = area.is_sensitive()
            ? rgb(this._styleManager.get_accent_color_rgba())
            : foreground;
        const alpha = area.is_sensitive() ? 1 : DISABLED_ALPHA;
        const lower = this._adjustment.get_lower();
        const range = this._adjustment.get_upper() - lower;
        const ratio = range > 0 ? Math.min(1, Math.max(0, (this._displayValue() - lower) / range)) : 0;

        const trackX = TRACK_PADDING;
        const trackWidth = width - TRACK_PADDING * 2;
        const trackY = (height - TRACK_HEIGHT) / 2;
        const centerY = height / 2;
        const thumbX = Math.round(trackX + ratio * trackWidth);

        const activeWidth = thumbX - THUMB_GAP - trackX;
        if (activeWidth > 0) {
            trackSegment(cr, trackX, trackY, activeWidth, TRACK_HEIGHT, TRACK_HEIGHT / 2, INNER_RADIUS);
            setColor(cr, color, alpha);
            cr.fill();
        }
        const inactiveX = thumbX + THUMB_GAP;
        const inactiveWidth = trackX + trackWidth - inactiveX;
        if (inactiveWidth > 0) {
            trackSegment(cr, inactiveX, trackY, inactiveWidth, TRACK_HEIGHT, INNER_RADIUS, TRACK_HEIGHT / 2);
            setColor(cr, color, alpha * INACTIVE_TRACK_ALPHA);
            cr.fill();
        }

        const steps = range > 0 ? Math.round(range / this._step) : 0;
        const dots = Math.min(steps, MAX_DOTS);
        const dotStart = trackX + TRACK_HEIGHT / 2;
        const dotSpan = trackWidth - TRACK_HEIGHT;
        for (let index = 0; index <= dots && dots > 0; index++) {
            const dotX = dotStart + (index / dots) * dotSpan;
            if (Math.abs(dotX - thumbX) < THUMB_GAP + DOT_RADIUS * 2)
                continue;

            cr.arc(dotX, centerY, DOT_RADIUS, 0, 2 * Math.PI);
            if (dotX < thumbX)
                setColor(cr, [1, 1, 1], 0.9 * alpha);
            else
                setColor(cr, color, 0.85 * alpha);
            cr.fill();
        }

        roundedRectangle(
            cr,
            thumbX - THUMB_WIDTH / 2,
            centerY - THUMB_HEIGHT / 2,
            THUMB_WIDTH,
            THUMB_HEIGHT,
            THUMB_WIDTH / 2
        );
        setColor(cr, color, alpha);
        cr.fill();

        if (this._mark !== null && range > 0) {
            const markX = Math.round(trackX + ((this._mark - lower) / range) * trackWidth);
            const markY = centerY + THUMB_HEIGHT / 2 + MARK_GAP;
            cr.moveTo(markX, markY);
            cr.lineTo(markX, markY + MARK_LENGTH);
            setColor(cr, foreground, MARK_ALPHA * alpha);
            cr.setLineWidth(MARK_WIDTH);
            cr.stroke();
        }

        if (area.has_focus) {
            roundedRectangle(cr, 1, 1, width - 2, height - 2, height / 2);
            setColor(cr, color, 0.5);
            cr.setLineWidth(2);
            cr.stroke();
        }
    }
});

export function createSliderRow(params, connectSettings) {
    const row = new SliderRow(params);
    connectSettings(Adw.StyleManager.get_default(), 'notify::accent-color', () => row.redraw());
    return row;
}

export function addSliderRow(group, settings, {
    key,
    title,
    subtitle,
    lower,
    upper,
    step = 1,
    unit = 'px',
    format = null,
    addRow = row => group.add(row),
}, connectSettings) {
    const row = createSliderRow({title, subtitle, lower, upper, step, unit, format}, connectSettings);
    let syncing = false;
    row.set_value(settings.get_int(key));
    row.get_adjustment().connect('value-changed', () => {
        const value = Math.round(row.get_value());
        if (!syncing && settings.get_int(key) !== value)
            settings.set_int(key, value);
    });
    connectSettings(settings, `changed::${key}`, () => {
        const value = settings.get_int(key);
        if (row.get_value() === value)
            return;

        syncing = true;
        row.set_value(value);
        syncing = false;
    });
    addRow(row);
    return row;
}
