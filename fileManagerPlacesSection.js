// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const NAUTILUS_APP_IDS = new Set([
    'org.gnome.Nautilus.desktop',
    'org.gnome.Nautilus',
    'nautilus.desktop',
]);

export function supportsFileManagerPlaces(app) {
    return app
        ? NAUTILUS_APP_IDS.has(app.get_id())
        : false;
}

const PLACE_DEFINITIONS = [
    {
        label: () => _('Home'),
        icon: 'user-home-symbolic',
        path: () => GLib.get_home_dir(),
    },
    {
        label: () => _('Desktop'),
        icon: 'user-desktop-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_DESKTOP,
    },
    {
        label: () => _('Documents'),
        icon: 'folder-documents-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_DOCUMENTS,
    },
    {
        label: () => _('Downloads'),
        icon: 'folder-download-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_DOWNLOAD,
    },
    {
        label: () => _('Music'),
        icon: 'folder-music-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_MUSIC,
    },
    {
        label: () => _('Pictures'),
        icon: 'folder-pictures-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_PICTURES,
    },
    {
        label: () => _('Videos'),
        icon: 'folder-videos-symbolic',
        directory: GLib.UserDirectory.DIRECTORY_VIDEOS,
    },
];

export class FileManagerPlacesSection {
    constructor(enabled) {
        this.section = new PopupMenu.PopupMenuSection();
        this.section.actor.hide();
        this._app = null;
        this._enabled = enabled;
        this._populate();
    }

    setApp(app) {
        this._app = app;
        this._syncVisibility();
    }

    setEnabled(enabled) {
        this._enabled = enabled;
        this._syncVisibility();
    }

    destroy() {
        this._app = null;
        this.section = null;
    }

    _syncVisibility() {
        this.section.actor.visible =
            this._enabled && supportsFileManagerPlaces(this._app);
    }

    _populate() {
        const seen = new Set();
        for (const definition of PLACE_DEFINITIONS) {
            const path = definition.path
                ? definition.path()
                : GLib.get_user_special_dir(definition.directory);
            if (!path || seen.has(path))
                continue;

            seen.add(path);
            const file = Gio.File.new_for_path(path);
            const item = new PopupMenu.PopupImageMenuItem(
                definition.label(),
                definition.icon
            );
            item.connect('activate', () => this._open(file));
            this.section.addMenuItem(item);
        }

        this.section.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );
    }

    _open(file) {
        if (!this._app)
            return;

        const appInfo = this._app.get_app_info();
        if (!appInfo)
            return;

        try {
            appInfo.launch(
                [file],
                global.create_app_launch_context(0, -1)
            );
        } catch (error) {
            Main.notifyError(
                _('Unable to open folder'),
                error.message
            );
        }
    }
}
