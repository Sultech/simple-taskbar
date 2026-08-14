// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {shellMenusUseLightTheme} from './themeUtils.js';
import {
    panelArrowSide,
    syncPanelMenuPosition,
} from './panelPosition.js';

const FILE_ATTRIBUTES = [
    Gio.FILE_ATTRIBUTE_STANDARD_NAME,
    Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME,
    Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
    Gio.FILE_ATTRIBUTE_STANDARD_ICON,
    Gio.FILE_ATTRIBUTE_STANDARD_IS_HIDDEN,
].join(',');
const ENUMERATION_BATCH_SIZE = 50;

export class FolderMenuController {
    constructor(settings) {
        this._settings = settings;
        this._signalHolder = new TransientSignalHolder();
        this._menuManager = null;
        this._menu = null;
        this._enumerationCancellable = null;
        this._enumerationGeneration = 0;
        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._stSettings = St.Settings.get();

        this._button = new PanelMenu.Button(0.5, _('Folder menu'), true);
        this._button.add_style_class_name('simple-taskbar-folder-menu-button');
        this._button.add_child(new St.Icon({
            icon_name: 'folder-documents-symbolic',
            style_class: 'system-status-icon',
        }));
        this.actor = this._button.container;
    }

    enable(menuManager = Main.panel.menuManager) {
        this._menuManager = menuManager;
        this._menu = new PopupMenu.PopupMenu(
            this._button,
            0.5,
            panelArrowSide(this._settings)
        );
        this._menu.actor.add_style_class_name('simple-taskbar-folder-menu');
        // PopupMenu refuses to open while empty. Keep an initial placeholder;
        // the open-state handler replaces it with the selected folder entries.
        this._showMessage(_('Open to view folder contents'));
        this._button.setMenu(this._menu);
        this._menuManager.addMenu(this._menu);

        this._menu.connectObject('open-state-changed', (_menu, open) => {
            if (open)
                this._reloadMenu();
            else
                this._cancelEnumeration();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::folder-menu-enabled', () => this._syncVisibility(),
            'changed::folder-menu-uri', () => {
                if (this._menu.isOpen)
                    this._reloadMenu();
            },
            'changed::panel-position', () => {
                this._menu.close(BoxPointer.PopupAnimation.NONE);
                this._syncPanelPosition();
            },
            this._signalHolder
        );
        this._themeContext.connectObject(
            'changed', () => this._syncTheme(),
            this._signalHolder
        );
        this._stSettings.connectObject(
            'notify::color-scheme', () => this._syncTheme(),
            'notify::shell-color-scheme', () => this._syncTheme(),
            this._signalHolder
        );
        this._syncTheme();
        this._syncPanelPosition();
        this._syncVisibility();
    }

    get menuIsOpen() {
        return this._menu.isOpen;
    }

    destroy() {
        this._cancelEnumeration();
        this._signalHolder.destroy();
        this._signalHolder = null;

        this._menuManager.removeMenu(this._menu);
        this._button.setMenu(null);
        this._menu = null;
        this._menuManager = null;
        this._button.destroy();
        this._button = null;
        this.actor = null;
        this._themeContext = null;
        this._stSettings = null;
        this._settings = null;
    }

    _syncVisibility() {
        const visible = this._settings.get_boolean('folder-menu-enabled');
        this.actor.visible = visible;
        if (!visible)
            this._menu.close(BoxPointer.PopupAnimation.NONE);
    }

    _syncPanelPosition() {
        syncPanelMenuPosition(this._menu, this._settings);
    }

    _syncTheme() {
        // The popup is rendered by GNOME Shell outside the taskbar actor, so
        // its icons must contrast with the Shell menu rather than a manually
        // selected taskbar colour.
        const light = shellMenusUseLightTheme();
        this._menu.actor.remove_style_class_name(
            light
                ? 'simple-taskbar-folder-menu-dark'
                : 'simple-taskbar-folder-menu-light'
        );
        this._menu.actor.add_style_class_name(
            light
                ? 'simple-taskbar-folder-menu-light'
                : 'simple-taskbar-folder-menu-dark'
        );
    }

    _reloadMenu() {
        this._cancelEnumeration();
        this._menu.removeAll();

        const location = this._settings.get_string('folder-menu-uri');
        if (!location) {
            this._button.accessible_name = _('Folder menu');
            this._showMessage(_('Choose a folder in Taskbar Settings'));
            return;
        }

        const folder = location.includes('://')
            ? Gio.File.new_for_uri(location)
            : Gio.File.new_for_path(location);
        this._button.accessible_name = _('%s folder').replace(
            '%s',
            folder.get_basename() ?? _('Selected')
        );
        this._showMessage(_('Loading…'));

        const cancellable = new Gio.Cancellable();
        const generation = ++this._enumerationGeneration;
        this._enumerationCancellable = cancellable;
        folder.enumerate_children_async(
            FILE_ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (source, result) => {
                let enumerator;
                try {
                    enumerator = source.enumerate_children_finish(result);
                } catch (error) {
                    if (generation === this._enumerationGeneration) {
                        this._enumerationCancellable = null;
                        this._showMessage(error.message);
                    }
                    return;
                }
                if (generation !== this._enumerationGeneration) {
                    this._closeEnumerator(enumerator);
                    return;
                }
                this._readNextBatch(
                    folder,
                    enumerator,
                    cancellable,
                    generation,
                    []
                );
            }
        );
    }

    _readNextBatch(folder, enumerator, cancellable, generation, entries) {
        enumerator.next_files_async(
            ENUMERATION_BATCH_SIZE,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (source, result) => {
                let infos;
                try {
                    infos = source.next_files_finish(result);
                } catch (error) {
                    this._closeEnumerator(enumerator);
                    if (generation === this._enumerationGeneration) {
                        this._enumerationCancellable = null;
                        this._showMessage(error.message);
                    }
                    return;
                }

                if (generation !== this._enumerationGeneration) {
                    this._closeEnumerator(enumerator);
                    return;
                }

                for (const info of infos) {
                    if (info.get_is_hidden())
                        continue;
                    entries.push({
                        file: folder.get_child(info.get_name()),
                        name: info.get_display_name() ?? info.get_name(),
                        directory:
                            info.get_file_type() === Gio.FileType.DIRECTORY,
                        icon: info.get_icon(),
                    });
                }

                if (infos.length > 0) {
                    this._readNextBatch(
                        folder,
                        enumerator,
                        cancellable,
                        generation,
                        entries
                    );
                    return;
                }

                this._closeEnumerator(enumerator);
                this._enumerationCancellable = null;
                this._populateMenu(entries);
            }
        );
    }

    _populateMenu(entries) {
        this._menu.removeAll();
        entries.sort((a, b) => {
            if (a.directory !== b.directory)
                return a.directory ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        if (entries.length === 0) {
            this._showMessage(_('This folder is empty'));
            return;
        }

        for (const entry of entries) {
            const item = new PopupMenu.PopupImageMenuItem(
                entry.name,
                entry.icon ?? (entry.directory
                    ? 'folder-symbolic'
                    : 'text-x-generic-symbolic')
            );
            item.connect('activate', () => this._openFile(entry.file));
            this._menu.addMenuItem(item);
        }
    }

    _showMessage(message) {
        this._menu.removeAll();
        this._menu.addMenuItem(new PopupMenu.PopupMenuItem(message, {
            reactive: false,
            can_focus: false,
        }));
    }

    _openFile(file) {
        try {
            Gio.AppInfo.launch_default_for_uri(
                file.get_uri(),
                global.create_app_launch_context(0, -1)
            );
        } catch (error) {
            console.error(
                `Simple Taskbar could not open ${file.get_uri()}: ` +
                error.message
            );
        }
    }

    _cancelEnumeration() {
        this._enumerationGeneration++;
        this._enumerationCancellable?.cancel();
        this._enumerationCancellable = null;
    }

    _closeEnumerator(enumerator) {
        try {
            enumerator.close(null);
        } catch (error) {
            console.warn(
                'Simple Taskbar could not close a folder enumerator: ' +
                error.message
            );
        }
    }
}
