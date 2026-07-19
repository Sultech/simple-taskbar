// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

export class TaskbarAppMenu extends AppMenu {
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
