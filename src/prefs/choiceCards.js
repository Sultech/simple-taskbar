// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const CARD_WIDTH = 80;
const CARD_HEIGHT = 50;
const SCREEN_INSET = 2;
const SCREEN_RADIUS = 6;
const BAR_THICKNESS = 8;
const PANEL_THICKNESS = 5;
const SHORT_BAR_LENGTH_RATIO = 0.5;
const FLOATING_GAP = 4;
const CARD_SPACING = 12;
const WINDOWS_XP_BLUE = [0.14, 0.37, 0.86];
const WINDOWS_XP_GREEN = [0.24, 0.6, 0.24];
const WINDOWS_10_BAR = [0.05, 0.05, 0.06];
const WINDOWS_10_START = [1, 1, 1];

export function roundedRectangle(cr, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    cr.newSubPath();
    cr.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

export function setColor(cr, [red, green, blue], alpha = 1) {
    cr.setSourceRGBA(red, green, blue, alpha);
}

export function rgb(color) {
    return [color.red, color.green, color.blue];
}

function screenBounds(width, height) {
    return {
        x: SCREEN_INSET,
        y: SCREEN_INSET,
        width: width - SCREEN_INSET * 2,
        height: height - SCREEN_INSET * 2,
    };
}

function edgeRectangle(screen, edge, thickness, lengthRatio = 1, gap = 0) {
    const horizontal = edge === 'top' || edge === 'bottom';
    const length = (horizontal ? screen.width : screen.height) * lengthRatio;
    const offset = ((horizontal ? screen.width : screen.height) - length) / 2;
    if (edge === 'top')
        return {x: screen.x + offset, y: screen.y + gap, width: length, height: thickness};
    if (edge === 'bottom')
        return {x: screen.x + offset, y: screen.y + screen.height - thickness - gap, width: length, height: thickness};
    if (edge === 'left')
        return {x: screen.x + gap, y: screen.y + offset, width: thickness, height: length};
    return {x: screen.x + screen.width - thickness - gap, y: screen.y + offset, width: thickness, height: length};
}

function barRectangle(screen, edge, {short, floating}) {
    const gap = floating ? FLOATING_GAP : 0;
    const bar = edgeRectangle(screen, edge, BAR_THICKNESS, short ? SHORT_BAR_LENGTH_RATIO : 1, gap);
    if (short || !floating)
        return bar;

    if (edge === 'top' || edge === 'bottom')
        return {...bar, x: bar.x + gap, width: bar.width - gap * 2};
    return {...bar, y: bar.y + gap, height: bar.height - gap * 2};
}

function fillRectangle(cr, {x, y, width, height}, color, alpha = 1, radius = 0) {
    setColor(cr, color, alpha);
    if (radius > 0)
        roundedRectangle(cr, x, y, width, height, radius);
    else
        cr.rectangle(x, y, width, height);
    cr.fill();
}

function drawScreen(cr, width, height, palette, drawContent) {
    const screen = screenBounds(width, height);
    const foreground = rgb(palette.foreground);
    roundedRectangle(cr, screen.x, screen.y, screen.width, screen.height, SCREEN_RADIUS);
    setColor(cr, foreground, 0.06);
    cr.fillPreserve();
    cr.save();
    cr.clip();
    drawContent(screen, foreground, rgb(palette.accent));
    cr.restore();
    roundedRectangle(cr, screen.x, screen.y, screen.width, screen.height, SCREEN_RADIUS);
    if (palette.selected) {
        setColor(cr, rgb(palette.accent));
        cr.setLineWidth(2.5);
    } else {
        setColor(cr, foreground, 0.45);
        cr.setLineWidth(1.5);
    }
    cr.stroke();
}

function drawBar(cr, screen, edge, color, shape) {
    const rounded = shape.short || shape.floating;
    fillRectangle(cr, barRectangle(screen, edge, shape), color, 1, rounded ? BAR_THICKNESS / 2 : 0);
}

export function drawTaskbarEdge(edge, getShape = () => ({short: false, floating: false})) {
    return (cr, width, height, palette) => drawScreen(cr, width, height, palette, (screen, _foreground, accent) => {
        drawBar(cr, screen, edge, accent, getShape());
    });
}

export function drawDockEdge(edge, panelEdge, getShape) {
    return (cr, width, height, palette) => drawScreen(cr, width, height, palette, (screen, foreground, accent) => {
        const panel = panelEdge();
        if (panel !== edge)
            fillRectangle(cr, edgeRectangle(screen, panel, PANEL_THICKNESS), foreground, 0.3);
        drawBar(cr, screen, edge, accent, getShape());
    });
}

export function edgeChoices(drawForEdge) {
    return [
        {value: 'top', label: _('Top'), draw: drawForEdge('top')},
        {value: 'bottom', label: _('Bottom'), draw: drawForEdge('bottom')},
        {value: 'left', label: _('Left'), draw: drawForEdge('left')},
        {value: 'right', label: _('Right'), draw: drawForEdge('right')},
    ];
}

export function drawTaskbarMode(cr, width, height, palette) {
    drawTaskbarEdge('bottom')(cr, width, height, palette);
}

export function drawDockMode(cr, width, height, palette) {
    drawDockEdge('bottom', () => 'top', () => ({short: true, floating: true}))(cr, width, height, palette);
}

export function drawDefaultPanelMode(cr, width, height, palette) {
    drawScreen(cr, width, height, palette, (screen, _foreground, accent) => {
        fillRectangle(cr, edgeRectangle(screen, 'top', PANEL_THICKNESS + 1), accent);
    });
}

export function drawWindowsXpMode(cr, width, height, palette) {
    drawScreen(cr, width, height, palette, screen => {
        const bar = edgeRectangle(screen, 'bottom', BAR_THICKNESS + 1);
        fillRectangle(cr, bar, WINDOWS_XP_BLUE);
        const startRadius = bar.height / 2;
        fillRectangle(
            cr,
            {...bar, x: bar.x - startRadius, width: bar.height * 2.4 + startRadius},
            WINDOWS_XP_GREEN,
            1,
            startRadius
        );
    });
}

export function drawWindows10Mode(cr, width, height, palette) {
    drawScreen(cr, width, height, palette, screen => {
        const bar = edgeRectangle(screen, 'bottom', BAR_THICKNESS + 1);
        fillRectangle(cr, bar, WINDOWS_10_BAR);
        fillRectangle(cr, {...bar, width: bar.height * 1.4}, WINDOWS_10_START);
    });
}

export function addChoiceCards(group, {choices, columns = 0, onSelected, connectSettings}) {
    const styleManager = Adw.StyleManager.get_default();
    const container = columns
        ? new Gtk.Grid({column_spacing: CARD_SPACING, row_spacing: CARD_SPACING, column_homogeneous: true})
        : new Adw.WrapBox({child_spacing: CARD_SPACING, line_spacing: CARD_SPACING, justify: Adw.JustifyMode.FILL});
    const cards = new Map();
    let firstButton = null;
    let syncing = false;
    const syncSelection = () => {
        for (const {button, area, label} of cards.values()) {
            if (button.active)
                label.add_css_class('accent');
            else
                label.remove_css_class('accent');
            area.queue_draw();
        }
    };
    for (const [index, {value, label, draw}] of choices.entries()) {
        const area = new Gtk.DrawingArea({
            content_width: CARD_WIDTH,
            content_height: CARD_HEIGHT,
            halign: Gtk.Align.CENTER,
        });

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 10,
            margin_bottom: 10,
        });
        content.append(area);
        const labelWidget = new Gtk.Label({
            label,
            justify: Gtk.Justification.CENTER,
            wrap: true,
            max_width_chars: 10,
            css_classes: ['caption-heading'],
        });
        content.append(labelWidget);

        const button = new Gtk.ToggleButton({
            child: content,
            group: firstButton,
            hexpand: true,
        });
        firstButton ??= button;
        area.set_draw_func((widget, cr, width, height) => {
            draw(cr, width, height, {
                foreground: widget.get_color(),
                accent: styleManager.get_accent_color_rgba(),
                selected: button.active,
            });
            cr.$dispose();
        });
        button.connect('toggled', () => {
            syncSelection();
            if (!syncing && button.active)
                onSelected(value);
        });
        cards.set(value, {button, area, label: labelWidget});
        if (columns)
            container.attach(button, index % columns, Math.floor(index / columns), 1, 1);
        else
            container.append(button);
    }
    group.add(container);
    syncSelection();

    const redraw = () => {
        for (const {area} of cards.values())
            area.queue_draw();
    };
    connectSettings(styleManager, 'notify::accent-color', redraw);
    connectSettings(styleManager, 'notify::dark', redraw);

    return {
        setActive: value => {
            syncing = true;
            cards.get(value).button.active = true;
            syncing = false;
        },
        redraw,
    };
}
