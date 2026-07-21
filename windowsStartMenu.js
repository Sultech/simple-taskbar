// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {showScreenshotUI} from 'resource:///org/gnome/shell/ui/screenshot.js';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelArrowSide, syncMenuArrowSide} from './panelPosition.js';
import {StartMenuAppMenu} from './startMenuAppMenu.js';
import {StartMenuSearchController} from './startMenuSearchController.js';

const GRID_COLUMNS = 6;
const APP_TILE_WIDTH = 88;
const MAX_RECOMMENDED_APPS = 6;

export class WindowsStartMenu {
    constructor(sourceActor, settings, params = {}) {
        this._sourceActor = sourceActor;
        this._settings = settings;
        this._onOpenStateChanged = params.onOpenStateChanged ?? null;
        this._openPreferences = params.openPreferences ?? null;
        this._onSourceContextMenu = params.onSourceContextMenu ?? null;
        this._appSystem = Shell.AppSystem.get_default();
        this._searchController = new StartMenuSearchController();
        this._firstSearchResult = null;
        this._view = 'pinned';
        this._firstVisibleApp = null;
        this._sourcePressWasOpen = false;
        this._sourcePressResetId = 0;
        this._prepareIdleId = 0;
        this._ignoreSearchChanged = false;
        this._appliedTheme = null;
        this._pinnedView = null;
        this._pinnedSignature = null;
        this._pinnedApps = [];
        this._menuWidth = 0;
        this._menuHeight = 0;
        this._appContextMenu = null;
        this._appContextMenuManager = null;
        this._appActionCloseIdleId = 0;
        this._centerAnchor = new St.Widget({
            reactive: false,
            opacity: 0,
            width: 1,
            height: 1,
        });
        Main.uiGroup.add_child(this._centerAnchor);

        this._menu = new PopupMenu.PopupMenu(
            sourceActor,
            0.5,
            panelArrowSide(settings)
        );
        this._menu.actor.add_style_class_name('simple-taskbar-windows-start-menu');
        this.syncTheme();
        this._menu.actor.hide();
        Main.uiGroup.add_child(this._menu.actor);

        this._menuManager = params.menuManager ??
            new PopupMenu.PopupMenuManager(sourceActor);
        this._menuManager.addMenu(this._menu);
        // PopupMenuManager closes this menu before a source-button press is
        // dispatched to the button. Run the context-menu handoff after the
        // manager's captured-event handler so the same right click can open
        // the Start settings menu.
        this._menu.actor.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
                event.get_button() !== Clutter.BUTTON_SECONDARY ||
                !this._onSourceContextMenu)
                return Clutter.EVENT_PROPAGATE;

            const target = global.stage.get_event_actor(event);
            if (!target || (target !== this._sourceActor &&
                !this._sourceActor.contains(target)))
                return Clutter.EVENT_PROPAGATE;

            this.close();
            this._onSourceContextMenu();
            return Clutter.EVENT_STOP;
        });

        const section = new PopupMenu.PopupMenuSection();
        this._menu.addMenuItem(section);

        this._root = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        section.actor.add_child(this._root);

        this._createSearchEntry();
        this._createHeader();

        this._scrollView = new St.ScrollView({
            style_class: 'simple-taskbar-windows-start-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.EXTERNAL,
            overlay_scrollbars: true,
            x_expand: true,
            y_expand: true,
        });
        for (const child of this._scrollView.get_children()) {
            if (!(child instanceof St.ScrollBar))
                continue;
            child.add_style_class_name(
                'simple-taskbar-windows-start-scrollbar'
            );
        }
        this._content = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-content',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this._scrollView.add_child(this._content);
        this._root.add_child(this._scrollView);

        this._createFooter();
        this._showPinnedApps();
        this._updateSize();
        this.syncTheme(true);
        this._prepareHiddenMenu();

        this._menu.connect('open-state-changed', (_menu, open) => {
            if (!open) {
                this._destroyAppContextMenu();
            }
            this._onOpenStateChanged?.(open);
        });

        this._stageCapturedEventId = global.stage.connect(
            'captured-event',
            (_actor, event) => {
                if (!this._menu.isOpen)
                    return Clutter.EVENT_PROPAGATE;

                const eventType = event.type();
                const isButtonPress =
                    eventType === Clutter.EventType.BUTTON_PRESS;
                const isTouchBegin =
                    eventType === Clutter.EventType.TOUCH_BEGIN;
                if (!isButtonPress && !isTouchBegin)
                    return Clutter.EVENT_PROPAGATE;

                const target = global.stage.get_event_actor(event);
                const insideSource = target &&
                    (target === this._sourceActor ||
                        this._sourceActor.contains(target));

                if ((isButtonPress || isTouchBegin) && insideSource) {
                    this._sourcePressWasOpen = true;
                    if (this._sourcePressResetId)
                        GLib.Source.remove(this._sourcePressResetId);
                    this._sourcePressResetId = GLib.idle_add(
                        GLib.PRIORITY_DEFAULT_IDLE,
                        () => {
                            this._sourcePressResetId = 0;
                            this._sourcePressWasOpen = false;
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                }
                return Clutter.EVENT_PROPAGATE;
            }
        );
    }

    get isOpen() {
        return this._menu?.isOpen ?? false;
    }

    toggle() {
        if (this._sourcePressWasOpen) {
            this._sourcePressWasOpen = false;
            this.close();
            return;
        }

        if (this.isOpen)
            this.close();
        else
            this.open();
    }

    open() {
        this._sourcePressWasOpen = false;
        this._view = 'pinned';
        this._setSearchText('');
        this._showPinnedApps();
        this._updateSize();
        syncMenuArrowSide(this._menu, this._settings);
        const originalSource = this._menu.sourceActor;
        this._menu.sourceActor = this._getPositionSource();
        try {
            this._menu.open(BoxPointer.PopupAnimation.FULL);
        } finally {
            this._menu.sourceActor = originalSource;
        }
        if (this.isOpen)
            this._searchEntry.grab_key_focus();
    }

    close(animation = BoxPointer.PopupAnimation.FULL) {
        this._sourcePressWasOpen = false;
        this._searchController?.cancel();
        this._destroyAppContextMenu();
        this._menu?.close(animation);
    }

    refresh() {
        if (!this.isOpen)
            return;

        const query = this._searchEntry.get_text().trim();
        if (query)
            this._showSearchResults(query);
        else if (this._view === 'all')
            this._showAllApps();
        else
            this._showPinnedApps();
    }

    syncTheme(force = false) {
        const theme = this._effectiveTheme();
        const changed = force || theme !== this._appliedTheme;
        if (changed) {
            this._applyThemeClass(this._menu?.actor, theme);
            this._syncShellButtonClasses(this._root);
            this._appliedTheme = theme;
            this._queuePrepare();
        }
        this._applyThemeClass(this._appContextMenu?.actor, theme);
    }

    _applyThemeClass(actor, theme = this._effectiveTheme()) {
        if (!actor)
            return;
        actor.remove_style_class_name('simple-taskbar-windows-start-dark');
        actor.remove_style_class_name('simple-taskbar-windows-start-light');
        actor.remove_style_class_name('simple-taskbar-windows-start-shell');
        if (theme === 'dark')
            actor.add_style_class_name('simple-taskbar-windows-start-dark');
        else if (theme === 'light')
            actor.add_style_class_name('simple-taskbar-windows-start-light');
        else
            actor.add_style_class_name('simple-taskbar-windows-start-shell');
    }

    _getPositionSource() {
        const centerOnMonitor =
            this._settings.get_boolean('start-menu-monitor-centered') &&
            this._startButtonIsCentered();
        const monitor = this._getSourceMonitor();
        if (!centerOnMonitor || !monitor || !this._centerAnchor)
            return this._sourceActor;

        const [, sourceY] = this._sourceActor.get_transformed_position();
        this._centerAnchor.set_position(
            Math.round(monitor.x + monitor.width / 2),
            Math.round(sourceY)
        );
        return this._centerAnchor;
    }

    _startButtonIsCentered() {
        return this._settings.get_boolean(
            'start-button-follow-app-alignment'
        )
            ? this._settings.get_string('app-alignment') === 'center'
            : this._settings.get_string('start-button-position') === 'center';
    }

    _syncShellButtonClasses(actor) {
        if (!actor)
            return;
        if (actor instanceof St.Button) {
            if (this._effectiveTheme() === 'shell')
                actor.add_style_class_name('popup-menu-item');
            else
                actor.remove_style_class_name('popup-menu-item');
        }
        for (const child of actor.get_children?.() ?? [])
            this._syncShellButtonClasses(child);
    }

    _effectiveTheme() {
        if (!this._settings.get_boolean('start-menu-follow-panel-theme'))
            return this._settings.get_string('start-menu-theme');

        return Main.panel.has_style_class_name('simple-taskbar-theme-light')
            ? 'light'
            : 'dark';
    }

    _getSourceMonitor() {
        return Main.layoutManager.findMonitorForActor(this._sourceActor) ??
            Main.layoutManager.primaryMonitor;
    }

    destroy() {
        if (this._sourcePressResetId) {
            GLib.Source.remove(this._sourcePressResetId);
            this._sourcePressResetId = 0;
        }
        if (this._prepareIdleId) {
            GLib.Source.remove(this._prepareIdleId);
            this._prepareIdleId = 0;
        }
        if (this._appActionCloseIdleId) {
            GLib.Source.remove(this._appActionCloseIdleId);
            this._appActionCloseIdleId = 0;
        }
        if (this._stageCapturedEventId) {
            global.stage.disconnect(this._stageCapturedEventId);
            this._stageCapturedEventId = 0;
        }
        this._searchClearIcon?.destroy();
        this._searchClearIcon = null;
        this._pinnedView?.destroy();
        this._pinnedView = null;
        this._pinnedApps = null;
        this._pinnedSignature = null;
        this._searchController?.destroy();
        this._searchController = null;
        this._destroyAppContextMenu();
        this._menu?.destroy();
        this._menu = null;
        this._centerAnchor?.destroy();
        this._centerAnchor = null;
        this._sourceActor = null;
        this._settings = null;
        this._onSourceContextMenu = null;
        this._firstSearchResult = null;
        this._appSystem = null;
        this._appliedTheme = null;
    }

    _createSearchEntry() {
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
        this._searchEntry.clutter_text.connect('text-changed', () => {
            const query = this._searchEntry.get_text().trim();
            this._searchEntry.set_secondary_icon(
                query ? this._searchClearIcon : null
            );
            if (this._ignoreSearchChanged)
                return;
            if (query)
                this._showSearchResults(query);
            else if (this._view === 'all')
                this._showAllApps();
            else
                this._showPinnedApps();
        });
        this._searchEntry.clutter_text.connect('key-press-event', (_actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol !== Clutter.KEY_Return && symbol !== Clutter.KEY_KP_Enter)
                return Clutter.EVENT_PROPAGATE;

            if (this._firstSearchResult) {
                this._activateSearchResult(this._firstSearchResult);
                return Clutter.EVENT_STOP;
            }
            if (this._firstVisibleApp) {
                this._launchApp(this._firstVisibleApp);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._root.add_child(this._searchEntry);
    }

    _createHeader() {
        this._header = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-header',
            x_expand: true,
        });
        this._headerTitle = new St.Label({
            style_class: 'simple-taskbar-windows-start-heading',
            text: _('Pinned'),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._allAppsButton = this._createTextButton(
            _('All apps'),
            'go-next-symbolic',
            () => {
                this._view = 'all';
                this._setSearchText('');
                this._showAllApps();
            }
        );
        this._backButton = this._createTextButton(
            _('Back'),
            'go-previous-symbolic',
            () => {
                this._view = 'pinned';
                this._setSearchText('');
                this._showPinnedApps();
            }
        );
        this._backButton.hide();
        this._header.add_child(this._headerTitle);
        this._header.add_child(this._backButton);
        this._header.add_child(this._allAppsButton);
        this._root.add_child(this._header);
    }

    _createTextButton(labelText, iconName, callback) {
        const box = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-nav-content',
        });
        box.add_child(new St.Label({
            text: labelText,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Icon({
            icon_name: iconName,
            icon_size: 12,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const button = new St.Button({
            style_class: 'simple-taskbar-windows-start-nav',
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: box,
        });
        button.connect('clicked', callback);
        this._syncShellButtonClasses(button);
        return button;
    }

    _createFooter() {
        this._footer = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-footer',
            x_expand: true,
        });
        const userName = GLib.get_real_name() || GLib.get_user_name();
        const userBox = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-user-content',
            x_expand: true,
        });
        userBox.add_child(new St.Icon({
            icon_name: 'avatar-default-symbolic',
            icon_size: 28,
        }));
        userBox.add_child(new St.Label({
            text: userName,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const userButton = new St.Button({
            style_class: 'simple-taskbar-windows-start-footer-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            child: userBox,
        });
        userButton.connect('clicked', () => {
            this.close();
            this._openSettingsPanel('system', ['users']);
        });
        this._syncShellButtonClasses(userButton);

        const settingsButton = this._createIconButton(
            'emblem-system-symbolic',
            _('Settings'),
            () => {
                this.close();
                this._openSettings();
            }
        );
        this._footer.add_child(userButton);
        this._footer.add_child(settingsButton);
        this._root.add_child(this._footer);
    }

    _getSettingsApp() {
        return this._appSystem.lookup_app('org.gnome.Settings.desktop');
    }

    _openSettings() {
        this._getSettingsApp()?.activate();
    }

    _openSettingsPanel(panel, args = []) {
        const actionParameter = new GLib.Variant('(sav)', [
            panel,
            args.map(argument => new GLib.Variant('s', argument)),
        ]);
        const parameters = new GLib.Variant('(sava{sv})', [
            'launch-panel',
            [actionParameter],
            {},
        ]);
        Gio.DBus.session.call(
            'org.gnome.Settings',
            '/org/gnome/Settings',
            'org.freedesktop.Application',
            'ActivateAction',
            parameters,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (connection, result) => {
                try {
                    connection.call_finish(result);
                } catch (error) {
                    console.error(`Failed to open Settings panel: ${error}`);
                }
            }
        );
    }

    _createIconButton(iconName, accessibleName, callback) {
        const button = new St.Button({
            style_class: 'simple-taskbar-windows-start-icon-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: accessibleName,
            child: new St.Icon({
                icon_name: iconName,
                icon_size: 18,
            }),
        });
        button.connect('clicked', callback);
        this._syncShellButtonClasses(button);
        return button;
    }

    _showPinnedApps() {
        this._searchController.cancel();
        this._setAllAppsScrollbar(false);
        this._view = 'pinned';
        this._headerTitle.text = _('Pinned');
        this._allAppsButton.show();
        this._backButton.hide();
        this._ensurePinnedView();
        this._firstVisibleApp = this._pinnedApps[0] ?? null;
        this._firstSearchResult = null;

        const children = this._content.get_children();
        if (children.length === 1 && children[0] === this._pinnedView)
            return;

        this._clearContent();
        this._content.add_child(this._pinnedView);
    }

    _ensurePinnedView() {
        const pinnedApps = this._settings.get_strv('start-menu-pinned-apps')
            .map(id => this._appSystem.lookup_app(id))
            .filter(app => this._appShouldShow(app));
        const recommended = this._recommendedApps(pinnedApps);
        const signature = JSON.stringify({
            pinned: pinnedApps.map(app => [app.get_id(), app.get_name()]),
            recommended: recommended.map(app => [app.get_id(), app.get_name()]),
        });
        if (this._pinnedView && signature === this._pinnedSignature)
            return;

        const view = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-pinned-view',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        if (pinnedApps.length > 0) {
            view.add_child(this._createAppGrid(pinnedApps));
        } else {
            view.add_child(new St.Label({
                style_class: 'simple-taskbar-windows-start-empty-pinned',
                text: _('Choose All, then right-click an app to pin it'),
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }

        if (recommended.length > 0) {
            view.add_child(new St.Label({
                style_class: 'simple-taskbar-windows-start-section-heading',
                text: _('Recommended'),
            }));
            view.add_child(this._createRecommendedGrid(recommended));
        }

        this._pinnedView?.destroy();
        this._pinnedView = view;
        this._pinnedApps = pinnedApps;
        this._pinnedSignature = signature;
        this._queuePrepare();
    }

    _showAllApps() {
        this._searchController.cancel();
        this._setAllAppsScrollbar(true);
        this._view = 'all';
        this._headerTitle.text = _('All apps');
        this._allAppsButton.hide();
        this._backButton.show();
        this._displayAppList(this._allApps());
    }

    _showSearchResults(query) {
        this._setAllAppsScrollbar(false);
        this._headerTitle.text = _('Search results');
        this._allAppsButton.hide();
        this._backButton.show();
        this._firstVisibleApp = null;
        this._firstSearchResult = null;
        this._clearContent();

        this._searchController.search(query, (groups, complete) => {
            this._displaySearchResults(groups, complete);
        });
    }

    _setAllAppsScrollbar(visible) {
        this._scrollView.set_overlay_scrollbars(!visible);
        this._scrollView.set_policy(
            St.PolicyType.NEVER,
            visible ? St.PolicyType.AUTOMATIC : St.PolicyType.EXTERNAL
        );
        if (visible)
            this._scrollView.vadjustment.value = 0;
    }

    _displaySearchResults(groups, complete) {
        this._clearContent();
        this._firstSearchResult = groups[0]?.results[0] ?? null;
        if (groups.length === 0) {
            if (!complete)
                return;
            this._content.add_child(new St.Label({
                style_class: 'simple-taskbar-windows-start-empty',
                text: _('No results found'),
                x_align: Clutter.ActorAlign.CENTER,
            }));
            return;
        }

        for (const group of groups) {
            if (group.name) {
                this._content.add_child(new St.Label({
                    style_class: 'simple-taskbar-windows-start-section-heading',
                    text: group.name,
                }));
            }
            const list = new St.BoxLayout({
                style_class: 'simple-taskbar-windows-start-app-list',
                orientation: Clutter.Orientation.VERTICAL,
            });
            for (const result of group.results)
                list.add_child(this._createSearchResultButton(result));
            this._content.add_child(list);
        }
    }

    _displayAppList(apps) {
        this._clearContent();
        this._firstVisibleApp = apps[0] ?? null;
        this._firstSearchResult = null;
        if (apps.length === 0) {
            this._content.add_child(new St.Label({
                style_class: 'simple-taskbar-windows-start-empty',
                text: _('No results found'),
                x_align: Clutter.ActorAlign.CENTER,
            }));
            return;
        }

        const list = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-list',
            orientation: Clutter.Orientation.VERTICAL,
        });
        for (const app of apps)
            list.add_child(this._createAppListButton(app));
        this._content.add_child(list);
    }

    _clearContent() {
        for (const child of this._content.get_children()) {
            if (child === this._pinnedView)
                this._content.remove_child(child);
            else
                child.destroy();
        }
    }

    _createAppGrid(apps) {
        const grid = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-grid',
            orientation: Clutter.Orientation.VERTICAL,
        });
        for (let index = 0; index < apps.length; index += GRID_COLUMNS) {
            const row = new St.BoxLayout({
                style_class: 'simple-taskbar-windows-start-app-row',
                x_align: Clutter.ActorAlign.CENTER,
            });
            const rowApps = apps.slice(index, index + GRID_COLUMNS);
            for (const app of rowApps)
                row.add_child(this._createAppTile(app));
            for (let empty = rowApps.length; empty < GRID_COLUMNS; empty++)
                row.add_child(new St.Widget({width: APP_TILE_WIDTH}));
            grid.add_child(row);
        }
        return grid;
    }

    _createAppTile(app) {
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-tile-content',
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(app.create_icon_texture(32));
        const label = this._createAppLabel(app.get_name(), 78);
        label.add_style_class_name('simple-taskbar-windows-start-app-tile-label');
        label.x_align = Clutter.ActorAlign.CENTER;
        content.add_child(label);
        const button = new St.Button({
            style_class: 'simple-taskbar-windows-start-app-tile',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: APP_TILE_WIDTH,
            accessible_name: app.get_name(),
            child: content,
        });
        button.connect('clicked', () => this._launchApp(app));
        this._addAppContextMenuHandler(button, app);
        this._syncShellButtonClasses(button);
        return button;
    }

    _createRecommendedGrid(apps) {
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
                row.add_child(this._createAppListButton(app, true));
            if (rowApps.length === 1)
                row.add_child(new St.Widget({x_expand: true}));
            grid.add_child(row);
        }
        return grid;
    }

    _createAppListButton(app, compact = false) {
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-list-content',
            x_expand: true,
        });
        content.add_child(app.create_icon_texture(compact ? 28 : 30));
        content.add_child(this._createAppLabel(app.get_name(), compact ? 190 : 480));
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
        button.connect('clicked', () => this._launchApp(app));
        this._addAppContextMenuHandler(button, app);
        this._syncShellButtonClasses(button);
        return button;
    }

    _createSearchResultButton(result) {
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-list-content',
            x_expand: true,
        });
        const icon = this._createSearchResultIcon(result);
        content.add_child(icon);
        content.add_child(this._createAppLabel(result.name, 480));
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
        button.connect('clicked', () => this._activateSearchResult(result));
        if (result.app)
            this._addAppContextMenuHandler(button, result.app);
        this._syncShellButtonClasses(button);
        return button;
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

        let icon;
        try {
            icon = result.meta.createIcon?.(30);
        } catch (error) {
            console.error(`Failed to create search result icon: ${error}`);
        }
        icon ??= new St.Icon({
            icon_name: 'system-search-symbolic',
            icon_size: 30,
        });
        icon.style_class = 'popup-menu-icon';
        return icon;
    }

    _addAppContextMenuHandler(button, app) {
        button.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_SECONDARY)
                return Clutter.EVENT_PROPAGATE;

            this._openAppContextMenu(button, app, event);
            return Clutter.EVENT_STOP;
        });
        button.connect('popup-menu', () => {
            this._openAppContextMenu(button, app);
            return Clutter.EVENT_STOP;
        });
    }

    _openAppContextMenu(sourceButton, app, event = null) {
        this._destroyAppContextMenu();

        let stageX;
        let stageY;
        if (event) {
            [stageX, stageY] = event.get_coords();
        } else {
            const [buttonX, buttonY] = sourceButton.get_transformed_position();
            const [buttonWidth, buttonHeight] = sourceButton.get_transformed_size();
            stageX = buttonX + Math.min(buttonWidth / 2, APP_TILE_WIDTH / 2);
            stageY = buttonY + buttonHeight / 2;
        }

        Main.layoutManager.setDummyCursorGeometry(
            Math.round(stageX),
            Math.round(stageY),
            0,
            0
        );

        const menu = new StartMenuAppMenu(
            Main.layoutManager.dummyCursor,
            panelArrowSide(this._settings),
            this._settings,
            {
                onStartPinsChanged: () => {
                    refreshAfterClose = true;
                },
                onAppAction: () => this._queueCloseAfterAppAction(),
            }
        );
        const menuManager = new PopupMenu.PopupMenuManager(sourceButton);
        let refreshAfterClose = false;

        menu.actor.add_style_class_name('simple-taskbar-windows-start-context');
        this._applyThemeClass(menu.actor);
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        menuManager.addMenu(menu);
        menu.setApp(app);
        this._appContextMenu = menu;
        this._appContextMenuManager = menuManager;

        menu.connect('menu-closed', () => {
            if (this._appContextMenu !== menu)
                return;
            this._appContextMenu = null;
            this._appContextMenuManager = null;
            menu.destroy();
            if (refreshAfterClose)
                this.refresh();
        });
        menu.open(BoxPointer.PopupAnimation.FULL);
        menuManager.ignoreRelease?.();
    }

    _queueCloseAfterAppAction() {
        if (this._appActionCloseIdleId)
            return;

        this._appActionCloseIdleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._appActionCloseIdleId = 0;
                this.close();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _destroyAppContextMenu() {
        const menu = this._appContextMenu;
        this._appContextMenu = null;
        this._appContextMenuManager = null;
        menu?.destroy();
    }

    _createAppLabel(text, width) {
        const label = new St.Label({
            text,
            width,
            y_align: Clutter.ActorAlign.CENTER,
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        return label;
    }

    _allApps() {
        const apps = [];
        const seen = new Set();
        for (const appInfo of this._appSystem.get_installed()) {
            let id;
            try {
                id = appInfo.get_id();
            } catch {
                continue;
            }
            if (!id || seen.has(id) || !appInfo.should_show())
                continue;
            const app = this._appSystem.lookup_app(id);
            if (!app)
                continue;
            seen.add(id);
            apps.push(app);
        }
        return apps
            .sort((a, b) => a.get_name().localeCompare(b.get_name()));
    }

    _recommendedApps(pinnedApps) {
        const pinnedIds = new Set(pinnedApps.map(app => app.get_id()));
        return Shell.AppUsage.get_default().get_most_used()
            .filter(app => this._appShouldShow(app) && !pinnedIds.has(app.get_id()))
            .slice(0, MAX_RECOMMENDED_APPS);
    }

    _appShouldShow(app) {
        return app?.get_app_info()?.should_show() ?? false;
    }

    _launchApp(app) {
        this.close();
        app.activate();
    }

    _activateSearchResult(result) {
        const isScreenshot = result.id === 'open-screenshot-ui';
        this.close(isScreenshot
            ? BoxPointer.PopupAnimation.NONE
            : BoxPointer.PopupAnimation.FULL);
        if (isScreenshot) {
            showScreenshotUI();
            return;
        }
        try {
            if (typeof result.provider.activateResult === 'function') {
                const activation = result.provider.activateResult(
                    result.id,
                    result.terms
                );
                activation?.catch?.(error =>
                    console.error(`Failed to activate search result: ${error}`)
                );
            } else {
                result.app?.activate();
            }
            if (result.meta.clipboardText) {
                St.Clipboard.get_default().set_text(
                    St.ClipboardType.CLIPBOARD,
                    result.meta.clipboardText
                );
            }
        } catch (error) {
            console.error(`Failed to activate search result: ${error}`);
            result.app?.activate();
        }
    }

    _setSearchText(text) {
        if (this._searchEntry.get_text() === text)
            return;

        this._ignoreSearchChanged = true;
        try {
            this._searchEntry.set_text(text);
        } finally {
            this._ignoreSearchChanged = false;
        }
    }

    _queuePrepare() {
        if (this._prepareIdleId)
            GLib.Source.remove(this._prepareIdleId);
        this._prepareIdleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._prepareIdleId = 0;
                this._prepareHiddenMenu();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _prepareHiddenMenu() {
        if (!this._menu || this.isOpen)
            return;

        this._updateSize();
        syncMenuArrowSide(this._menu, this._settings);
        const sourceActor = this._getPositionSource();
        this._resolveThemeNodes(this._menu.actor);
        this._menu.actor.get_preferred_size();
        this._root.get_preferred_size();
        this._menu._boxPointer.setPosition(
            sourceActor,
            this._menu._arrowAlignment
        );
    }

    _resolveThemeNodes(actor) {
        if (actor instanceof St.Widget)
            actor.get_theme_node();
        for (const child of actor.get_children?.() ?? [])
            this._resolveThemeNodes(child);
    }

    _updateSize() {
        const monitor = this._getSourceMonitor();
        if (!monitor)
            return;
        const width = Math.min(640, Math.max(420, monitor.width - 32));
        const height = Math.min(610, Math.max(420, monitor.height - 96));
        if (width === this._menuWidth && height === this._menuHeight)
            return;

        this._menuWidth = width;
        this._menuHeight = height;
        this._root.set_style(`width: ${width}px; height: ${height}px;`);
    }
}
