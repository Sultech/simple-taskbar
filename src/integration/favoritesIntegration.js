// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Shell from 'gi://Shell';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import {
    InjectionManager,
    gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

export class FavoritesIntegration {
    constructor(settings) {
        this._settings = settings;
        this._injectionManager = new InjectionManager();
    }

    enable() {
        const favorites = AppFavorites.getAppFavorites();
        const prototype = Object.getPrototypeOf(favorites);
        const settings = this._settings;

        this._injectionManager.overrideMethod(
            prototype,
            'addFavoriteAtPos',
            originalMethod => function (appId, position) {
                const dockMode = settings.get_boolean('dock-mode');
                if (settings.get_boolean('default-gnome-panel') && !dockMode) {
                    return originalMethod.call(this, appId, position);
                }

                if (!this._addFavorite(appId, position))
                    return;

                const app = Shell.AppSystem.get_default().lookup_app(appId);
                const message = dockMode
                    ? _('%s has been pinned to the dock.').format(
                        app.get_name()
                    )
                    : _('%s has been pinned to the taskbar.').format(
                        app.get_name()
                    );
                this._showNotification(
                    message,
                    null,
                    () => this._removeFavorite(appId)
                );
            }
        );

        this._injectionManager.overrideMethod(
            prototype,
            'removeFavorite',
            originalMethod => function (appId) {
                const dockMode = settings.get_boolean('dock-mode');
                if (settings.get_boolean('default-gnome-panel') && !dockMode)
                    return originalMethod.call(this, appId);

                const ids = this._getIds();
                const position = ids.indexOf(appId);
                const app = this._favorites[appId];
                if (!this._removeFavorite(appId))
                    return;

                const message = dockMode
                    ? _('%s has been unpinned from the dock.').format(
                        app.get_name()
                    )
                    : _('%s has been unpinned from the taskbar.').format(
                        app.get_name()
                    );
                this._showNotification(
                    message,
                    null,
                    () => this._addFavorite(appId, position)
                );
            }
        );
    }

    destroy() {
        this._injectionManager.clear();
        this._injectionManager = null;
        this._settings = null;
    }
}
