// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

export function createAppLabel(text, width) {
    const label = new St.Label({
        text,
        width,
        y_align: Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return label;
}

export class StartMenuListViewBuilder {
    constructor(params) {
        this._navigationController = params.navigationController;
        this._tooltipController = params.tooltipController;
        this._contextMenuController = params.contextMenuController;
        this._pinnedDragController = params.pinnedDragController;
        this._runningIndicatorController =
            params.runningIndicatorController;
        this._launchApp = params.launchApp;
        this._activateSearchResult = params.activateSearchResult;
        this._syncButtonClasses = params.syncButtonClasses;
        this._closeMenu = params.closeMenu;
    }

    createRecommendedGrid(apps) {
        const grid = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-recommended-grid',
            orientation: Clutter.Orientation.VERTICAL,
        });
        for (let index = 0; index < apps.length; index += 2) {
            const row = new St.BoxLayout({
                style_class: 'simple-taskbar-windows-start-recommended-row',
                x_expand: true,
            });
            const rowApps = apps.slice(index, index + 2);
            for (const app of rowApps)
                row.add_child(this.createAppListButton(app, true));
            if (rowApps.length === 1)
                row.add_child(new St.Widget({x_expand: true}));
            grid.add_child(row);
        }
        return grid;
    }

    createAppListButton(app, compact = false, categorized = false) {
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-list-content',
            x_expand: true,
        });
        const icon = app.create_icon_texture(compact ? 24 : 32);
        content.add_child(
            this._runningIndicatorController.createIconStack(app, icon)
        );
        const label = createAppLabel(
            app.get_name(),
            compact ? 190 : categorized ? 330 : 480
        );
        content.add_child(label);
        const button = new St.Button({
            style_class: compact
                ? 'simple-taskbar-windows-start-recommended'
                : 'simple-taskbar-windows-start-app-list-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            accessible_name: app.get_name(),
            child: content,
        });
        this._navigationController.enable(button);
        this._tooltipController.add(button, app, label, !compact);
        button._startMenuAppId = app.get_id();
        button._startMenuAppIcon = icon;
        button.connect('clicked', () => this._launchApp(app, icon));
        this._contextMenuController.addHandler(button, app);
        if (!compact) {
            this._pinnedDragController.makeTaskbarDraggable(
                button,
                icon,
                app,
                () => this._closeMenu()
            );
        }
        this._syncButtonClasses(button);
        return button;
    }

    createSearchResultButton(result) {
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-list-content',
            x_expand: true,
        });
        const icon = this._createSearchResultIcon(result);
        content.add_child(result.app
            ? this._runningIndicatorController.createIconStack(
                result.app,
                icon
            )
            : icon);
        content.add_child(createAppLabel(result.name, 480));
        const button = new St.Button({
            style_class: 'simple-taskbar-windows-start-app-list-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            accessible_name: result.name,
            child: content,
        });
        this._navigationController.enable(button);
        if (result.app) {
            button._startMenuAppId = result.app.get_id();
            button._startMenuAppIcon = icon;
        }
        button.connect('clicked', () =>
            this._activateSearchResult(result, icon));
        if (result.app)
            this._contextMenuController.addHandler(button, result.app);
        this._syncButtonClasses(button);
        return button;
    }

    destroy() {
        this._syncButtonClasses = null;
        this._activateSearchResult = null;
        this._launchApp = null;
        this._closeMenu = null;
        this._runningIndicatorController = null;
        this._pinnedDragController = null;
        this._contextMenuController = null;
        this._tooltipController = null;
        this._navigationController = null;
    }

    _createSearchResultIcon(result) {
        if (result.provider.id === 'org.gnome.Characters.desktop') {
            return new St.Label({
                style_class: 'simple-taskbar-windows-start-character-icon',
                text: result.id,
                width: 30,
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
            });
        }

        let icon = result.meta.createIcon(30);
        icon ??= new St.Icon({
            icon_name: 'system-search-symbolic',
            icon_size: 30,
        });
        icon.style_class = 'popup-menu-icon';
        return icon;
    }
}
