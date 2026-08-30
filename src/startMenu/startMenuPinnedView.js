// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {createAppLabel} from './startMenuListView.js';

const TILE_SURFACE_WIDTH = 76;
const TILE_SURFACE_HEIGHT = 78;

export class StartMenuPinnedViewBuilder {
    constructor(settings, params) {
        this._settings = settings;
        this._columns = params.columns;
        this._tileWidth = params.tileWidth;
        this._navigationController = params.navigationController;
        this._tooltipController = params.tooltipController;
        this._contextMenuController = params.contextMenuController;
        this._pinnedDragController = params.pinnedDragController;
        this._createRunningIndicator = params.createRunningIndicator;
        this._launchApp = params.launchApp;
        this._showFolder = params.showFolder;
        this._syncButtonClasses = params.syncButtonClasses;
    }

    createPinnedGrid(items) {
        return this._createTileGrid(
            items,
            null,
            (item, grid) => item.type === 'app'
                ? this._createAppTile(item.app, grid)
                : this._createFolderTile(item, grid)
        );
    }

    createFolderGrid(folder) {
        return this._createTileGrid(
            folder.apps,
            folder.id,
            (app, grid) => this._createAppTile(app, grid, folder.id)
        );
    }

    destroy() {
        this._syncButtonClasses = null;
        this._showFolder = null;
        this._launchApp = null;
        this._createRunningIndicator = null;
        this._pinnedDragController = null;
        this._contextMenuController = null;
        this._tooltipController = null;
        this._navigationController = null;
        this._settings = null;
    }

    _createTileGrid(items, folderId, createTile) {
        const grid = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-grid',
            orientation: Clutter.Orientation.VERTICAL,
        });
        this._pinnedDragController.attachGrid(grid, folderId);
        for (let index = 0; index < items.length; index += this._columns) {
            const row = new St.BoxLayout({
                style_class: 'simple-taskbar-windows-start-app-row',
                x_align: Clutter.ActorAlign.CENTER,
            });
            const rowItems = items.slice(index, index + this._columns);
            for (const item of rowItems)
                row.add_child(createTile(item, grid));
            for (let empty = rowItems.length; empty < this._columns; empty++)
                row.add_child(new St.Widget({width: this._tileWidth}));
            grid.add_child(row);
        }
        return grid;
    }

    _createAppTile(app, pinnedGrid = null, folderId = null) {
        const hideTitle = this._settings.get_boolean(
            'start-menu-hide-pinned-app-titles'
        );
        const content = new St.BoxLayout({
            style_class: hideTitle
                ? 'simple-taskbar-windows-start-app-tile-content'
                : 'simple-taskbar-windows-start-app-tile-content simple-taskbar-windows-start-app-tile-content-titled',
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
        });
        if (hideTitle)
            content.y_align = Clutter.ActorAlign.CENTER;
        const icon = app.create_icon_texture(hideTitle ? 48 : 32);
        const iconContent = hideTitle
            ? icon
            : new St.Bin({
                child: icon,
                height: 39,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.END,
            });
        content.add_child(hideTitle
            ? this._createRunningIndicator(app, iconContent)
            : iconContent);
        const label = createAppLabel(app.get_name(), 78);
        label.add_style_class_name('simple-taskbar-windows-start-app-tile-label');
        label.visible = !hideTitle;
        label.x_align = Clutter.ActorAlign.CENTER;
        label.clutter_text.set({
            ellipsize: Pango.EllipsizeMode.END,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
        });
        content.add_child(label);
        const surface = new St.Bin({
            style_class: 'simple-taskbar-windows-start-app-surface',
            child: content,
            width: TILE_SURFACE_WIDTH,
            height: TILE_SURFACE_HEIGHT,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const button = new St.Button({
            style_class: 'simple-taskbar-windows-start-app-tile',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: this._tileWidth,
            accessible_name: app.get_name(),
            child: surface,
        });
        this._navigationController.enable(button);
        this._tooltipController.add(button, app, label, false, hideTitle);
        button._startMenuAppId = app.get_id();
        button._startMenuAppIcon = icon;
        button.connect('clicked', () => this._launchApp(app, icon));
        this._contextMenuController.addHandler(button, app, folderId);
        if (pinnedGrid) {
            this._pinnedDragController.makeDraggable(
                button,
                icon,
                app,
                pinnedGrid
            );
        }
        this._syncButtonClasses(button);
        return button;
    }

    _createFolderTile(folder, pinnedGrid) {
        const preview = this._createFolderPreview(folder.apps);
        const content = new St.Bin({
            style_class: 'simple-taskbar-windows-start-folder-surface',
            child: preview,
            width: TILE_SURFACE_WIDTH,
            height: TILE_SURFACE_HEIGHT,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const button = new St.Button({
            style_class: 'simple-taskbar-windows-start-app-tile simple-taskbar-windows-start-folder-tile',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: this._tileWidth,
            accessible_name: folder.name,
            child: content,
        });
        button._startMenuFolderId = folder.id;
        this._navigationController.enable(button);
        this._tooltipController.addText(button, folder.name);
        button.connect('clicked', () => this._showFolder(folder.id));
        this._contextMenuController.addFolderHandler(button, folder.id);
        this._pinnedDragController.makeFolderDraggable(
            button,
            preview,
            folder.id,
            pinnedGrid
        );
        this._syncButtonClasses(button);
        return button;
    }

    _createFolderPreview(apps) {
        const iconSize = 24;
        const grid = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-folder-preview-grid',
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const previewApps = apps.slice(0, 4);
        for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
            const row = new St.BoxLayout({
                style_class: 'simple-taskbar-windows-start-folder-preview-row',
                x_align: Clutter.ActorAlign.CENTER,
            });
            for (let columnIndex = 0; columnIndex < 2; columnIndex++) {
                const app = previewApps[rowIndex * 2 + columnIndex];
                row.add_child(new St.Bin({
                    child: app ? app.create_icon_texture(iconSize) : null,
                    width: iconSize,
                    height: iconSize,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                }));
            }
            grid.add_child(row);
        }
        return grid;
    }
}
