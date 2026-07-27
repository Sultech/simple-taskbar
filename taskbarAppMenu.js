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

        this._placesSection = supportsFileManagerPlaces(
            params.fileManagerPlacesApp
        )
            ? new FileManagerPlacesSection(params.fileManagerPlacesEnabled)
            : null;
        if (this._placesSection)
            this.addMenuItem(this._placesSection.section, 0);
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

    destroy() {
        super.destroy();
        if (this._placesSection)
            this._placesSection.destroy();
        this._placesSection = null;
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
