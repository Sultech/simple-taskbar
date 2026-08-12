// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import St from 'gi://St';

const XP_TRANSLATION_Y = 1;
const XP_ACTIVE_TRANSLATION_Y = 2;

export class ApplicationOverflowButtonController {
    constructor(settings, button, icon, menu) {
        this._settings = settings;
        this._button = button;
        this._icon = icon;
        this._menu = menu;
        this._buttonTranslationY = null;
        this._iconTranslationY = null;
        this._compensated = false;
        this._restoreTimeoutId = 0;
    }

    sync() {
        if (!this._settings.get_boolean('windows-xp-theme-enabled')) {
            this.restore();
            return;
        }
        if (this._menu.isOpen)
            return;

        if (this._buttonTranslationY === null)
            this._buttonTranslationY = this._button.translation_y;
        if (this._iconTranslationY === null)
            this._iconTranslationY = this._icon.translation_y;

        const active = !this._isResting();
        if (!active && this._compensated) {
            this._scheduleRestore();
            return;
        }
        this._cancelRestore();
        this._setPosition(active);
    }

    restore() {
        this._cancelRestore();
        if (this._buttonTranslationY === null)
            return;
        this._button.translation_y = this._buttonTranslationY;
        this._icon.translation_y = this._iconTranslationY;
        this._compensated = false;
    }

    destroy() {
        this.restore();
        this._menu = null;
        this._icon = null;
        this._button = null;
        this._settings = null;
    }

    _isResting() {
        return !this._button.hover && !this._button.has_key_focus();
    }

    _setPosition(active) {
        const translationY = active
            ? XP_ACTIVE_TRANSLATION_Y
            : XP_TRANSLATION_Y;
        this._button.translation_y =
            this._buttonTranslationY + translationY;
        this._icon.translation_y =
            this._iconTranslationY - (translationY - XP_TRANSLATION_Y);
        this._compensated = active;
    }

    _scheduleRestore() {
        if (this._restoreTimeoutId)
            return;

        const duration = this._button.mapped &&
            St.Settings.get().enable_animations
            ? this._button.get_theme_node().get_transition_duration()
            : 0;
        if (duration === 0) {
            this._setPosition(false);
            return;
        }

        this._restoreTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            duration,
            () => {
                this._restoreTimeoutId = 0;
                if (this._isResting() && !this._menu.isOpen)
                    this._setPosition(false);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelRestore() {
        if (!this._restoreTimeoutId)
            return;
        GLib.Source.remove(this._restoreTimeoutId);
        this._restoreTimeoutId = 0;
    }
}
