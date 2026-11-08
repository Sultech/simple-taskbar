// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {COMMON_FOLDERS, commonFolderPath} from '../shared/commonFolders.js';

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
        this.section.destroy();
        this.section = null;
        this._app = null;
    }

    _syncVisibility() {
        this.section.actor.visible =
            this._enabled && supportsFileManagerPlaces(this._app);
    }

    _populate() {
        const seen = new Set();
        for (const folder of COMMON_FOLDERS) {
            const path = commonFolderPath(folder);
            if (!path || seen.has(path))
                continue;

            seen.add(path);
            const file = Gio.File.new_for_path(path);
            const item = new PopupMenu.PopupImageMenuItem(
                _(folder.name),
                `${folder.iconName}-symbolic`
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
