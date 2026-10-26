// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {panelGeometry} from './panelGeometry.js';
import {FloatingPanelWindowTracker} from './floatingPanelWindowTracker.js';
import {panelContentLength} from '../taskbar/taskbarLayout.js';
import {TaskbarWidthUpdater} from '../taskbar/taskbarWidthUpdater.js';

const SHELL_VERSION = parseInt(Config.PACKAGE_VERSION);

export class FloatingPanelLayout {
    constructor({settings, getMonitor, boxes, getPanelHeight, getHoverReserve,
        getEdgeGap, getGeometry, onPosition, onContentChanged, strutName}) {
        this._settings = settings;
        this._getMonitor = getMonitor;
        this._boxes = boxes;
        this._getPanelHeight = getPanelHeight;
        this._getHoverReserve = getHoverReserve;
        this._getEdgeGap = getEdgeGap;
        this._getGeometry = getGeometry;
        this._onPosition = onPosition;
        this._strutName = strutName;
        this._widthUpdater = new TaskbarWidthUpdater(onContentChanged);
        this._windowTracker = new FloatingPanelWindowTracker(onPosition);
        this._lastEdgeGap = null;
        this._baseLength = null;
        this._panelLength = null;
        this.strutActor = null;
    }

    enable(createStrut) {
        if (createStrut)
            this._createStrut();
        this._windowTracker.enable();
        this._settings.connectObject(
            'changed::panel-autohide-enabled', () => this._onPosition(),
            'changed::panel-dodge-windows-enabled', () => this._onPosition(),
            this
        );
        for (const box of this._boxes) {
            box.connectObject('queue-relayout', () => {
                if (!this._widthUpdater.isUpdating)
                    this._widthUpdater.queue();
            }, this);
        }
    }

    destroy() {
        this._widthUpdater.destroy();
        this._widthUpdater = null;
        this._windowTracker.destroy();
        this._windowTracker = null;
        this._settings.disconnectObject(this);
        for (const box of this._boxes)
            box.disconnectObject(this);
        if (this.strutActor) {
            Main.layoutManager.removeChrome(this.strutActor);
            this.strutActor.destroy();
            this.strutActor = null;
        }
        this._settings = null;
        this._getMonitor = null;
        this._boxes = null;
        this._getPanelHeight = null;
        this._getHoverReserve = null;
        this._getEdgeGap = null;
        this._getGeometry = null;
        this._onPosition = null;
    }

    get baseLength() {
        return this._baseLength;
    }

    get panelLength() {
        return this._panelLength;
    }

    getPositionState(animateEdgeGapRequested) {
        const edgeGap = this._getEdgeGap();
        const edgeGapChanged = this._lastEdgeGap !== null &&
            this._lastEdgeGap !== edgeGap;
        this._lastEdgeGap = edgeGap;
        return {
            geometry: this._getGeometry(),
            edgeGapChanged,
            animateEdgeGap: animateEdgeGapRequested && edgeGapChanged &&
                !this._settings.get_boolean('panel-autohide-enabled'),
            shouldSyncAutoHide: !animateEdgeGapRequested || edgeGapChanged,
        };
    }

    syncStrut() {
        if (!this.strutActor)
            return;

        const geometry = panelGeometry(this._settings, this._getMonitor(),
            this._getPanelHeight());
        this.strutActor.set_position(geometry.x, geometry.y);
        this.strutActor.set_size(geometry.width, geometry.height);
        Main.layoutManager._queueUpdateRegions();
    }

    updateContent() {
        this._widthUpdater.update();
    }

    queueContentUpdate() {
        this._widthUpdater.queue();
    }

    resetLength() {
        this._panelLength = null;
    }

    updateLength(maximumLength, vertical) {
        const requiredLength = panelContentLength(this._boxes,
            this._getPanelHeight(), vertical);
        this._baseLength = Math.min(maximumLength,
            Math.max(1, Math.ceil(requiredLength)));
        const length = this._baseLength + this._getHoverReserve();
        if (length === this._panelLength)
            return;

        this._panelLength = length;
        this._onPosition(false, false);
        this._widthUpdater.queue();
    }

    _createStrut() {
        this.strutActor = new St.Widget({
            name: this._strutName,
            reactive: false,
            opacity: 0,
        });
        Shell.util_set_hidden_from_pick(this.strutActor, true);
        const chromeParams = {affectsStruts: true, trackFullscreen: true};
        if (SHELL_VERSION < 50)
            chromeParams.affectsInputRegion = false;
        Main.layoutManager.addChrome(this.strutActor, chromeParams);
        this.syncStrut();
    }
}
