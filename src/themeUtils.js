// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {dockBlurStylesDock} from './integration/blurMyShellRuntime.js';
import {
    BLUR_MY_SHELL_DOCK_DARK,
    BLUR_MY_SHELL_DOCK_LIGHT,
    BLUR_MY_SHELL_DOCK_TRANSPARENT,
    blurMyShellDockStyle,
} from './shared/blurMyShellUtils.js';

function _luminance(color) {
    return (0.299 * color.red +
        0.587 * color.green +
        0.114 * color.blue) / 255;
}

// Popup menus reflect the Shell palette more reliably than the panel.
export function shellMenusUseLightTheme() {
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

export function panelUsesLightTheme(settings) {
    if (!settings.isDock)
        return Main.panel.has_style_class_name(
            'simple-taskbar-theme-light'
        );

    const blurStyle = dockBlurStylesDock(settings) ? blurMyShellDockStyle() : null;
    if (blurStyle === BLUR_MY_SHELL_DOCK_LIGHT)
        return true;
    if (blurStyle === BLUR_MY_SHELL_DOCK_DARK)
        return false;
    if (blurStyle !== null && blurStyle !== BLUR_MY_SHELL_DOCK_TRANSPARENT)
        return shellMenusUseLightTheme();

    if (!settings.get_boolean('panel-theme-follow-system'))
        return settings.get_string('panel-theme') === 'light';

    return shellMenusUseLightTheme();
}
