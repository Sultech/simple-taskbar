// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function* widgets(widget) {
    yield widget;
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        yield* widgets(child);
}

function searchText(text) {
    return text.replace(/<[^>]*>/g, '').normalize('NFKD')
        .replace(/\p{M}/gu, '').toLocaleLowerCase();
}

export class SettingsSearchController {
    constructor(window) {
        this._window = window;
        this._pages = [];
        this._subpages = [];
        this._optionDialogs = new Set();
        this._dialog = null;
        this._dialogClosedId = 0;
        this._pendingResult = null;
    }

    setPages(pages) {
        this._pages = pages;
    }

    addSubpage(subpage) {
        this._subpages.push(subpage);
    }

    createButton() {
        const button = new Gtk.Button({
            icon_name: 'system-search-symbolic',
            tooltip_text: _('Search Settings'),
        });
        button.connect('clicked', () => this.open());
        return button;
    }

    addWindowButton() {
        const headerBar = [...widgets(this._window.get_content())]
            .find(widget => widget instanceof Adw.HeaderBar);
        headerBar.pack_start(this.createButton());
    }

    open() {
        if (this._dialog)
            return;

        const entries = this._buildIndex();
        const search = new Gtk.SearchEntry({
            placeholder_text: _('Search all settings'),
            hexpand: true,
        });
        const headerBar = new Adw.HeaderBar({title_widget: search});
        const results = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            valign: Gtk.Align.START,
        });
        results.add_css_class('boxed-list');
        const status = new Adw.StatusPage({
            icon_name: 'system-search-symbolic',
            title: _('Search Settings'),
            description: _('Find settings in any page or options dialog'),
        });
        const stack = new Gtk.Stack();
        stack.add_named(status, 'status');
        stack.add_named(new Gtk.ScrolledWindow({
            child: results,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vexpand: true,
        }), 'results');
        const toolbarView = new Adw.ToolbarView({content: stack});
        toolbarView.add_top_bar(headerBar);
        this._dialog = new Adw.Dialog({
            title: _('Search Settings'),
            content_width: 600,
            content_height: 620,
            child: toolbarView,
        });
        this._dialogClosedId = this._dialog.connect('closed', () => {
            const selected = this._pendingResult;
            this._pendingResult = null;
            this._dialog.disconnect(this._dialogClosedId);
            this._dialog = null;
            this._dialogClosedId = 0;
            for (const dialog of this._optionDialogs) {
                if (dialog !== selected?.dialog)
                    dialog._settingsSearchDispose();
            }
            this._optionDialogs.clear();
            if (selected)
                this._activate(selected);
        });
        search.connect('search-changed', () => {
            while (results.get_first_child())
                results.remove(results.get_first_child());

            const terms = searchText(search.text).trim().split(/\s+/);
            if (!terms[0]) {
                status.title = _('Search Settings');
                status.description = _('Find settings in any page or options dialog');
                stack.visible_child_name = 'status';
                return;
            }

            const matches = entries.filter(entry =>
                terms.every(term => entry.text.includes(term)))
                .sort((a, b) => Number(b.available) - Number(a.available));
            for (const entry of matches) {
                const result = new Adw.ActionRow({
                    title: entry.row.title,
                    subtitle: entry.path.join(' › '),
                    activatable: true,
                    sensitive: entry.available,
                });
                result.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
                result.connect('activated', () => {
                    this._pendingResult = entry;
                    this._dialog.close();
                });
                results.append(result);
            }
            if (matches.length) {
                stack.visible_child_name = 'results';
            } else {
                status.title = _('No Results Found');
                status.description = _('Try a different search');
                stack.visible_child_name = 'status';
            }
        });
        search.connect('stop-search', () => this._dialog.close());
        this._dialog.present(this._window);
        search.grab_focus();
    }

    _buildIndex() {
        const entries = [];
        for (const page of this._pages) {
            this._indexWidgets(page, {
                page,
                navigationPage: null,
                available: true,
                path: [page.title],
                dialog: null,
            }, entries);
        }
        for (const {page, navigationPage, row, hubGroup} of this._subpages) {
            const parentPage = hubGroup.get_ancestor(Adw.PreferencesPage);
            this._indexWidgets(page, {
                page: parentPage,
                navigationPage,
                available: this._isAvailable(row, parentPage),
                path: [parentPage.title, row.title],
                dialog: null,
            }, entries);
        }
        return entries;
    }

    _isAvailable(widget, root) {
        if (!widget.visible || !widget.is_sensitive())
            return false;

        if (widget instanceof Adw.ActionRow && widget.activatable_widget &&
            !widget.activatable_widget.is_sensitive())
            return false;

        for (let parent = widget.get_parent(); parent && parent !== root; parent = parent.get_parent()) {
            if ((parent instanceof Adw.PreferencesRow || parent instanceof Adw.PreferencesGroup) &&
                !parent.visible)
                return false;
        }
        return true;
    }

    _indexWidgets(root, context, entries) {
        const seen = new Set();
        for (const widget of widgets(root)) {
            if (widget instanceof Adw.PreferencesRow && widget.title) {
                if (this._subpages.some(subpage => subpage.row === widget))
                    continue;
                const expander = widget.get_ancestor(Adw.ExpanderRow);
                if (expander && widget instanceof Adw.ActionRow && widget.title === expander.title)
                    continue;

                const path = [...context.path];
                const available = context.available && this._isAvailable(widget, root);
                for (let parent = widget.get_parent(); parent && parent !== root; parent = parent.get_parent()) {
                    if (parent instanceof Adw.PreferencesGroup ||
                        parent instanceof Adw.ExpanderRow) {
                        if (parent.title)
                            path.splice(context.path.length, 0, parent.title);
                    }
                }
                const subtitle = widget instanceof Adw.ActionRow || widget instanceof Adw.ExpanderRow
                    ? widget.subtitle : '';
                const labels = [...path, widget.title, subtitle];
                for (const child of widgets(widget)) {
                    if (child instanceof Gtk.DropDown) {
                        const model = child.model;
                        for (let index = 0; index < model.get_n_items(); index++)
                            labels.push(model.get_string(index));
                    } else if (child instanceof Gtk.Button) {
                        labels.push(child.label ?? '', child.tooltip_text ?? '');
                    }
                }
                const text = searchText(labels.join(' '));
                if (!seen.has(text)) {
                    seen.add(text);
                    entries.push({
                        ...context,
                        row: widget,
                        path,
                        text,
                        available,
                    });
                }
            }
            if (widget instanceof Gtk.Button && widget._settingsSearchCreateDialog) {
                const dialog = widget._settingsSearchCreateDialog(this._window);
                this._optionDialogs.add(dialog);
                this._indexWidgets(dialog.get_content(), {
                    ...context,
                    dialog,
                    available: context.available && this._isAvailable(widget, root),
                    path: [...context.path, widget.tooltip_text],
                }, entries);
            }
        }
    }

    _activate(entry) {
        this._window.pop_subpage();
        this._window.set_visible_page(entry.page);
        if (entry.navigationPage)
            this._window.push_subpage(entry.navigationPage);
        if (entry.dialog)
            entry.dialog.present();
        for (let parent = entry.row.get_parent(); parent; parent = parent.get_parent()) {
            if (parent instanceof Adw.ExpanderRow)
                parent.expanded = true;
        }
        entry.row.grab_focus();
    }

    destroy() {
        this._pendingResult = null;
        if (this._dialog) {
            this._dialog.disconnect(this._dialogClosedId);
            this._dialogClosedId = 0;
            this._dialog.force_close();
            this._dialog = null;
        }
        for (const dialog of this._optionDialogs)
            dialog._settingsSearchDispose();
        this._optionDialogs.clear();
        this._optionDialogs = null;
        this._pages = null;
        this._subpages = null;
        this._window = null;
    }
}
