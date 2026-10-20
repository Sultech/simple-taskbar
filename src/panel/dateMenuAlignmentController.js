// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';

import {panelIsVertical} from './panelPosition.js';

const CLOCK_SHOW_DATE_SETTING = 'clock-show-date';
const CLOCK_SHOW_SECONDS_SETTING = 'clock-show-seconds';
const CLOCK_SHOW_WEEKDAY_SETTING = 'clock-show-weekday';

export class DateMenuAlignmentController {
    constructor(settings, dateMenu, panelHeight) {
        this._settings = settings;
        this._panelHeight = panelHeight;
        this._dateMenu = dateMenu;
        const displayBox = dateMenu.get_first_child();
        this._indicatorPad = displayBox.get_first_child();
        this._indicatorPadConstraints = [...this._indicatorPad.get_constraints()];
        this._clockText = dateMenu._clockDisplay.clutter_text;
        this._clockTextTranslationX = this._clockText.translation_x;
        this._clockTextTranslationY = this._clockText.translation_y;
        this._desktopSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._desktopSettings.connectObject(
            `changed::${CLOCK_SHOW_DATE_SETTING}`, () => this.sync(this._panelHeight),
            `changed::${CLOCK_SHOW_SECONDS_SETTING}`, () => this.sync(this._panelHeight),
            `changed::${CLOCK_SHOW_WEEKDAY_SETTING}`, () => this.sync(this._panelHeight),
            this
        );
        this._indicatorPad.clear_constraints();
        this._indicatorPad.queue_relayout();
        dateMenu.queue_relayout();
        this.sync(panelHeight);
    }

    sync(panelHeight) {
        this._panelHeight = panelHeight;
        if (panelIsVertical(this._settings)) {
            const clockHasAdditionalText =
                this._desktopSettings.get_boolean(CLOCK_SHOW_DATE_SETTING) ||
                this._desktopSettings.get_boolean(CLOCK_SHOW_SECONDS_SETTING) ||
                this._desktopSettings.get_boolean(CLOCK_SHOW_WEEKDAY_SETTING);
            const parityOffset = clockHasAdditionalText &&
                panelHeight % 2 === 0 ? 1 : 0;
            this._clockText.translation_x =
                this._clockTextTranslationX + parityOffset;
            this._clockText.translation_y = this._clockTextTranslationY;
            return;
        }

        this._clockText.translation_x = this._clockTextTranslationX;
        const dateShown = this._desktopSettings.get_boolean(
            CLOCK_SHOW_DATE_SETTING
        );
        const parityOffset = dateShown ? 0 : panelHeight % 2 === 0 ? 1 : 0;
        this._clockText.translation_y =
            this._clockTextTranslationY + parityOffset;
    }

    destroy() {
        this._desktopSettings.disconnectObject(this);
        for (const constraint of this._indicatorPadConstraints)
            this._indicatorPad.add_constraint(constraint);
        this._indicatorPad.queue_relayout();
        this._dateMenu.queue_relayout();
        this._clockText.translation_x = this._clockTextTranslationX;
        this._clockText.translation_y = this._clockTextTranslationY;
        this._desktopSettings = null;
        this._indicatorPad = null;
        this._indicatorPadConstraints = null;
        this._clockText = null;
        this._dateMenu = null;
        this._settings = null;
    }
}
