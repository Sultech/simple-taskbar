// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Mtk from 'gi://Mtk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class TaskbarIconGeometryController {
    constructor({
        settings,
        taskbarActor,
        appButtons,
        windowsForItem,
    }) {
        this._settings = settings;
        this._taskbarActor = taskbarActor;
        this._appButtons = appButtons;
        this._windowsForItem = windowsForItem;
        this._iconGeometryUpdateId = 0;
    }

    queueIconGeometryUpdate() {
        if (this._iconGeometryUpdateId)
            return;

        this._iconGeometryUpdateId = GLib.idle_add(
            GLib.PRIORITY_LOW,
            () => {
                this._iconGeometryUpdateId = 0;
                this.updateWindowIconGeometries();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    updateWindowIconGeometries() {
        for (const item of this._appButtons.values())
            this._updateItemIconGeometry(item);
    }

    updateAppIconGeometry(app) {
        if (!app)
            return;

        for (const item of this._appButtons.values()) {
            if (item._taskbarApp === app)
                this._updateItemIconGeometry(item);
        }
    }

    destroy() {
        if (this._iconGeometryUpdateId)
            GLib.Source.remove(this._iconGeometryUpdateId);
        this._iconGeometryUpdateId = 0;
        this._windowsForItem = null;
        this._appButtons = null;
        this._taskbarActor = null;
        this._settings = null;
    }

    _updateItemIconGeometry(item) {
        const icon = item._taskbarIcon;
        if (!icon.get_stage() || !icon.has_allocation())
            return;

        const [x, y] = icon.get_transformed_position();
        const [width, height] = icon.get_transformed_size();
        if (width <= 0 || height <= 0)
            return;

        const geometry = new Mtk.Rectangle();
        geometry.x = Math.round(x);
        geometry.y = Math.round(y);
        geometry.width = Math.max(1, Math.round(width));
        geometry.height = Math.max(1, Math.round(height));
        const monitor = Main.layoutManager.findMonitorForActor(
            this._taskbarActor
        );
        const monitorScoped =
            this._settings.get_boolean('multi-monitor-panels') &&
            Main.layoutManager.monitors.length > 1;
        for (const window of this._windowsForItem(item)) {
            if (monitorScoped && monitor &&
                window.get_monitor() !== monitor.index)
                continue;
            window.set_icon_geometry(geometry);
        }
    }
}
