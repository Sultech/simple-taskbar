// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

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
