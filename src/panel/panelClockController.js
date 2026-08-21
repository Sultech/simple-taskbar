// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import Pango from 'gi://Pango';

import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {panelIsVertical} from './panelPosition.js';

export class PanelClockController {
    constructor(settings, dateMenu, getPanelThickness) {
        this._settings = settings;
        this._dateMenu = dateMenu;
        this._getPanelThickness = getPanelThickness;
        this._signalHolder = new TransientSignalHolder();
        this._desktopSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._originalEllipsize = null;
        this._originalNaturalWidth = null;
        this._originalNaturalWidthSet = null;
        this._originalUseMarkup = null;
        this._clockFormat = null;
        this._formatted = false;
        this._vertical = null;
        this._clockAfterUpdateId = 0;
    }

    enable() {
        this._dateMenu._clock.connectObject(
            'notify::clock', () => this.sync(),
            this._signalHolder
        );
        this._desktopSettings.connectObject(
            'changed::clock-format', () => {
                this._clockFormat = null;
                this.sync();
            },
            this._signalHolder
        );
        this._syncPanelPosition();
    }

    sync() {
        if (!panelIsVertical(this._settings)) {
            if (this._formatted)
                this._restoreClockText();
            return;
        }

        const datetime = this._dateMenu._clock.clock;
        let datetimeParts = datetime.split(' ');
        let time = datetimeParts[1];
        const clockText = this._dateMenu._clockDisplay.clutter_text;
        if (!this._formatted)
            this._captureClockText();
        const setClockText = (text, useTimeSeparator = false) => {
            const stacks = Array.isArray(text);
            const separator = `\n<span size="8192"> ${
                useTimeSeparator ? '‧‧' : '—'
            } </span>\n`;
            clockText.set_text(
                (stacks ? text.join(separator) : text).trim()
            );
            clockText.set_use_markup(stacks);
            clockText.get_allocation_box();
            return !clockText.get_layout().is_ellipsized();
        };

        if (clockText.ellipsize === Pango.EllipsizeMode.NONE)
            clockText.ellipsize = Pango.EllipsizeMode.END;
        clockText.natural_width = this._getPanelThickness();
        this._formatted = true;

        if (!time) {
            datetimeParts = datetime.split(' ');
            time = datetimeParts.pop();
            datetimeParts = [datetimeParts.join(' '), time];
        }

        const datetimeFits = setClockText(datetime);
        const datetimePartsFit = !datetimeFits &&
            setClockText(datetimeParts);
        const timeFits = !datetimeFits &&
            !datetimePartsFit &&
            setClockText(time);
        if (!datetimeFits && !datetimePartsFit && !timeFits) {
            const timeSeparator = time.includes('∶') ? '∶' : ':';
            const timeParts = time.split(timeSeparator);
            this._clockFormat ??=
                this._desktopSettings.get_string('clock-format');
            if (this._clockFormat === '12h') {
                timeParts.push(...timeParts.pop().split(' '));
            }
            setClockText(timeParts, true);
        }
    }

    destroy() {
        if (this._clockAfterUpdateId) {
            global.stage.disconnect(this._clockAfterUpdateId);
            this._clockAfterUpdateId = 0;
        }
        this._signalHolder.destroy();
        this._signalHolder = null;
        if (this._formatted)
            this._restoreClockText();
        this._desktopSettings = null;
        this._settings = null;
        this._dateMenu = null;
        this._getPanelThickness = null;
    }

    _syncPanelPosition() {
        const vertical = panelIsVertical(this._settings);
        if (vertical === this._vertical)
            return;

        this._vertical = vertical;
        if (this._clockAfterUpdateId) {
            global.stage.disconnect(this._clockAfterUpdateId);
            this._clockAfterUpdateId = 0;
        }
        if (!vertical) {
            this.sync();
            return;
        }

        this._clockAfterUpdateId = global.stage.connect(
            'after-update', () => {
                global.stage.disconnect(this._clockAfterUpdateId);
                this._clockAfterUpdateId = 0;
                this.sync();
            }
        );
        this._dateMenu._clockDisplay.queue_relayout();
    }

    _restoreClockText() {
        const clockText = this._dateMenu._clockDisplay.clutter_text;
        clockText.set_use_markup(this._originalUseMarkup);
        clockText.set_text(this._dateMenu._clock.clock);
        clockText.ellipsize = this._originalEllipsize;
        clockText.natural_width = this._originalNaturalWidth;
        clockText.natural_width_set = this._originalNaturalWidthSet;
        this._formatted = false;
    }

    _captureClockText() {
        const clockText = this._dateMenu._clockDisplay.clutter_text;
        this._originalEllipsize = clockText.ellipsize;
        this._originalNaturalWidth = clockText.natural_width;
        this._originalNaturalWidthSet = clockText.natural_width_set;
        this._originalUseMarkup = clockText.get_use_markup();
    }
}
