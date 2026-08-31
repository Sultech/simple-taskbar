// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
    MAX_RUNNING_INDICATORS,
    runningIndicatorIsPill,
    runningIndicatorPositionIsHorizontal,
} from '../shared/runningIndicatorSettings.js';

const ANIMATION_DURATION = 150;
const SEGMENT_GAP = 2;
const PILL_CONTAINER_LENGTH = 20;
const PILL_SINGLE_LENGTH = 8;
const PILL_MULTIPLE_LENGTH = 18;
const PILL_RADIUS = 999;
const ANIMATED_PROPERTIES = ['width', 'height', 'x', 'y', 'opacity'];

const [, FALLBACK_COLOR] = Cogl.Color.from_string('#8d8d8d');

function setColor(cr, color, scale = 1) {
    cr.setSourceRGBA(
        color.red * scale / 255,
        color.green * scale / 255,
        color.blue * scale / 255,
        color.alpha / 255
    );
}

function drawRectangle(cr, horizontal, distance, length, size) {
    cr.newSubPath();
    if (horizontal)
        cr.rectangle(distance, 0, length, size);
    else
        cr.rectangle(0, distance, size, length);
}

function roundedRectangle(cr, x, y, width, height, radius) {
    const right = x + width;
    const bottom = y + height;
    cr.newSubPath();
    cr.arc(right - radius, y + radius, radius, -Math.PI / 2, 0);
    cr.arc(right - radius, bottom - radius, radius, 0, Math.PI / 2);
    cr.arc(x + radius, bottom - radius, radius, Math.PI / 2, Math.PI);
    cr.arc(x + radius, y + radius, radius, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

function clipToGlass(cr, horizontal, position, glass, size, radius, cross) {
    const limit = Math.min(radius, cross / 2, glass.length / 2);
    if (limit <= 0)
        return;

    const crossStart = position === 'bottom' || position === 'right'
        ? size - cross
        : 0;
    roundedRectangle(
        cr,
        horizontal ? glass.start : crossStart,
        horizontal ? crossStart : glass.start,
        horizontal ? glass.length : cross,
        horizontal ? cross : glass.length,
        limit
    );
    cr.clip();
}

function drawMetro(cr, horizontal, areaSize, size, color, focused) {
    const blackenedLength = areaSize / 48;
    const darkenedLength = (focused ? 2 : 10) * areaSize / 48;
    const solidDarkLength = areaSize - darkenedLength;
    const solidLength = solidDarkLength - blackenedLength;

    drawRectangle(cr, horizontal, 0, solidLength, size);
    setColor(cr, color);
    cr.fill();

    drawRectangle(cr, horizontal, solidLength, blackenedLength, size);
    setColor(cr, color, 0.3);
    cr.fill();

    drawRectangle(cr, horizontal, solidDarkLength, darkenedLength, size);
    setColor(cr, color, 0.7);
    cr.fill();
}

function drawCiliora(cr, horizontal, areaSize, size, color, number) {
    const mark = number > 1
        ? Math.max(1, Math.min(
            size,
            Math.floor(areaSize / (4 * (number - 1)))
        ))
        : size;
    const length = areaSize - mark * 2 * (number - 1);
    setColor(cr, color);
    drawRectangle(cr, horizontal, 0, length, size);
    cr.fill();
    for (let i = 1; i < number; i++)
        drawRectangle(cr, horizontal, length + i * 2 * mark - mark, mark, size);
    setColor(cr, color);
    cr.fill();
}

function markSpacing(areaSize, size, number) {
    const spacing = Math.max(
        Math.ceil(size / 2),
        Math.ceil(areaSize / 18)
    );
    if (number < 2)
        return spacing;

    return Math.max(1, Math.min(
        spacing,
        Math.floor((areaSize - number) / (number - 1))
    ));
}

function markLength(areaSize, size, number, spacing, preferred) {
    const spaced = Math.floor(
        (areaSize - (number + 1) * spacing) / number
    );
    if (spaced >= Math.min(preferred, size))
        return Math.min(preferred, spaced);

    return Math.max(1, Math.min(
        preferred,
        Math.floor((areaSize - (number - 1) * spacing) / number)
    ));
}

function drawDots(cr, horizontal, areaSize, size, color, number, spacing) {
    const radius = size / 2;
    const offset = Math.floor(
        (areaSize - number * size - (number - 1) * spacing) / 2
    );
    cr.translate(horizontal ? offset : 0, horizontal ? 0 : offset);
    setColor(cr, color);
    for (let i = 0; i < number; i++) {
        cr.newSubPath();
        const distance = (2 * i + 1) * radius + i * spacing;
        cr.arc(
            horizontal ? distance : radius,
            horizontal ? radius : distance,
            radius,
            0,
            2 * Math.PI
        );
    }
    cr.fill();
}

function drawRunningIndicator(area, state, color) {
    const {count, style, position, focused, radius, cross, glass} = state;
    const number = Math.min(count, MAX_RUNNING_INDICATORS);
    if (number < 1)
        return;

    const [areaWidth, areaHeight] = area.get_surface_size();
    if (areaWidth < 1 || areaHeight < 1)
        return;

    const horizontal = runningIndicatorPositionIsHorizontal(position);
    const areaSize = horizontal ? areaWidth : areaHeight;
    const size = horizontal ? areaHeight : areaWidth;
    const spacing = markSpacing(areaSize, size, number);
    const cr = area.get_context();

    clipToGlass(cr, horizontal, position, glass, size, radius, cross);

    if (style === 'solid' || (style === 'metro' && number <= 1)) {
        drawRectangle(cr, horizontal, 0, areaSize, size);
        setColor(cr, color);
        cr.fill();
    } else if (style === 'metro') {
        drawMetro(cr, horizontal, areaSize, size, color, focused);
    } else if (style === 'ciliora') {
        drawCiliora(cr, horizontal, areaSize, size, color, number);
    } else if (style === 'dots') {
        drawDots(cr, horizontal, areaSize, size, color, number, spacing);
    } else {
        let length;
        let offset = 0;
        if (style === 'segmented') {
            length = Math.ceil((areaSize - (number - 1) * spacing) / number);
        } else {
            const preferred = style === 'dashes'
                ? Math.max(size * 2, Math.floor(areaSize / 4) - spacing)
                : size;
            length = markLength(areaSize, size, number, spacing, preferred);
            offset = Math.floor(
                (areaSize - number * length - (number - 1) * spacing) / 2
            );
        }
        for (let i = 0; i < number; i++) {
            drawRectangle(
                cr,
                horizontal,
                offset + i * (length + spacing),
                length,
                size
            );
        }
        setColor(cr, color);
        cr.fill();
    }

    cr.$dispose();
}

function drawKey(style, count, focused) {
    if (style === 'solid')
        return style;
    if (style === 'metro')
        return count > 1 ? `metro:multiple:${focused}` : 'metro:single';
    return `${style}:${count}`;
}

export const RunningIndicator = GObject.registerClass(
class RunningIndicator extends St.Widget {
    _init(styleClass, radiusSource = null) {
        super._init({
            style_class: styleClass,
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: false,
        });
        this._radiusSource = radiusSource;
        this._colorSource = new St.Widget({
            style_class: `${styleClass}-color-source`,
            visible: false,
        });
        this._fadeArea = new St.DrawingArea({visible: false});
        this._area = new St.DrawingArea({visible: false});
        this._pill = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            visible: false,
        });
        this._primary = new St.Widget({
            style_class: `${styleClass}-segment`,
        });
        this._secondary = new St.Widget({
            style_class: `${styleClass}-segment`,
            visible: false,
        });
        this._pill.add_child(this._primary);
        this._pill.add_child(this._secondary);
        this.add_child(this._colorSource);
        this.add_child(this._fadeArea);
        this.add_child(this._area);
        this.add_child(this._pill);
        this._style = 'rounded';
        this._position = 'bottom';
        this._length = 0;
        this._thickness = 0;
        this._cross = 0;
        this._inset = 0;
        this._count = 0;
        this._focused = false;
        this._color = null;
        this._segmentStyle = null;
        this._pillKey = null;
        this._drawKey = null;
        this._drawState = null;
        this._fadeState = null;
        this._fadeColor = null;
        this._paintedColor = null;
        this._area.connect('repaint', () => this._paint(this._area,
            this._drawState));
        this._fadeArea.connect('repaint', () => this._paint(this._fadeArea,
            this._fadeState));
    }

    update({x, y, length, thickness, cross, inset, position, style, count,
        focused, color}, animate = false) {
        const horizontal = runningIndicatorPositionIsHorizontal(position);
        const width = horizontal ? length : thickness;
        const height = horizontal ? thickness : length;
        const moved = this._position !== position ||
            this._style !== style ||
            this._length !== length ||
            this._thickness !== thickness ||
            this._cross !== cross ||
            this._inset !== inset;

        this._position = position;
        this._style = style;
        this._length = length;
        this._thickness = thickness;
        this._cross = cross;
        this._inset = inset;
        this._count = Math.min(count, MAX_RUNNING_INDICATORS);
        this._focused = focused;
        this.set_position(x, y);
        this.set_size(width, height);
        for (const area of [this._area, this._fadeArea]) {
            area.set_position(0, 0);
            area.set_size(width, height);
        }
        if (moved)
            this._pillKey = null;
        this._syncColor(color);

        const pill = runningIndicatorIsPill(style);
        this._pill.visible = pill;
        this._area.visible = !pill;
        if (pill) {
            this._endFade();
            this._syncPill(animate && !moved);
            return;
        }

        const key = drawKey(style, this._count, focused);
        const previousKey = this._drawKey;
        const previousState = this._drawState;
        this._drawKey = key;
        this._drawState = {
            style,
            count: this._count,
            focused,
        };
        if (animate && !moved && previousKey !== null && previousKey !== key)
            this._startFade(previousState);
        else
            this._endFade();
        this._area.queue_repaint();
    }

    _startFade(previousState) {
        this._fadeState = previousState;
        this._fadeColor = this._paintedColor;
        this._area.remove_transition('opacity');
        this._fadeArea.remove_transition('opacity');
        this._fadeArea.visible = true;
        this._fadeArea.opacity = 255;
        this._fadeArea.queue_repaint();
        this._area.opacity = 0;
        this._area.ease({
            opacity: 255,
            duration: ANIMATION_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._fadeArea.ease({
            opacity: 0,
            duration: ANIMATION_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._fadeArea.visible = false;
                this._fadeState = null;
                this._fadeColor = null;
            },
        });
    }

    _endFade() {
        this._area.remove_transition('opacity');
        this._fadeArea.remove_transition('opacity');
        this._area.opacity = 255;
        this._fadeArea.visible = false;
        this._fadeState = null;
        this._fadeColor = null;
    }

    _syncColor(color) {
        const fill = color ? `background-color: ${color};` : null;
        const segmentStyle = `border-radius: ${PILL_RADIUS}px; ${fill ?? ''}`;
        if (this._color !== color) {
            this._color = color;
            this._colorSource.set_style(fill);
            this._area.queue_repaint();
            this._fadeArea.queue_repaint();
        }

        if (this._segmentStyle === segmentStyle)
            return;

        this._segmentStyle = segmentStyle;
        this._primary.set_style(segmentStyle);
        this._secondary.set_style(segmentStyle);
    }

    _syncPill(animate) {
        const horizontal = runningIndicatorPositionIsHorizontal(this._position);
        const even = this._length % 2 === 0;
        const parity = even ? 0 : 1;
        const container = PILL_CONTAINER_LENGTH + parity;
        const multiple = this._count > 1;
        let bar = PILL_SINGLE_LENGTH - parity;
        if (this._focused)
            bar = container;
        else if (multiple)
            bar = PILL_MULTIPLE_LENGTH - parity;

        const show = this._focused && multiple;
        const segmentGap = container % 2 === 0
            ? SEGMENT_GAP
            : SEGMENT_GAP + 1;
        const secondaryLength = Math.max(
            1,
            Math.floor((container - segmentGap) / 2)
        );
        const primaryLength = show
            ? bar - segmentGap - secondaryLength
            : bar;
        const primaryOffset = (container - bar) / 2;
        const secondaryOffset = show
            ? primaryOffset + primaryLength + segmentGap
            : primaryOffset + primaryLength;
        const key = `${container}:${primaryLength}:${primaryOffset}:` +
            `${secondaryOffset}:${show}`;
        if (this._pillKey === key)
            return;

        this._pillKey = key;
        const containerOffset = Math.floor((this._length - container) / 2);
        this._pill.set_position(
            horizontal ? containerOffset : 0,
            horizontal ? 0 : containerOffset
        );
        this._pill.set_size(
            horizontal ? container : this._thickness,
            horizontal ? this._thickness : container
        );
        this._setCrossExtent(this._primary);
        this._setCrossExtent(this._secondary);
        this._setMainExtent(this._secondary, secondaryLength);

        const mainPosition = horizontal ? 'x' : 'y';
        const mainSize = horizontal ? 'width' : 'height';

        if (!animate) {
            for (const property of ANIMATED_PROPERTIES) {
                this._primary.remove_transition(property);
                this._secondary.remove_transition(property);
            }
            this._setMainExtent(this._primary, primaryLength);
            this._setMainOffset(this._primary, primaryOffset);
            this._setMainOffset(this._secondary, secondaryOffset);
            this._secondary.opacity = 255;
            this._secondary.visible = show;
            return;
        }

        this._primary.ease({
            [mainSize]: primaryLength,
            [mainPosition]: primaryOffset,
            duration: ANIMATION_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        if (show) {
            if (!this._secondary.visible) {
                this._setMainOffset(this._secondary, primaryOffset + bar);
                this._secondary.opacity = 0;
                this._secondary.visible = true;
            }
            this._secondary.ease({
                [mainPosition]: secondaryOffset,
                opacity: 255,
                duration: ANIMATION_DURATION,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            return;
        }

        this._secondary.ease({
            [mainPosition]: secondaryOffset,
            opacity: 0,
            duration: ANIMATION_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._secondary.visible = false;
                this._secondary.opacity = 255;
            },
        });
    }

    _setMainExtent(segment, length) {
        if (runningIndicatorPositionIsHorizontal(this._position))
            segment.set_width(length);
        else
            segment.set_height(length);
    }

    _setMainOffset(segment, offset) {
        if (runningIndicatorPositionIsHorizontal(this._position))
            segment.set_x(offset);
        else
            segment.set_y(offset);
    }

    _setCrossExtent(segment) {
        if (runningIndicatorPositionIsHorizontal(this._position)) {
            segment.set_height(this._thickness);
            segment.set_y(0);
        } else {
            segment.set_width(this._thickness);
            segment.set_x(0);
        }
    }

    _cornerRadius() {
        if (!this._radiusSource)
            return 0;

        return this._radiusSource.get_theme_node().get_border_radius(
            St.Corner.TOPLEFT
        );
    }

    _paint(area, state) {
        if (!state || this._length < 1)
            return;

        const fading = area === this._fadeArea;
        let color = fading ? this._fadeColor : null;
        if (!color) {
            color = this._colorSource.get_theme_node().get_background_color();
            if (!color.alpha)
                color = FALLBACK_COLOR;
        }
        if (!fading)
            this._paintedColor = color;
        const [areaWidth, areaHeight] = area.get_surface_size();
        const horizontal = runningIndicatorPositionIsHorizontal(this._position);
        const scale = (horizontal ? areaWidth : areaHeight) / this._length;
        drawRunningIndicator(area, {
            count: state.count,
            style: state.style,
            focused: state.focused,
            position: this._position,
            radius: this._cornerRadius() * scale,
            cross: this._cross * scale,
            glass: {
                start: -this._inset * scale,
                length: (this._length + this._inset * 2) * scale,
            },
        }, color);
    }
});
