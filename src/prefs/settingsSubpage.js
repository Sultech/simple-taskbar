// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

export class SettingsSubpage {
    constructor(window, hubGroup, {title, subtitle, iconName}) {
        this._groups = [];
        this.page = new Adw.PreferencesPage();
        const toolbarView = new Adw.ToolbarView({content: this.page});
        toolbarView.add_top_bar(new Adw.HeaderBar());
        const navigationPage = new Adw.NavigationPage({
            title,
            child: toolbarView,
        });

        this.row = new Adw.ActionRow({title, subtitle, activatable: true});
        this.row.add_prefix(new Gtk.Image({icon_name: iconName}));
        this.row.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
        this.row.connect('activated', () => window.push_subpage(navigationPage));
        hubGroup.add(this.row);
    }

    add(group) {
        this.page.add(group);
        this._groups.push(group);
        group.connect('notify::visible', () => this._syncRowVisibility());
        this._syncRowVisibility();
    }

    addGroup(params) {
        const group = new Adw.PreferencesGroup(params);
        this.add(group);
        return group;
    }

    _syncRowVisibility() {
        this.row.visible = this._groups.some(group => group.visible);
    }
}

export function addSettingsHub(window, page, sections) {
    const subpages = {};
    for (const {title, rows} of sections) {
        const group = new Adw.PreferencesGroup({title});
        page.add(group);
        const sectionRows = rows.map(({id, ...row}) => {
            subpages[id] = new SettingsSubpage(window, group, row);
            return subpages[id].row;
        });
        const syncGroupVisibility = () => {
            group.visible = sectionRows.some(row => row.visible);
        };
        for (const row of sectionRows)
            row.connect('notify::visible', syncGroupVisibility);
        syncGroupVisibility();
    }
    return subpages;
}
