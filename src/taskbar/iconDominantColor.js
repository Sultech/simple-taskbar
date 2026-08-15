// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

const ICON_SIZE = 48;
const SAMPLE_STEP = 2;
const MINIMUM_ALPHA = 30;
const SATURATION_THRESHOLD = 0.15;
const NORMALISED_SATURATION = 0.65;
const NORMALISED_VALUE = 0.9;

function iconPixbuf(app, iconTheme) {
    const iconTexture = app.create_icon_texture(ICON_SIZE);
    if (!(iconTexture instanceof St.Icon))
        return null;

    let gicon = iconTexture.get_gicon();
    if (gicon instanceof Gio.EmblemedIcon)
        gicon = gicon.get_icon();

    if (gicon instanceof Gio.FileIcon) {
        return GdkPixbuf.Pixbuf.new_from_file_at_scale(
            gicon.get_file().get_path(),
            ICON_SIZE,
            ICON_SIZE,
            true
        );
    }

    if (gicon instanceof Gio.ThemedIcon) {
        const iconInfo = iconTheme.lookup_by_gicon(
            gicon,
            ICON_SIZE,
            St.IconLookupFlags.FORCE_SIZE
        );
        return iconInfo ? iconInfo.load_icon() : null;
    }

    if (gicon instanceof Gio.LoadableIcon) {
        const [stream] = gicon.load(ICON_SIZE, null);
        return GdkPixbuf.Pixbuf.new_from_stream(stream, null);
    }

    return null;
}

function averageColor(pixbuf) {
    const width = pixbuf.get_width();
    const height = pixbuf.get_height();
    const rowstride = pixbuf.get_rowstride();
    const channels = pixbuf.get_n_channels();
    const pixels = pixbuf.get_pixels();

    let total = 0;
    let redTotal = 0;
    let greenTotal = 0;
    let blueTotal = 0;

    for (let y = 0; y < height; y += SAMPLE_STEP) {
        for (let x = 0; x < width; x += SAMPLE_STEP) {
            const offset = y * rowstride + x * channels;
            const red = pixels[offset];
            const green = pixels[offset + 1];
            const blue = pixels[offset + 2];
            const alpha = channels >= 4 ? pixels[offset + 3] : 255;
            if (alpha < MINIMUM_ALPHA)
                continue;

            const saturation = Math.max(red, green, blue) -
                Math.min(red, green, blue);
            const relevance = 0.1 * 255 * 255 + 0.9 * alpha * saturation;

            redTotal += red * relevance;
            greenTotal += green * relevance;
            blueTotal += blue * relevance;
            total += relevance;
        }
    }

    if (total === 0)
        return null;

    return {
        red: redTotal / total,
        green: greenTotal / total,
        blue: blueTotal / total,
    };
}

function toHueSaturationValue({red, green, blue}) {
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const chroma = maximum - minimum;

    let hue = 0;
    if (chroma !== 0) {
        if (maximum === red)
            hue = ((green - blue) / chroma) % 6;
        else if (maximum === green)
            hue = (blue - red) / chroma + 2;
        else
            hue = (red - green) / chroma + 4;
    }
    if (hue < 0)
        hue += 6;

    return {
        hue: hue / 6,
        saturation: maximum === 0 ? 0 : chroma / maximum,
        value: maximum / 255,
    };
}

function toHex({hue, saturation, value}) {
    const chroma = value * saturation;
    const sector = hue * 6;
    const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
    const offset = value - chroma;

    let red = 0;
    let green = 0;
    let blue = 0;
    if (sector <= 1)
        [red, green, blue] = [chroma, secondary, 0];
    else if (sector <= 2)
        [red, green, blue] = [secondary, chroma, 0];
    else if (sector <= 3)
        [red, green, blue] = [0, chroma, secondary];
    else if (sector <= 4)
        [red, green, blue] = [0, secondary, chroma];
    else if (sector <= 5)
        [red, green, blue] = [secondary, 0, chroma];
    else
        [red, green, blue] = [chroma, 0, secondary];

    const channel = component => Math.round((component + offset) * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

export class IconDominantColorCache {
    constructor() {
        this._colors = new Map();
        this._iconTheme = new St.IconTheme();
        this._signalHolder = new TransientSignalHolder();
        St.TextureCache.get_default().connectObject(
            'icon-theme-changed', () => this._colors.clear(),
            this._signalHolder
        );
    }

    destroy() {
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._colors.clear();
        this._colors = null;
        this._iconTheme = null;
    }

    getColor(app) {
        const appId = app.get_id();
        if (this._colors.has(appId))
            return this._colors.get(appId);

        const color = this._extractColor(app);
        this._colors.set(appId, color);
        return color;
    }

    _extractColor(app) {
        // GdkPixbuf loaders and St.IconInfo.load_icon() report failure through
        // a GError, which GJS raises: a .desktop file naming an icon that is
        // not installed would otherwise abort the indicator sync.
        let pixbuf = null;
        try {
            pixbuf = iconPixbuf(app, this._iconTheme);
        } catch (error) {
            console.warn(
                `Simple Taskbar: no icon color for ${app.get_id()}: ` +
                `${error.message}`
            );
            return null;
        }
        if (!pixbuf)
            return null;

        const average = averageColor(pixbuf);
        if (!average)
            return null;

        const hsv = toHueSaturationValue(average);
        return toHex({
            hue: hsv.hue,
            saturation: hsv.saturation > SATURATION_THRESHOLD
                ? NORMALISED_SATURATION
                : hsv.saturation,
            value: NORMALISED_VALUE,
        });
    }
}
