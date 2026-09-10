// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

export class AppGridLayout {
    constructor(settings) {
        this._settings = settings;
        this._applied = false;
        this._signalHolder = new TransientSignalHolder();
    }

    enable() {
        this._settings.connectObject(
            'changed::app-grid-layout', () => this._sync(),
            'changed::app-grid-columns', () => this._sync(),
            'changed::app-grid-rows', () => this._sync(),
            this._signalHolder
        );
        this._sync();
    }

    destroy() {
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._restore();
        this._settings = null;
    }

    _sync() {
        if (this._settings.get_string('app-grid-layout') !== 'custom') {
            this._restore();
            return;
        }

        this._applied = true;
        this._writeLayout({
            columns: this._settings.get_int('app-grid-columns'),
            rows: this._settings.get_int('app-grid-rows'),
        });
    }

    _restore() {
        if (!this._applied)
            return;

        this._applied = false;
        this._writeLayout(null);
    }

    _writeLayout(mode) {
        const grid = Main.overview._overview.controls._appDisplay._grid;
        const layout = grid.layout_manager;
        // Ubuntu patches iconGrid.js to replace GNOME's fixed grid modes with
        // an adaptive solver, so setGridModes() is present only on a stock
        // Shell and _fixedCols only on a patched one.
        if (grid.setGridModes) {
            grid.setGridModes(mode ? [mode] : null);
            // _setGridMode() returns early on an unchanged index, and a single
            // mode always resolves to index 0.
            grid._currentMode = -1;
        } else {
            layout._fixedCols = mode ? mode.columns : 0;
            layout._fixedRows = mode ? mode.rows : 0;
            // adaptToSize() returns early while the page size is unchanged.
            layout._pageWidth = 0;
            layout._pageHeight = 0;
        }
        grid.queue_relayout();
    }
}
