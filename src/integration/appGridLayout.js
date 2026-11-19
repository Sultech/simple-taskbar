// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {V_SHELL_UUID, extensionIsActive} from './extensionState.js';

export class AppGridLayout {
    constructor(settings) {
        this._settings = settings;
        this._gridModesApplied = false;
        this._fixedSizeApplied = false;
    }

    enable() {
        this._settings.connectObject(
            'changed::app-grid-layout', () => this._sync(),
            'changed::app-grid-columns', () => this._sync(),
            'changed::app-grid-rows', () => this._sync(),
            this
        );
        Main.extensionManager.connectObject(
            'extension-state-changed', (_manager, extension) => {
                if (extension.uuid === V_SHELL_UUID)
                    this._sync();
            },
            this
        );
        this._sync();
    }

    destroy() {
        this._settings.disconnectObject(this);
        Main.extensionManager.disconnectObject(this);
        this._restore();
        this._settings = null;
    }

    _sync() {
        if (this._settings.get_string('app-grid-layout') !== 'custom' ||
            extensionIsActive(V_SHELL_UUID)) {
            this._restore();
            return;
        }

        this._apply({
            columns: this._settings.get_int('app-grid-columns'),
            rows: this._settings.get_int('app-grid-rows'),
        });
    }

    _apply(mode) {
        const grid = Main.overview._overview.controls._appDisplay._grid;
        // Ubuntu patches iconGrid.js to replace GNOME's fixed grid modes with
        // an adaptive solver, so setGridModes() is present only on a stock
        // Shell and _fixedCols only on a patched one.
        if (grid.setGridModes) {
            this._gridModesApplied = true;
            this._writeGridModes(grid, [mode]);
        } else {
            this._fixedSizeApplied = true;
            this._writeFixedSize(grid, mode.columns, mode.rows);
        }
        grid.queue_relayout();
    }

    _restore() {
        if (!this._gridModesApplied && !this._fixedSizeApplied)
            return;

        const grid = Main.overview._overview.controls._appDisplay._grid;
        if (this._gridModesApplied)
            this._writeGridModes(grid, null);
        if (this._fixedSizeApplied)
            this._writeFixedSize(grid, 0, 0);
        this._gridModesApplied = false;
        this._fixedSizeApplied = false;
        grid.queue_relayout();
    }

    _writeGridModes(grid, modes) {
        grid.setGridModes(modes);
        // _setGridMode() returns early on an unchanged index, and a single
        // mode always resolves to index 0.
        grid._currentMode = -1;
    }

    _writeFixedSize(grid, columns, rows) {
        const layout = grid.layout_manager;
        layout._fixedCols = columns;
        layout._fixedRows = rows;
        // adaptToSize() returns early while the page size is unchanged.
        layout._pageWidth = 0;
        layout._pageHeight = 0;
    }
}
