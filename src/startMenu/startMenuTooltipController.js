// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TOOLTIP_DELAY = 500;
const TOOLTIP_SHOW_TIME = 120;
const TOOLTIP_HIDE_TIME = 100;

export class StartMenuTooltipController {
    constructor() {
        this._timeoutId = 0;
        this._source = null;
        this.actor = new St.Label({
            style_class: 'dash-label simple-taskbar-windows-start-tooltip',
            reactive: false,
            opacity: 0,
        });
        this.actor.clutter_text.set({
            ellipsize: Pango.EllipsizeMode.NONE,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
        });
        this.actor.hide();
        global.stage.add_child(this.actor);
    }

    add(button, app, label, alignLeft = false, alwaysShowTitle = false) {
        button.connect('notify::hover', () => {
            if (button.hover) {
                this._queue(
                    button,
                    app,
                    label,
                    alignLeft,
                    alwaysShowTitle
                );
            } else if (this._source === button) {
                this.hide();
            }
        });
        button.connect('destroy', () => {
            if (this._source === button)
                this.hide(true);
        });
    }

    hide(instant = false) {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this._source = null;
        if (!this.actor.visible)
            return;

        this.actor.remove_all_transitions();
        if (instant) {
            this.actor.opacity = 0;
            this.actor.hide();
            return;
        }

        const tooltip = this.actor;
        this.actor.ease({
            opacity: 0,
            duration: TOOLTIP_HIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => tooltip.hide(),
        });
    }

    destroy() {
        this.hide(true);
        this.actor.destroy();
        this.actor = null;
    }

    _queue(button, app, label, alignLeft, alwaysShowTitle) {
        this.hide(true);
        this._source = button;
        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            TOOLTIP_DELAY,
            () => {
                this._timeoutId = 0;
                if (this._source !== button || !button.hover)
                    return GLib.SOURCE_REMOVE;
                this._show(
                    button,
                    app,
                    label,
                    alignLeft,
                    alwaysShowTitle
                );
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _show(button, app, label, alignLeft, alwaysShowTitle) {
        const appDescription = app.get_description();
        const description = appDescription ? appDescription.trim() : '';
        const showTitle = alwaysShowTitle ||
            label.clutter_text.get_layout().is_ellipsized();
        if (!showTitle && !description) {
            this._source = null;
            return;
        }

        if (showTitle) {
            this.actor.text = '';
            const titleMarkup = GLib.markup_escape_text(app.get_name(), -1);
            const descriptionMarkup =
                GLib.markup_escape_text(description, -1);
            this.actor.clutter_text.set_markup(
                description
                    ? `<b>${titleMarkup}</b>\n${descriptionMarkup}`
                    : `<b>${titleMarkup}</b>`
            );
        } else {
            this.actor.text = description;
        }
        this.actor.opacity = 0;
        this.actor.show();

        const [buttonX, buttonY] = button.get_transformed_position();
        const [buttonWidth, buttonHeight] = button.get_transformed_size();
        const tooltipWidth = this.actor.width;
        const tooltipHeight = this.actor.height;
        const monitor = Main.layoutManager.findMonitorForActor(button) ??
            Main.layoutManager.primaryMonitor;
        const gap = 6;
        const minX = monitor.x + gap;
        const maxX = monitor.x + monitor.width - tooltipWidth - gap;
        const [labelX] = label.get_transformed_position();
        const desiredX = alignLeft
            ? labelX
            : buttonX + Math.floor((buttonWidth - tooltipWidth) / 2);
        const x = Math.clamp(desiredX, minX, Math.max(minX, maxX));
        const belowY = buttonY + buttonHeight + gap;
        const aboveY = buttonY - tooltipHeight - gap;
        const y = belowY + tooltipHeight <= monitor.y + monitor.height - gap
            ? belowY
            : Math.max(monitor.y + gap, aboveY);

        this.actor.set_position(Math.round(x), Math.round(y));
        this.actor.ease({
            opacity: 255,
            duration: TOOLTIP_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }
}
