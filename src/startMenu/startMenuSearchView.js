// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {setStylePseudoClass} from '../shared/styleUtils.js';

export const PASSIVE_SEARCH_CLASS =
    'simple-taskbar-windows-start-search-passive';
const TYPE_TO_SEARCH_BLOCKING_MODIFIERS =
    Clutter.ModifierType.CONTROL_MASK |
    Clutter.ModifierType.MOD1_MASK |
    Clutter.ModifierType.MOD4_MASK |
    Clutter.ModifierType.SUPER_MASK;

function searchResultKey(result) {
    return `${result.provider.id}:${result.id}`;
}

export class StartMenuSearchView {
    constructor({root, getContent, navigationController, listViewBuilder,
        clearContent, showEmptyMessage, onQueryChanged, onActivate}) {
        this._getContent = getContent;
        this._navigationController = navigationController;
        this._listViewBuilder = listViewBuilder;
        this._clearContent = clearContent;
        this._showEmptyMessage = showEmptyMessage;
        this._onQueryChanged = onQueryChanged;
        this._onActivate = onActivate;
        this._selectedSearchResult = null;
        this._selectedSearchButton = null;
        this._searchResultButtons = new Map();
        this._searchSelectionVisible = false;
        this._ignoreSearchChanged = false;
        this._createSearchEntry(root);
    }

    get entry() {
        return this._searchEntry;
    }

    get selectedResult() {
        return this._selectedSearchResult;
    }

    set selectedResult(result) {
        this._selectedSearchResult = result;
    }

    get selectedButton() {
        return this._selectedSearchButton;
    }

    clearSelection() {
        this._selectedSearchButton = null;
    }

    destroy() {
        this._searchClearIcon.destroy();
        this._searchClearIcon = null;
        this._searchEntry.destroy();
        this._searchEntry = null;
        this._selectedSearchResult = null;
        this._selectedSearchButton = null;
        this._searchResultButtons.clear();
        this._searchResultButtons = null;
        this._getContent = null;
        this._navigationController = null;
        this._listViewBuilder = null;
        this._clearContent = null;
        this._showEmptyMessage = null;
        this._onQueryChanged = null;
        this._onActivate = null;
    }

    _createSearchEntry(root) {
        this._searchEntry = new St.Entry({
            style_class: 'simple-taskbar-windows-start-search',
            hint_text: _('Type here to search'),
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        ShellEntry.addContextMenu(this._searchEntry);
        this._searchEntry.set_primary_icon(new St.Icon({
            icon_name: 'system-search-symbolic',
            style_class: 'simple-taskbar-windows-start-search-icon',
        }));
        this._searchClearIcon = new St.Icon({
            icon_name: 'edit-clear-symbolic',
            style_class: 'simple-taskbar-windows-start-search-icon',
        });
        this._searchEntry.connect('secondary-icon-clicked', () => {
            this._searchEntry.set_text('');
            this._searchEntry.grab_key_focus();
        });
        this._searchEntry.connect('captured-event', (_actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS ||
                event.type() === Clutter.EventType.TOUCH_BEGIN) {
                this.setFocusVisible(true);
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._searchEntry.clutter_text.connect('key-focus-in', () =>
            this._setSearchSelectionVisible(true));
        this._searchEntry.clutter_text.connect('key-focus-out', () =>
            this._setSearchSelectionVisible(false));
        this._searchEntry.clutter_text.connect('text-changed', () => {
            const text = this._searchEntry.get_text();
            const query = text.trim();
            this._searchEntry.set_secondary_icon(
                query ? this._searchClearIcon : null
            );
            if (this._ignoreSearchChanged)
                return;
            this.setFocusVisible(Boolean(text));
            this._onQueryChanged(query);
        });
        this._searchEntry.clutter_text.connect('key-press-event', (_actor, event) => {
            const navigationResult = this._navigationController.handle(event);
            if (navigationResult === Clutter.EVENT_STOP)
                return navigationResult;

            const symbol = event.get_key_symbol();
            if (symbol !== Clutter.KEY_Return && symbol !== Clutter.KEY_KP_Enter)
                return Clutter.EVENT_PROPAGATE;

            return this._onActivate()
                ? Clutter.EVENT_STOP
                : Clutter.EVENT_PROPAGATE;
        });
        this._searchEntry.clutter_text.connect('activate', () =>
            this._onActivate());
        root.add_child(this._searchEntry);
    }

    displayResults(groups, complete) {
        const focusedKey = this._focusedSearchResultKey();
        this._clearContent();
        this._searchResultButtons.clear();
        this._selectedSearchResult = groups[0]?.results[0] ?? null;
        if (groups.length === 0) {
            if (!complete)
                return;
            this._showEmptyMessage();
            return;
        }

        for (const group of groups) {
            if (group.name) {
                this._getContent().add_child(new St.Label({
                    style_class: 'simple-taskbar-windows-start-section-heading',
                    text: group.name,
                }));
            }
            const list = new St.BoxLayout({
                style_class: 'simple-taskbar-windows-start-app-list',
                orientation: Clutter.Orientation.VERTICAL,
            });
            for (const result of group.results) {
                const button =
                    this._listViewBuilder.createSearchResultButton(result);
                button.connect('notify::hover', () => {
                    if (button.hover)
                        this._setSearchSelection(result, button);
                });
                this._selectedSearchButton ??= button;
                this._searchResultButtons.set(
                    searchResultKey(result),
                    button
                );
                list.add_child(button);
            }
            this._getContent().add_child(list);
        }
        this._syncSearchSelection();
        this._restoreSearchFocus(focusedKey);
    }

    _focusedSearchResultKey() {
        const focus = global.stage.get_key_focus();
        if (!focus || !this._getContent().contains(focus))
            return null;

        for (const [key, button] of this._searchResultButtons) {
            if (button === focus || button.contains(focus))
                return key;
        }
        return null;
    }

    _restoreSearchFocus(key) {
        if (key === null)
            return;

        const button = this._searchResultButtons.get(key) ??
            this._searchResultButtons.values().next().value;
        if (button)
            button.grab_key_focus();
    }

    _setSearchSelection(result, button) {
        if (this._selectedSearchButton === button)
            return;

        this._selectedSearchButton?.remove_style_pseudo_class('selected');
        this._selectedSearchResult = result;
        this._selectedSearchButton = button;
        this._syncSearchSelection();
    }

    _setSearchSelectionVisible(visible) {
        if (this._searchSelectionVisible === visible)
            return;

        this._searchSelectionVisible = visible;
        this._syncSearchSelection();
    }

    _syncSearchSelection() {
        const button = this._selectedSearchButton;
        if (!button)
            return;

        setStylePseudoClass(button, 'selected', this._searchSelectionVisible);
    }

    typeIntoSearch(event) {
        if (this._searchEntry.clutter_text.has_key_focus() ||
            event.get_state() & TYPE_TO_SEARCH_BLOCKING_MODIFIERS)
            return Clutter.EVENT_PROPAGATE;

        const text = this._searchEntry.get_text();
        const symbol = event.get_key_symbol();
        let newText;
        if (symbol === Clutter.KEY_BackSpace) {
            if (!text)
                return Clutter.EVENT_PROPAGATE;
            newText = [...text].slice(0, -1).join('');
        } else {
            const character = Clutter.keysym_to_unicode(symbol);
            if (character <= 0x20 || character === 0x7f)
                return Clutter.EVENT_PROPAGATE;
            newText = text + String.fromCodePoint(character);
        }

        this._searchEntry.grab_key_focus();
        this._searchEntry.set_text(newText);
        this._searchEntry.clutter_text.set_cursor_position(-1);
        this._searchEntry.clutter_text.set_selection_bound(-1);
        return Clutter.EVENT_STOP;
    }

    setText(text) {
        if (this._searchEntry.get_text() === text)
            return;

        this._ignoreSearchChanged = true;
        this._searchEntry.set_text(text);
        this._ignoreSearchChanged = false;
    }

    setFocusVisible(visible) {
        if (visible)
            this._searchEntry.remove_style_class_name(PASSIVE_SEARCH_CLASS);
        else
            this._searchEntry.add_style_class_name(PASSIVE_SEARCH_CLASS);
        this._searchEntry.clutter_text.set_cursor_visible(visible);
    }
}
