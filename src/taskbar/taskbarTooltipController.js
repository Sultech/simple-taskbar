// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {panelIsTop, panelPosition, positionIsVertical} from '../shared/panelPositionUtils.js';

const APP_TOOLTIP_DELAY = 300;
const APP_TOOLTIP_SHOW_TIME = 150;
const APP_TOOLTIP_HIDE_TIME = 100;
const APP_TOOLTIP_CLOSE_DELAY = 300;

export class TaskbarTooltipController {
    constructor({settings, getItemAtPointer, getHoverAnimationOutwardReserve,
        isPointerInMagnifyBounds, raiseOverlays}) {
        this._settings = settings;
        this._getItemAtPointer = getItemAtPointer;
        this._getHoverAnimationOutwardReserve = getHoverAnimationOutwardReserve;
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
        if (this._appTooltip && this._appTooltip.visible && this._tooltipItem &&
            this._getHoverAnimationOutwardReserve() > 0)
            this._positionTooltip(this._tooltipItem);
    }

    _positionTooltip(item) {
        const label = this._appTooltip;
        const [stageX, stageY] = item.get_transformed_position();
        const [, labelWidth] = label.get_preferred_width(-1);
        const [, labelHeight] = label.get_preferred_height(labelWidth);
        const monitor = Main.layoutManager.findMonitorForActor(item) ??
            Main.layoutManager.primaryMonitor;
        const itemWidth = item.allocation.get_width();
        const itemHeight = item.allocation.get_height();
        const position = panelPosition(this._settings);
        const outward = this._getHoverAnimationOutwardReserve();
        let x;
        let y;
        if (positionIsVertical(position)) {
            x = position === 'left'
                ? Math.min(
                    monitor.x + monitor.width - labelWidth,
                    stageX + itemWidth + 8 + outward
                )
                : Math.max(monitor.x, stageX - labelWidth - 8 - outward);
            y = Math.clamp(
                stageY + Math.floor((itemHeight - labelHeight) / 2),
                monitor.y,
                monitor.y + monitor.height - labelHeight
            );
        } else {
            x = Math.clamp(
                stageX + Math.floor((itemWidth - labelWidth) / 2),
                monitor.x,
                monitor.x + monitor.width - labelWidth
            );
            y = panelIsTop(this._settings)
                ? Math.min(
                    monitor.y + monitor.height - labelHeight,
                    stageY + itemHeight + 8 + outward
                )
                : Math.max(monitor.y, stageY - labelHeight - 8 - outward);
        }
        label.set_position(x, y);
    }
}
