// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {taskbarItemHighlightShown} from '../shared/classicHighlightSettings.js';
import {panelIsTop, panelPosition, positionIsVertical} from '../shared/panelPositionUtils.js';

const APP_TOOLTIP_DELAY = 300;
const APP_TOOLTIP_SHOW_TIME = 150;
const APP_TOOLTIP_HIDE_TIME = 100;
const APP_TOOLTIP_CLOSE_DELAY = 300;
const APP_TOOLTIP_GAP = 8;

export class TaskbarTooltipController {
    constructor({settings, getItemAtPointer, getHoverAnimationOutwardReserve,
        getHoverAnimationTooltipRect, isPointerInMagnifyBounds, raiseOverlays}) {
        this._settings = settings;
        this._getItemAtPointer = getItemAtPointer;
        this._getHoverAnimationOutwardReserve = getHoverAnimationOutwardReserve;
        this._getHoverAnimationTooltipRect = getHoverAnimationTooltipRect;
        this._isPointerInMagnifyBounds = isPointerInMagnifyBounds;
        this._raiseOverlays = raiseOverlays;
        this._appTooltip = null;
        this._tooltipItem = null;
        this._tooltipItemDestroyId = 0;
        this._tooltipTimeoutId = 0;
        this._tooltipCloseId = 0;
    }

    get item() {
        return this._tooltipItem;
    }

    destroy() {
        this.hide(false);
        this._appTooltip?.destroy();
        this._appTooltip = null;
        this._settings = null;
        this._getItemAtPointer = null;
        this._getHoverAnimationOutwardReserve = null;
        this._getHoverAnimationTooltipRect = null;
        this._isPointerInMagnifyBounds = null;
        this._raiseOverlays = null;
    }

    raise() {
        if (this._appTooltip)
            Main.uiGroup.set_child_above_sibling(this._appTooltip, null);
    }

    _clearTimeout(name) {
        if (this[name])
            GLib.Source.remove(this[name]);
        this[name] = 0;
    }

    schedule(item) {
        this._clearTimeout('_tooltipCloseId');
        if (this._tooltipItem === item &&
            (this._tooltipTimeoutId || this._appTooltip?.visible))
            return;

        if (this._tooltipTimeoutId)
            GLib.Source.remove(this._tooltipTimeoutId);
        const delay = this._appTooltip?.visible ? 0 : APP_TOOLTIP_DELAY;
        this._setTooltipItem(item);
        this._tooltipTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                this._tooltipTimeoutId = 0;
                if (this._tooltipItem === item && item.mapped)
                    this._showTooltip(item);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    hide(animate = true) {
        this._clearTimeout('_tooltipTimeoutId');
        this._clearTimeout('_tooltipCloseId');
        this._hide(animate);
    }

    scheduleClose() {
        if (!this._tooltipItem)
            return;
        if (!this._appTooltip?.visible) {
            this.hide();
            return;
        }
        if (this._tooltipCloseId)
            return;

        this._tooltipCloseId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            APP_TOOLTIP_CLOSE_DELAY,
            () => {
                if (!this._isPointerInMagnifyBounds() ||
                    this._getItemAtPointer() !== this._tooltipItem) {
                    this._tooltipCloseId = 0;
                    this.hide();
                    return GLib.SOURCE_REMOVE;
                }

                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _setTooltipItem(item) {
        if (this._tooltipItem === item)
            return;
        if (this._tooltipItemDestroyId) {
            this._tooltipItem.disconnect(this._tooltipItemDestroyId);
            this._tooltipItemDestroyId = 0;
        }
        this._tooltipItem = item;
        if (item) {
            this._tooltipItemDestroyId = item.connect('destroy', () => {
                this._tooltipItemDestroyId = 0;
                this.hide(false);
            });
        }
    }

    _hide(animate) {
        this._setTooltipItem(null);

        const label = this._appTooltip;
        if (!label?.visible)
            return;

        label.remove_all_transitions();
        if (!animate) {
            label.hide();
            return;
        }

        label.ease({
            opacity: 0,
            duration: APP_TOOLTIP_HIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!this._tooltipItem)
                    label.hide();
            },
        });
    }

    _showTooltip(item) {
        if (!this._appTooltip) {
            this._appTooltip = new St.Label({style_class: 'dash-label'});
            this._appTooltip.hide();
            Main.layoutManager.addChrome(this._appTooltip);
        }

        const label = this._appTooltip;
        this._raiseOverlays();
        label.remove_all_transitions();
        label.set_text(item._taskbarApp.get_name());
        label.opacity = 0;
        label.show();
        this._positionTooltip(item);
        label.ease({
            opacity: 255,
            duration: APP_TOOLTIP_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    syncPosition() {
        if (!this._appTooltip?.visible || !this._tooltipItem)
            return;

        const magnifiedAnchor = this._magnifiedAnchorRect(this._tooltipItem);
        if (magnifiedAnchor || this._getHoverAnimationOutwardReserve() > 0)
            this._positionTooltip(this._tooltipItem, magnifiedAnchor);
    }

    _magnifiedAnchorRect(item) {
        return this._getHoverAnimationTooltipRect(item, taskbarItemHighlightShown(this._settings, item));
    }

    _restingAnchorRect(item, position) {
        const [x, y] = item.get_transformed_position();
        const outward = this._getHoverAnimationOutwardReserve();
        const anchor = {
            x1: x,
            y1: y,
            x2: x + item.allocation.get_width(),
            y2: y + item.allocation.get_height(),
        };
        if (position === 'top')
            anchor.y2 += outward;
        else if (position === 'bottom')
            anchor.y1 -= outward;
        else if (position === 'left')
            anchor.x2 += outward;
        else
            anchor.x1 -= outward;
        return anchor;
    }

    _positionTooltip(item, magnifiedAnchor = this._magnifiedAnchorRect(item)) {
        const label = this._appTooltip;
        const [, labelWidth] = label.get_preferred_width(-1);
        const [, labelHeight] = label.get_preferred_height(labelWidth);
        const monitor = Main.layoutManager.findMonitorForActor(item) ??
            Main.layoutManager.primaryMonitor;
        const position = panelPosition(this._settings);
        const anchor = magnifiedAnchor ?? this._restingAnchorRect(item, position);
        let x;
        let y;
        if (positionIsVertical(position)) {
            x = position === 'left'
                ? Math.min(monitor.x + monitor.width - labelWidth, anchor.x2 + APP_TOOLTIP_GAP)
                : Math.max(monitor.x, anchor.x1 - labelWidth - APP_TOOLTIP_GAP);
            y = Math.clamp(
                Math.floor((anchor.y1 + anchor.y2 - labelHeight) / 2),
                monitor.y,
                monitor.y + monitor.height - labelHeight
            );
        } else {
            x = Math.clamp(
                Math.floor((anchor.x1 + anchor.x2 - labelWidth) / 2),
                monitor.x,
                monitor.x + monitor.width - labelWidth
            );
            y = panelIsTop(this._settings)
                ? Math.min(monitor.y + monitor.height - labelHeight, anchor.y2 + APP_TOOLTIP_GAP)
                : Math.max(monitor.y, anchor.y1 - labelHeight - APP_TOOLTIP_GAP);
        }
        x = Math.round(x);
        y = Math.round(y);
        if (label.x !== x || label.y !== y)
            label.set_position(x, y);
    }
}
