// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {openSettingsPanel} from '../shared/settingsPanel.js';
import {taskManagerCandidates} from '../shared/taskManagerUtils.js';

const CONTEXT_MENU_SETTING_KEYS = Object.freeze([
    'windows-start-menu-enabled',
    'start-menu-context-menu-enabled',
    'start-menu-context-installed-apps',
    'start-menu-context-event-viewer',
    'start-menu-context-system',
    'start-menu-context-network',
    'start-menu-context-disk-management',
    'start-menu-context-terminal',
    'start-menu-context-task-manager',
    'start-menu-context-file-manager',
    'start-menu-context-run',
    'start-menu-context-show-desktop',
    'task-manager-app',
]);

const TERMINAL_APP_IDS = Object.freeze([
    'org.gnome.Console.desktop',
    'org.gnome.Terminal.desktop',
]);

export class StartButtonContextMenuController {
    constructor({
        settings,
        menu,
        closeMenus,
        openFileManager,
        toggleDesktop,
    }) {
        this._settings = settings;
        this._closeMenus = closeMenus;
        this._openFileManager = openFileManager;
        this._toggleDesktop = toggleDesktop;
        this._appSystem = Shell.AppSystem.get_default();
        this._section = new PopupMenu.PopupMenuSection();
        this._separator = new PopupMenu.PopupSeparatorMenuItem();
        menu.addMenuItem(this._section);
        menu.addMenuItem(this._separator);
        for (const key of CONTEXT_MENU_SETTING_KEYS) {
            settings.connectObject(
                `changed::${key}`,
                () => this.sync(),
                this
            );
        }
        this.sync();
    }

    sync() {
        this._section.removeAll();
        if (!this._settings.get_boolean('windows-start-menu-enabled') ||
            !this._settings.get_boolean('start-menu-context-menu-enabled')) {
            this._separator.visible = false;
            return;
        }

        const settingsApp = this._appSystem.lookup_app(
            'org.gnome.Settings.desktop'
        );
        if (settingsApp) {
            if (this._settings.get_boolean('start-menu-context-installed-apps')) {
                this._section.addAction(
                    _('Installed Apps'),
                    () => this._openSettings('applications')
                );
            }
        }

        this._addAppAction(
            'start-menu-context-event-viewer',
            _('Event Viewer'),
            ['org.gnome.Logs.desktop']
        );

        if (settingsApp) {
            if (this._settings.get_boolean('start-menu-context-system')) {
                this._section.addAction(
                    _('System'),
                    () => this._openSettings('system', ['about'])
                );
            }
            if (this._settings.get_boolean('start-menu-context-network')) {
                this._section.addAction(
                    _('Network Connections'),
                    () => this._openSettings('network')
                );
            }
        }

        this._addAppAction(
            'start-menu-context-disk-management',
            _('Disk Management'),
            ['org.gnome.DiskUtility.desktop']
        );
        this._addAppAction(
            'start-menu-context-terminal',
            _('Terminal'),
            TERMINAL_APP_IDS
        );

        if (this._settings.get_boolean('start-menu-context-task-manager')) {
            const taskManager = this._findApp(
                taskManagerCandidates(this._settings.get_string('task-manager-app'))
            );
            if (taskManager) {
                this._section.addAction(
                    _('Task Manager'),
                    () => this._activateApp(taskManager)
                );
            }
        }

        if (this._settings.get_boolean('start-menu-context-file-manager') &&
            Gio.app_info_get_default_for_type('inode/directory', false)) {
            this._section.addAction(
                _('File Explorer'),
                () => this._openFileManager()
            );
        }

        if (this._settings.get_boolean('start-menu-context-run')) {
            this._section.addAction(
                _('Run'),
                () => this._activate(() => Main.openRunDialog())
            );
        }
        if (this._settings.get_boolean('start-menu-context-show-desktop')) {
            this._section.addAction(
                _('Desktop'),
                () => this._activate(() => this._toggleDesktop())
            );
        }

        this._separator.visible = !this._section.isEmpty();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._section.removeAll();
        this._section = null;
        this._separator = null;
        this._appSystem = null;
        this._toggleDesktop = null;
        this._openFileManager = null;
        this._closeMenus = null;
        this._settings = null;
    }

    _addAppAction(key, label, appIds) {
        if (!this._settings.get_boolean(key))
            return;

        const app = this._findApp(appIds);
        if (!app)
            return;

        this._section.addAction(label, () => this._activateApp(app));
    }

    _findApp(appIds) {
        for (const appId of appIds) {
            if (!appId)
                continue;

            const app = this._appSystem.lookup_app(appId);
            if (app)
                return app;
        }
        return null;
    }

    _activateApp(app) {
        this._activate(() => app.activate());
    }

    _activate(callback) {
        this._closeMenus();
        callback();
    }

    _openSettings(panel, args = []) {
        this._activate(() => openSettingsPanel(panel, args));
    }
}
