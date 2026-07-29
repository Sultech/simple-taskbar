// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    FileManagerPlacesSection,
    supportsFileManagerPlaces,
} from './fileManagerPlacesSection.js';

export class TaskbarAppMenu extends AppMenu {
    constructor(sourceActor, side, params = {}) {
        super(sourceActor, side, params);

        this._targetWindow = params.targetWindow ?? null;
        this._closeWindowItem = this.addAction(
            _('Close window'),
            event => {
                const window = this._targetWindow;
                if (!window || window.get_compositor_private() === null)
                    return;
                window.delete(event.get_time());
            }
        );
        const quitIndex = this._getMenuItems().indexOf(this._quitItem);
        this.moveMenuItem(this._closeWindowItem, quitIndex);

        this._placesSection = supportsFileManagerPlaces(
            params.fileManagerPlacesApp
        )
            ? new FileManagerPlacesSection(params.fileManagerPlacesEnabled)
            : null;
        if (this._placesSection)
            this.addMenuItem(this._placesSection.section, 0);
        this._syncWindowCloseItems();
    }

    setApp(app) {
        super.setApp(app);
        if (this._placesSection)
            this._placesSection.setApp(app);
    }

    setFileManagerPlacesEnabled(enabled) {
        if (this._placesSection)
            this._placesSection.setEnabled(enabled);
    }

    _updateWindowsSection() {
        super._updateWindowsSection();
        this._syncWindowCloseItems();
    }

    _updateQuitItem() {
        super._updateQuitItem();
        this._syncWindowCloseItems();
    }

    _syncWindowCloseItems() {
        if (!this._closeWindowItem)
            return;

        const targetWindow = this._targetWindow;
        const targetAvailable = Boolean(
            targetWindow &&
            targetWindow.get_compositor_private() !== null
        );
        this._closeWindowItem.visible = targetAvailable;
        if (targetAvailable)
            this._closeWindowItem.setSensitive(targetWindow.can_close());

        if (!targetWindow)
            return;

        const windows = this._app?.get_windows()
            .filter(window => !window.skip_taskbar) ?? [];
        this._quitItem.visible = windows.length > 1;
        this._quitItem.label.text = _('Close all windows');
    }

    destroy() {
        this._targetWindow = null;
        this._closeWindowItem = null;
        if (this._placesSection) {
            this._placesSection.destroy();
            this._placesSection = null;
        }
        super.destroy();
    }

    _updateFavoriteItem() {
        super._updateFavoriteItem();
        if (!this._toggleFavoriteItem.visible || !this._app)
            return;

        const isPinned = this._appFavorites.isFavorite(this._app.get_id());
        this._toggleFavoriteItem.label.text = isPinned
            ? _('Unpin from Taskbar')
            : _('Pin to Taskbar');
    }
}
