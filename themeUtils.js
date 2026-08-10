// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function _luminance(color) {
    return (0.299 * color.red +
        0.587 * color.green +
        0.114 * color.blue) / 255;
}

function _probeShellMenusUseLightTheme() {
    const probeMenu = new St.BoxLayout({style_class: 'popup-menu'});
    const probeContent = new St.BoxLayout({style_class: 'popup-menu-content'});
    probeMenu.add_child(probeContent);
    Main.uiGroup.add_child(probeMenu);

    try {
        const background = probeContent.get_theme_node()
            .get_background_color();
        if (background.alpha > 0)
            return _luminance(background) >= 0.5;

        // Fully transparent menu surfaces are better classified by their
        // intended text contrast: dark glyphs indicate light Shell chrome.
        const foreground = probeMenu.get_theme_node()
            .get_foreground_color();
        return _luminance(foreground) < 0.5;
    } finally {
        probeMenu.destroy();
    }
}

// Popup menus reflect the Shell palette more reliably than the panel.
export function shellMenusUseLightTheme() {
    return _probeShellMenusUseLightTheme();
}

const DOMINANT_COLOR_ICON_SIZE = 64;
const _iconColorCache = new Map();

export function clearIconColorCache() {
    _iconColorCache.clear();
}

function _ColorLuminance(r, g, b, dlum = 0) {
    const rClamped = Math.round(Math.min(Math.max(r * (1 + dlum), 0), 255));
    const gClamped = Math.round(Math.min(Math.max(g * (1 + dlum), 0), 255));
    const bClamped = Math.round(Math.min(Math.max(b * (1 + dlum), 0), 255));
    return `#${rClamped.toString(16).padStart(2, '0')}${gClamped.toString(16).padStart(2, '0')}${bClamped.toString(16).padStart(2, '0')}`;
}

function _RGBtoHSV(r, g, b) {
    const M = Math.max(r, g, b);
    const m = Math.min(r, g, b);
    const c = M - m;

    let h = 0;
    if (c === 0) {
        h = 0;
    } else if (M === r) {
        h = ((g - b) / c) % 6;
    } else if (M === g) {
        h = (b - r) / c + 2;
    } else {
        h = (r - g) / c + 4;
    }

    if (h < 0) h += 6;
    h /= 6;

    const v = M / 255;
    const s = M !== 0 ? c / M : 0;

    return { h, s, v };
}

function _HSVtoRGB(h, s, v) {
    const c = v * s;
    const h1 = h * 6;
    const x = c * (1 - Math.abs((h1 % 2) - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;
    if (h1 <= 1) {
        r = c + m; g = x + m; b = m;
    } else if (h1 <= 2) {
        r = x + m; g = c + m; b = m;
    } else if (h1 <= 3) {
        r = m; g = c + m; b = x + m;
    } else if (h1 <= 4) {
        r = m; g = x + m; b = c + m;
    } else if (h1 <= 5) {
        r = x + m; g = m; b = c + m;
    } else {
        r = c + m; g = m; b = x + m;
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

function _getIconPixBuf(app) {
    if (!app) return null;
    let gicon = null;

    if (typeof app.create_icon_texture === 'function') {
        try {
            const iconTexture = app.create_icon_texture(DOMINANT_COLOR_ICON_SIZE);
            if (iconTexture && typeof iconTexture.get_gicon === 'function')
                gicon = iconTexture.get_gicon();
        } catch (e) {}
    }

    if (!gicon) {
        if (typeof app.get_icon === 'function')
            gicon = app.get_icon();
        else if (app.get_app_info && app.get_app_info())
            gicon = app.get_app_info().get_icon();
        else if (app.gicon)
            gicon = app.gicon;
        else
            gicon = app;
    }

    if (!gicon) return null;

    if (gicon instanceof Gio.EmblemedIcon && typeof gicon.get_icon === 'function') {
        gicon = gicon.get_icon();
    }

    if (!gicon) return null;

    try {
        if (gicon instanceof Gio.FileIcon) {
            const file = gicon.get_file();
            const path = file ? file.get_path() : null;
            if (path && !path.includes('image-missing'))
                return GdkPixbuf.Pixbuf.new_from_file_at_scale(path, DOMINANT_COLOR_ICON_SIZE, DOMINANT_COLOR_ICON_SIZE, true);
        } else if (gicon instanceof Gio.ThemedIcon) {
            const themeLoader = (typeof St !== 'undefined' && St.IconTheme) ?
                ((St.IconTheme.get_for_display && typeof global !== 'undefined' && global.display) ? St.IconTheme.get_for_display(global.display) : St.IconTheme.new()) :
                null;

            if (themeLoader) {
                let iconInfo = null;

                if (typeof themeLoader.lookup_by_gicon === 'function') {
                    try {
                        iconInfo = themeLoader.lookup_by_gicon(gicon, DOMINANT_COLOR_ICON_SIZE, 0);
                    } catch (e) {}
                }

                if (!iconInfo) {
                    const iconNames = gicon.get_names ? gicon.get_names() : [];
                    for (const name of iconNames) {
                        try {
                            if (typeof themeLoader.lookup_icon === 'function') {
                                const info = themeLoader.lookup_icon(name, DOMINANT_COLOR_ICON_SIZE, 0);
                                if (info) {
                                    iconInfo = info;
                                    break;
                                }
                            }
                        } catch (e) {}
                    }
                }

                if (iconInfo) {
                    if (typeof iconInfo.load_icon === 'function') {
                        try {
                            const pix = iconInfo.load_icon();
                            if (pix) return pix;
                        } catch (e) {}
                    }

                    let iconFile = null;
                    if (typeof iconInfo.get_filename === 'function') {
                        iconFile = iconInfo.get_filename();
                    } else if (typeof iconInfo.get_file === 'function') {
                        const f = iconInfo.get_file();
                        iconFile = f ? f.get_path() : null;
                    }

                    if (iconFile && !iconFile.includes('image-missing') && !iconFile.includes('missing')) {
                        return GdkPixbuf.Pixbuf.new_from_file_at_scale(iconFile, DOMINANT_COLOR_ICON_SIZE, DOMINANT_COLOR_ICON_SIZE, true);
                    }
                }
            }
        } else if (typeof gicon.load === 'function') {
            const [iconBuffer] = gicon.load(DOMINANT_COLOR_ICON_SIZE, null);
            if (iconBuffer)
                return GdkPixbuf.Pixbuf.new_from_stream(iconBuffer, null);
        }
    } catch (e) {}

    return null;
}

export function getIconDominantColor(app) {
    if (!app) return null;

    let cacheKey = null;
    if (typeof app.get_id === 'function') {
        cacheKey = app.get_id();
    } else if (app.to_string) {
        cacheKey = app.to_string();
    } else if (typeof app === 'string') {
        cacheKey = app;
    }

    if (cacheKey && _iconColorCache.has(cacheKey)) {
        return _iconColorCache.get(cacheKey);
    }

    try {
        const pixBuf = _getIconPixBuf(app);
        if (!pixBuf) return null;

        const width = pixBuf.get_width();
        const height = pixBuf.get_height();
        const rowstride = pixBuf.get_rowstride();
        const nChannels = pixBuf.get_n_channels();
        const pixels = pixBuf.get_pixels();

        if (!pixels || pixels.length === 0) return null;

        let total = 0,
            rTotal = 0,
            gTotal = 0,
            bTotal = 0;

        const step = 2;
        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                const offset = y * rowstride + x * nChannels;
                if (offset + 2 >= pixels.length) continue;

                const r = pixels[offset];
                const g = pixels[offset + 1];
                const b = pixels[offset + 2];
                const a = nChannels >= 4 ? pixels[offset + 3] : 255;

                if (a < 30) continue;

                const saturation = Math.max(r, g, b) - Math.min(r, g, b);
                const relevance = 0.1 * 255 * 255 + 0.9 * a * saturation;

                rTotal += r * relevance;
                gTotal += g * relevance;
                bTotal += b * relevance;
                total += relevance;
            }
        }

        if (total === 0 || Number.isNaN(total)) return null;

        total *= 255;
        const r = rTotal / total;
        const g = gTotal / total;
        const b = bTotal / total;

        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;

        const hsv = _RGBtoHSV(r * 255, g * 255, b * 255);
        if (Number.isNaN(hsv.h) || Number.isNaN(hsv.s) || Number.isNaN(hsv.v)) return null;

        if (hsv.s > 0.15)
            hsv.s = 0.65;
        hsv.v = 0.90;

        const rgb = _HSVtoRGB(hsv.h, hsv.s, hsv.v);
        const hexColor = _ColorLuminance(rgb.r, rgb.g, rgb.b, 0);

        if (!/^#[0-9a-fA-F]{6}$/.test(hexColor)) return null;

        if (cacheKey) {
            _iconColorCache.set(cacheKey, hexColor);
        }
        return hexColor;
    } catch (e) {
        return null;
    }
}
