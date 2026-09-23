// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Mtk from 'gi://Mtk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export function iconScreenGeometry(icon) {
    if (!icon.get_stage() || !icon.has_allocation())
        return null;

    const [x, y] = icon.get_transformed_position();
    const [width, height] = icon.get_transformed_size();
    if (width <= 0 || height <= 0)
        return null;

    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
    };
}

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
        this._windowIconActors = new Map();
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
        this._clearWindowIconActors();
        for (const item of this._appButtons.values())
            this._updateItemIconGeometry(item);
    }

    updateAppIconGeometry(app) {
        if (!app)
            return;

        this._clearWindowIconActors(app);
        for (const item of this._appButtons.values()) {
            if (item._taskbarApp === app)
                this._updateItemIconGeometry(item);
        }
    }

    destroy() {
        if (this._iconGeometryUpdateId)
            GLib.Source.remove(this._iconGeometryUpdateId);
        this._iconGeometryUpdateId = 0;
        this._clearWindowIconActors();
        this._windowIconActors = null;
        this._windowsForItem = null;
        this._appButtons = null;
        this._taskbarActor = null;
        this._settings = null;
    }

    _clearWindowIconActors(app = null) {
        for (const [window, assignment] of this._windowIconActors) {
            if (app && assignment.app !== app)
                continue;

            if (window._simpleTaskbarIconActor === assignment.icon)
                window._simpleTaskbarIconActor = null;
            this._windowIconActors.delete(window);
        }
    }

    _updateItemIconGeometry(item) {
        const icon = item._taskbarIcon;
        const screenGeometry = iconScreenGeometry(icon);
        if (!screenGeometry)
            return;

        const geometry = new Mtk.Rectangle();
        geometry.x = screenGeometry.x;
        geometry.y = screenGeometry.y;
        geometry.width = Math.max(1, screenGeometry.width);
        geometry.height = Math.max(1, screenGeometry.height);
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
            window._simpleTaskbarIconActor = icon;
            this._windowIconActors.set(window, {
                app: item._taskbarApp,
                icon,
            });
        }
    }
}
