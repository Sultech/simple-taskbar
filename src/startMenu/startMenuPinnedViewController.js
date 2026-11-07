// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {appShouldShow, getRecommendedApps} from './startMenuAppModel.js';

export class StartMenuPinnedViewController {
    constructor({settings, appSystem, favorites, pinnedModel,
        pinnedViewBuilder, listViewBuilder, onChanged}) {
        this._settings = settings;
        this._appSystem = appSystem;
        this._favorites = favorites;
        this._pinnedModel = pinnedModel;
        this._pinnedViewBuilder = pinnedViewBuilder;
        this._listViewBuilder = listViewBuilder;
        this._onChanged = onChanged;
        this._pinnedView = null;
        this._pinnedSignature = null;
        this._pinnedApps = [];
    }

    get view() {
        return this._pinnedView;
    }

    get apps() {
        return this._pinnedApps;
    }

    destroy() {
        this._pinnedView?.destroy();
        this._pinnedView = null;
        this._pinnedSignature = null;
        this._pinnedApps = null;
        this._settings = null;
        this._appSystem = null;
        this._favorites = null;
        this._pinnedModel = null;
        this._pinnedViewBuilder = null;
        this._listViewBuilder = null;
        this._onChanged = null;
    }

    ensure() {
        const pinnedItems = this._resolvePinnedItems();
        const pinnedApps = pinnedItems.flatMap(item =>
            item.type === 'app' ? [item.app] : item.apps
        );
        const recommended = getRecommendedApps(
            this._settings,
            this._favorites,
            pinnedApps
        );
        const hidePinnedAppTitles = this._settings.get_boolean(
            'start-menu-hide-pinned-app-titles'
        );
        const signature = JSON.stringify({
            pinned: pinnedItems.map(item => item.type === 'app'
                ? ['app', item.app.get_id(), item.app.get_name()]
                : [
                    'folder',
                    item.id,
                    item.name,
                    item.appIds,
                    item.apps.map(app => [app.get_id(), app.get_name()]),
                ]),
            recommended: recommended.map(app => [app.get_id(), app.get_name()]),
            hidePinnedAppTitles,
        });
        if (this._pinnedView && signature === this._pinnedSignature)
            return;

        const view = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-pinned-view',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        if (pinnedItems.length > 0) {
            view.add_child(this._pinnedViewBuilder.createPinnedGrid(pinnedItems));
        } else {
            view.add_child(new St.Label({
                style_class: 'simple-taskbar-windows-start-empty-pinned',
                text: _('Choose All, then right-click an app to pin it'),
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }

        if (recommended.length > 0) {
            view.add_child(new St.Label({
                style_class: 'simple-taskbar-windows-start-section-heading',
                text: _('Recommended'),
            }));
            view.add_child(
                this._listViewBuilder.createRecommendedGrid(recommended)
            );
        }

        this._pinnedView?.destroy();
        this._pinnedView = view;
        this._pinnedApps = pinnedApps;
        this._pinnedSignature = signature;
        this._onChanged();
    }

    _resolvePinnedItems() {
        const items = [];
        for (const item of this._pinnedModel.getItems()) {
            if (item.type === 'app') {
                const app = this._resolvePinnedApp(item.appId);
                if (app)
                    items.push({...item, app});
                continue;
            }

            const folder = this.resolveFolder(item);
            if (folder.apps.length > 0)
                items.push(folder);
        }
        return items;
    }

    resolveFolder(folder) {
        return {
            ...folder,
            apps: folder.appIds
                .map(appId => this._resolvePinnedApp(appId))
                .filter(Boolean),
        };
    }

    _resolvePinnedApp(appId) {
        const app = this._appSystem.lookup_app(appId);
        return app && appShouldShow(app) ? app : null;
    }
}
