// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';

import {isSuperOverlayKey} from './shared/keybindingUtils.js';

const OVERLAY_RECOVERY_KEY = 'start-menu-displaced-overlay-key';

export function restoreOverlayKey(settings) {
    const [overlayKey] = settings.get_strv(OVERLAY_RECOVERY_KEY);
    if (overlayKey !== undefined) {
        const mutterSettings = new Gio.Settings({
            schema_id: 'org.gnome.mutter',
        });
        if (isSuperOverlayKey(
            mutterSettings.get_string('overlay-key')
        )) {
            mutterSettings.set_string('overlay-key', overlayKey);
        }
        settings.set_strv(OVERLAY_RECOVERY_KEY, []);
    }
}
