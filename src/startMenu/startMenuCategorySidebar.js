// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {APP_CATEGORIES} from './startMenuAppModel.js';

export class StartMenuCategorySidebar {
    constructor({
        body,
        scrollView,
        navigationController,
        syncButtonClasses,
        displayAppList,
    }) {
        this._body = body;
        this._scrollView = scrollView;
        this._navigationController = navigationController;
        this._syncButtonClasses = syncButtonClasses;
        this._displayAppList = displayAppList;
        this._selectedAppCategory = 'all';
        this._categorySidebar = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-categories',
            orientation: Clutter.Orientation.VERTICAL,
            y_expand: true,
            visible: false,
        });
        this._body.add_child(this._categorySidebar);
    }

    get actor() {
        return this._categorySidebar;
    }

    resetSelection() {
        this._selectedAppCategory = 'all';
    }

    buildCategorySidebar(allApps, groupedApps) {
        this._categorySidebar.destroy_all_children();
        const categories = [
            {id: 'all', label: _('All'), apps: allApps},
            ...APP_CATEGORIES
                .map(category => ({
                    id: category.id,
                    label: category.label(),
                    apps: groupedApps.get(category.id),
                }))
                .filter(category => category.apps.length > 0),
        ];
        const otherApps = groupedApps.get('other');
        if (otherApps.length > 0) {
            categories.push({
                id: 'other',
                label: _('Other'),
                apps: otherApps,
            });
        }
        if (!categories.some(
            category => category.id === this._selectedAppCategory
        ))
            this._selectedAppCategory = 'all';

        for (const category of categories) {
            const button = new St.Button({
                style_class: 'simple-taskbar-windows-start-category',
                reactive: true,
                can_focus: true,
                track_hover: true,
                toggle_mode: true,
                checked: category.id === this._selectedAppCategory,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                accessible_name: category.label,
                child: new St.Label({
                    text: category.label,
                    x_align: Clutter.ActorAlign.START,
                    y_align: Clutter.ActorAlign.CENTER,
                    x_expand: true,
                }),
            });
            button._startMenuCategoryId = category.id;
            this._navigationController.enable(button);
            button.connect('clicked', () => {
                this._selectedAppCategory = category.id;
                for (const child of this._categorySidebar.get_children()) {
                    child.checked =
                        child._startMenuCategoryId === category.id;
                }
                this._scrollView.vadjustment.value = 0;
                this._displayAppList(category.apps, true);
            });
            this._syncButtonClasses(button);
            this._categorySidebar.add_child(button);
        }

        return categories.find(
            category => category.id === this._selectedAppCategory
        );
    }

    setVisible(visible) {
        this._categorySidebar.visible = visible;
        if (visible)
            this._body.add_style_class_name(
                'simple-taskbar-windows-start-categorized'
            );
        else
            this._body.remove_style_class_name(
                'simple-taskbar-windows-start-categorized'
            );
    }

    destroy() {
        this._categorySidebar.destroy();
        this._categorySidebar = null;
        this._displayAppList = null;
        this._syncButtonClasses = null;
        this._navigationController = null;
        this._scrollView = null;
        this._body = null;
        this._selectedAppCategory = null;
    }
}
