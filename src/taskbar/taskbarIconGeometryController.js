// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {panelPosition} from '../shared/panelPositionUtils.js';

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

export function setWindowRestoreTarget(window, icon, position, type = 'app') {
    const geometry = iconScreenGeometry(icon);
    window._simpleTaskbarRestoreTarget = geometry ? {geometry, position, type} : null;
}

export function setWindowIconGeometry(window, geometry) {
    const rectangle = new Mtk.Rectangle();
    rectangle.x = geometry.x;
    rectangle.y = geometry.y;
    rectangle.width = Math.max(1, geometry.width);
    rectangle.height = Math.max(1, geometry.height);
    window.set_icon_geometry(rectangle);
}

export class TaskbarIconGeometryController {
    constructor({
        settings,
        taskbarActor,
        appButtons,
        windowsForItem,
        getIconTarget,
        getMinimizeTarget,
    }) {
        this._settings = settings;
        this._taskbarActor = taskbarActor;
        this._appButtons = appButtons;
        this._windowsForItem = windowsForItem;
        this._getIconTarget = getIconTarget;
        this._getMinimizeTarget = getMinimizeTarget;
        this._iconGeometryUpdateId = 0;
        this._restoreTargetReleaseId = 0;
        this._claimedRestoreWindows = new Set();
        this._windowIconActors = new Map();
        this._windowPreviewActors = new Map();
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
                this._updateItemIconGeometry(item, true);
        }
        this._queueRestoreTargetRelease();
    }

    _queueRestoreTargetRelease() {
        const laters = global.compositor.get_laters();
        if (this._restoreTargetReleaseId)
            laters.remove(this._restoreTargetReleaseId);
        this._restoreTargetReleaseId = laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._restoreTargetReleaseId = 0;
            this._releaseClaimedRestoreTargets();
            return GLib.SOURCE_REMOVE;
        });
    }

    _releaseClaimedRestoreTargets() {
        for (const window of this._claimedRestoreWindows) {
            const target = window._simpleTaskbarRestoreTarget;
            if (target && target.type === 'app')
                window._simpleTaskbarRestoreTarget = null;
        }
        this._claimedRestoreWindows.clear();
    }

    destroy() {
        if (this._iconGeometryUpdateId)
            GLib.Source.remove(this._iconGeometryUpdateId);
        this._iconGeometryUpdateId = 0;
        if (this._restoreTargetReleaseId)
            global.compositor.get_laters().remove(this._restoreTargetReleaseId);
        this._restoreTargetReleaseId = 0;
        this._claimedRestoreWindows.clear();
        this._claimedRestoreWindows = null;
        this._clearWindowIconActors();
        this._windowIconActors = null;
        this._windowPreviewActors = null;
        this._getIconTarget = null;
        this._getMinimizeTarget = null;
        this._windowsForItem = null;
        this._appButtons = null;
        this._taskbarActor = null;
        this._settings = null;
    }

    _clearWindowIconActors(app = null) {
        for (const [actors, actorKey, positionKey] of [
            [this._windowIconActors, '_simpleTaskbarIconActor', '_simpleTaskbarIconPosition'],
            [this._windowPreviewActors, '_simpleTaskbarPreviewActor', '_simpleTaskbarPreviewPosition'],
        ]) {
            for (const [window, assignment] of actors) {
                if (app && assignment.app !== app)
                    continue;

                this._releaseWindowIconActor(window, assignment, actors, actorKey, positionKey);
            }
        }
    }

    _releaseWindowIconActor(window, assignment, actors, actorKey, positionKey) {
        if (assignment.destroyId)
            assignment.icon.disconnect(assignment.destroyId);
        if (window[actorKey] === assignment.icon) {
            window[actorKey] = null;
            window[positionKey] = null;
            if (actors === this._windowIconActors)
                window._simpleTaskbarMinimizePreviewTarget = null;
        }
        actors.delete(window);
    }

    _updateItemIconGeometry(item, claimTarget = false) {
        const icon = this._getIconTarget(item);
        const screenGeometry = iconScreenGeometry(icon);
        if (!screenGeometry)
            return;

        const monitor = Main.layoutManager.findMonitorForActor(
            this._taskbarActor
        );
        const monitorScoped =
            this._settings.get_boolean('multi-monitor-panels') &&
            Main.layoutManager.monitors.length > 1;
        const app = item._taskbarApp;
        const isPreview = app._simpleTaskbarMinimizedWindow;
        const windows = isPreview ? [app.window] : this._windowsForItem(item);
        const actors = isPreview ? this._windowPreviewActors : this._windowIconActors;
        const actorKey = isPreview ? '_simpleTaskbarPreviewActor' : '_simpleTaskbarIconActor';
        const positionKey = isPreview ? '_simpleTaskbarPreviewPosition' : '_simpleTaskbarIconPosition';
        for (const window of windows) {
            if (!claimTarget && window[actorKey] &&
                window[actorKey] !== icon)
                continue;
            if (monitorScoped && monitor &&
                window.get_monitor() !== monitor.index)
                continue;
            setWindowIconGeometry(window, screenGeometry);
            window[actorKey] = icon;
            window[positionKey] = panelPosition(this._settings);
            if (!isPreview) {
                window._simpleTaskbarMinimizePreviewTarget = () => this._getMinimizeTarget(window);
                if (claimTarget && window.minimized) {
                    setWindowRestoreTarget(window, icon, window[positionKey]);
                    this._claimedRestoreWindows.add(window);
                }
            }
            const assignment = {
                app,
                icon,
                destroyId: 0,
            };
            if (isPreview) {
                assignment.destroyId = icon.connect('destroy', () => {
                    assignment.destroyId = 0;
                    this._releaseWindowIconActor(window, assignment, actors, actorKey, positionKey);
                });
            }
            actors.set(window, assignment);
        }
    }
}
