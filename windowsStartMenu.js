// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {showScreenshotUI} from 'resource:///org/gnome/shell/ui/screenshot.js';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelArrowSide, syncMenuArrowSide} from './panelPosition.js';
import {StartMenuAppMenu} from './startMenuAppMenu.js';
import {StartMenuPinnedDragController} from './startMenuPinnedDragController.js';
import {StartMenuSearchController} from './startMenuSearchController.js';

const GRID_COLUMNS = 6;
const APP_TILE_WIDTH = 88;
const MAX_RECOMMENDED_APPS = 6;
const APP_TOOLTIP_DELAY = 500;
const APP_TOOLTIP_SHOW_TIME = 120;
const APP_TOOLTIP_HIDE_TIME = 100;
const PASSIVE_SEARCH_CLASS =
    'simple-taskbar-windows-start-search-passive';
const APP_CATEGORIES = [
    {
        id: 'internet',
        label: () => _('Internet'),
        desktopCategories: ['Network'],
    },
    {
        id: 'office',
        label: () => _('Office'),
        desktopCategories: ['Office'],
    },
    {
        id: 'development',
        label: () => _('Development'),
        desktopCategories: ['Development'],
    },
    {
        id: 'games',
        label: () => _('Games'),
        desktopCategories: ['Game'],
    },
    {
        id: 'graphics',
        label: () => _('Graphics'),
        desktopCategories: ['Graphics'],
    },
    {
        id: 'audio-video',
        label: () => _('Sound & Video'),
        desktopCategories: ['AudioVideo', 'Audio', 'Video'],
    },
    {
        id: 'education',
        label: () => _('Education'),
        desktopCategories: ['Education'],
    },
    {
        id: 'science',
        label: () => _('Science'),
        desktopCategories: ['Science'],
    },
    {
        id: 'system',
        label: () => _('System'),
        desktopCategories: ['System', 'Settings'],
    },
    {
        id: 'utilities',
        label: () => _('Utilities'),
        desktopCategories: ['Utility'],
    },
];

export class WindowsStartMenu {
    constructor(sourceActor, settings, params = {}) {
        this._sourceActor = sourceActor;
        this._settings = settings;
        this._onOpenStateChanged = params.onOpenStateChanged;
        this._onSourceContextMenu = params.onSourceContextMenu;
        this._powerGIcon = params.powerGIcon;
        this._appSystem = Shell.AppSystem.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._searchController = new StartMenuSearchController();
        this._pinnedDragController = new StartMenuPinnedDragController(
            settings,
            {
                columns: GRID_COLUMNS,
                tileWidth: APP_TILE_WIDTH,
                closeContextMenu: () => this._destroyAppContextMenu(),
                onOrderChanged: appIds => {
                    this._pinnedApps = appIds
                        .map(appId => this._appSystem.lookup_app(appId))
                        .filter(Boolean);
                    this._firstVisibleApp = this._pinnedApps[0] ?? null;
                },
            }
        );
        this._firstSearchResult = null;
        this._view = 'pinned';
        this._firstVisibleApp = null;
        this._sourcePressWasOpen = false;
        this._sourcePressResetId = 0;
        this._powerSourcePressWasOpen = false;
        this._powerSourcePressResetId = 0;
        this._prepareIdleId = 0;
        this._ignoreSearchChanged = false;
        this._appliedTheme = null;
        this._pinnedView = null;
        this._pinnedSignature = null;
        this._pinnedApps = [];
        this._selectedAppCategory = 'all';
        this._menuWidth = 0;
        this._menuHeight = 0;
        this._systemActions = SystemActions.getDefault();
        this._powerMenu = null;
        this._powerMenuManager = null;
        this._powerActionIdleId = 0;
        this._appContextMenu = null;
        this._appContextMenuManager = null;
        this._appContextMenuCursor = new St.Widget({
            width: 1,
            height: 1,
            opacity: 0,
            reactive: false,
        });
        Main.uiGroup.add_child(this._appContextMenuCursor);
        this._appActionCloseIdleId = 0;
        this._appTooltipTimeoutId = 0;
        this._appTooltipSource = null;
        this._menu = new PopupMenu.PopupMenu(
            sourceActor,
            0.5,
            panelArrowSide(settings)
        );
        this._menu.actor.add_style_class_name('simple-taskbar-windows-start-menu');
        this._menu.actor.hide();
        Main.uiGroup.add_child(this._menu.actor);

        this._appTooltip = new St.Label({
            style_class: 'dash-label simple-taskbar-windows-start-tooltip',
            reactive: false,
            opacity: 0,
        });
        this._appTooltip.clutter_text.set({
            ellipsize: Pango.EllipsizeMode.NONE,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
        });
        this._appTooltip.hide();
        global.stage.add_child(this._appTooltip);
        this.syncTheme();

        this._menuManager = params.menuManager ??
            new PopupMenu.PopupMenuManager(sourceActor);
        this._menuManager.addMenu(this._menu);
        // PopupMenuManager closes this menu before a source-button press is
        // dispatched to the button. Run the context-menu handoff after the
        // manager's captured-event handler so the same right click can open
        // the Start settings menu.
        this._menu.actor.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
                event.get_button() !== Clutter.BUTTON_SECONDARY)
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
        this._categorySidebar = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-categories',
            orientation: Clutter.Orientation.VERTICAL,
            y_expand: true,
            visible: false,
        });
        this._body = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-body',
            x_expand: true,
            y_expand: true,
        });
        this._body.add_child(this._categorySidebar);
        this._body.add_child(this._scrollView);
        this._root.add_child(this._body);

        this._createFooter();
        this._showDefaultView();
        this._updateSize();
        this.syncTheme(true);
        this._prepareHiddenMenu();

        this._menu.connect('open-state-changed', (_menu, open) => {
            if (!open) {
                this._hideAppTooltip(true);
                this._destroyAppContextMenu();
                this._destroyPowerMenu();
            }
            this._onOpenStateChanged(open);
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
                const insidePowerSource = target && this._powerButton &&
                    (target === this._powerButton ||
                        this._powerButton.contains(target));

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
                } else if ((isButtonPress || isTouchBegin) &&
                    insidePowerSource && this._powerMenu) {
                    this._powerSourcePressWasOpen = true;
                    if (this._powerSourcePressResetId)
                        GLib.Source.remove(this._powerSourcePressResetId);
                    this._powerSourcePressResetId = GLib.idle_add(
                        GLib.PRIORITY_DEFAULT_IDLE,
                        () => {
                            this._powerSourcePressResetId = 0;
                            this._powerSourcePressWasOpen = false;
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
        this._setSearchText('');
        this._searchEntry.add_style_class_name(PASSIVE_SEARCH_CLASS);
        this._showDefaultView();
        this._scrollView.vadjustment.value = 0;
        this._updateSize();
        syncMenuArrowSide(this._menu, this._settings);
        this._syncPositionSource();
        this._menu.open(BoxPointer.PopupAnimation.FULL);
        this._syncPositionSource();
        if (this.isOpen) {
            this._searchEntry.grab_key_focus();
            this._searchEntry.clutter_text.set_cursor_visible(false);
        }
    }

    close(animation = BoxPointer.PopupAnimation.FULL) {
        this._sourcePressWasOpen = false;
        this._searchController.cancel();
        this._destroyAppContextMenu();
        this._destroyPowerMenu();
        this._menu.close(animation);
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

    refreshDefaultView() {
        this._setSearchText('');
        this._setSearchFocusVisible(false);
        this._showDefaultView();
        this._scrollView.vadjustment.value = 0;
        this._updateSize();
        if (this.isOpen) {
            this._searchEntry.grab_key_focus();
            this._searchEntry.clutter_text.set_cursor_visible(false);
        } else {
            this._queuePrepare();
        }
    }

    syncTheme(force = false) {
        const theme = this._effectiveTheme();
        const changed = force || theme !== this._appliedTheme;
        if (changed) {
            this._applyThemeClass(this._menu?.actor, theme);
            this._applyThemeClass(this._appTooltip, theme);
            this._syncShellButtonClasses(this._root);
            this._appliedTheme = theme;
            this._queuePrepare();
        }
        this._applyThemeClass(this._appContextMenu?.actor, theme);
        this._applyThemeClass(this._powerMenu?.actor, theme);
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

    _syncPositionSource() {
        const centerOnMonitor =
            this._settings.get_boolean('start-menu-monitor-centered') &&
            this._startButtonIsCentered();
        const monitor = this._getSourceMonitor();
        const sourceActor = centerOnMonitor && monitor
            ? Main.layoutManager.dummyCursor
            : this._sourceActor;

        if (centerOnMonitor && monitor) {
            const [, sourceY] =
                this._sourceActor.get_transformed_position();
            const [, sourceHeight] =
                this._sourceActor.get_transformed_size();
            Main.layoutManager.setDummyCursorGeometry(
                Math.round(monitor.x + monitor.width / 2),
                Math.round(sourceY),
                1,
                Math.max(1, Math.round(sourceHeight))
            );
        }

        this._menu.sourceActor = sourceActor;
        this._menu.focusActor = sourceActor;
        this._menu._arrowAlignment = 0.5;
        this._menu._boxPointer.setSourceAlignment(0.5);
        this._menu._boxPointer.setPosition(sourceActor, 0.5);
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
        for (const child of actor.get_children())
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
        if (this._powerSourcePressResetId) {
            GLib.Source.remove(this._powerSourcePressResetId);
            this._powerSourcePressResetId = 0;
        }
        if (this._prepareIdleId) {
            GLib.Source.remove(this._prepareIdleId);
            this._prepareIdleId = 0;
        }
        if (this._appActionCloseIdleId) {
            GLib.Source.remove(this._appActionCloseIdleId);
            this._appActionCloseIdleId = 0;
        }
        if (this._powerActionIdleId) {
            GLib.Source.remove(this._powerActionIdleId);
            this._powerActionIdleId = 0;
        }
        if (this._stageCapturedEventId) {
            global.stage.disconnect(this._stageCapturedEventId);
            this._stageCapturedEventId = 0;
        }
        this._searchClearIcon.destroy();
        this._searchClearIcon = null;
        this._pinnedView?.destroy();
        this._pinnedView = null;
        this._pinnedDragController.destroy();
        this._pinnedDragController = null;
        this._pinnedApps = null;
        this._selectedAppCategory = null;
        this._pinnedSignature = null;
        this._searchController.destroy();
        this._searchController = null;
        this._hideAppTooltip(true);
        this._destroyAppContextMenu();
        this._appContextMenuCursor.destroy();
        this._appContextMenuCursor = null;
        this._destroyPowerMenu();
        this._menu.destroy();
        this._menu = null;
        this._appTooltip.destroy();
        this._appTooltip = null;
        this._categorySidebar = null;
        this._body = null;
        this._sourceActor = null;
        this._powerButton = null;
        this._powerGIcon = null;
        this._settings = null;
        this._onSourceContextMenu = null;
        this._firstSearchResult = null;
        this._appSystem = null;
        this._favorites = null;
        this._systemActions = null;
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
        this._searchEntry.connect('captured-event', (_actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS ||
                event.type() === Clutter.EventType.TOUCH_BEGIN) {
                this._setSearchFocusVisible(true);
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._searchEntry.clutter_text.connect('text-changed', () => {
            const text = this._searchEntry.get_text();
            const query = text.trim();
            this._searchEntry.set_secondary_icon(
                query ? this._searchClearIcon : null
            );
            if (this._ignoreSearchChanged)
                return;
            this._setSearchFocusVisible(Boolean(text));
            if (query)
                this._showSearchResults(query);
            else if (this._view === 'all')
                this._showAllApps();
            else
                this._showPinnedApps();
        });
        this._searchEntry.clutter_text.connect('key-press-event', (_actor, event) => {
            const navigationResult = this._onKeyNavigation(event);
            if (navigationResult === Clutter.EVENT_STOP)
                return navigationResult;

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
            pointerActivated => {
                this._view = 'all';
                this._setSearchText('');
                this._showAllApps();
                this._focusAfterViewChange(pointerActivated);
            }
        );
        this._backButton = this._createTextButton(
            _('Back'),
            'go-previous-symbolic',
            pointerActivated => {
                this._setSearchText('');
                this._setSearchFocusVisible(false);
                this._showDefaultView();
                this._focusAfterViewChange(pointerActivated);
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
        let pointerActivated = false;
        button.connect('button-press-event', () => {
            pointerActivated = true;
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('touch-event', (_actor, event) => {
            if (event.type() === Clutter.EventType.TOUCH_BEGIN)
                pointerActivated = true;
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('key-press-event', () => {
            pointerActivated = false;
            return Clutter.EVENT_PROPAGATE;
        });
        this._enableKeyNavigation(button);
        button.connect('clicked', () => {
            const activatedWithPointer = pointerActivated;
            pointerActivated = false;
            callback(activatedWithPointer);
        });
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
            translation_y: -1,
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
        this._enableKeyNavigation(userButton);
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
        this._powerButton = this._createIconButton(
            this._powerGIcon,
            _('Power Options'),
            () => this._togglePowerMenu(),
            {
                iconStyleClass:
                    'simple-taskbar-windows-start-power-icon',
            }
        );
        this._footer.add_child(userButton);
        this._footer.add_child(settingsButton);
        this._footer.add_child(this._powerButton);
        this._root.add_child(this._footer);
        this.syncPowerOptions();
    }

    syncPowerOptions() {
        const enabled = this._settings.get_boolean(
            'start-menu-power-options-enabled'
        );
        this._powerButton.visible = enabled;
        if (!enabled)
            this._destroyPowerMenu();
    }

    _togglePowerMenu() {
        if (this._powerSourcePressWasOpen) {
            this._powerSourcePressWasOpen = false;
            this._destroyPowerMenu();
            return;
        }

        if (this._powerMenu) {
            this._destroyPowerMenu();
            return;
        }

        this._openPowerMenu();
    }

    _openPowerMenu() {
        this._destroyPowerMenu();

        const menu = new PopupMenu.PopupMenu(
            this._powerButton,
            0.5,
            panelArrowSide(this._settings)
        );
        const menuManager = new PopupMenu.PopupMenuManager(this._powerButton);

        menu.actor.add_style_class_name('simple-taskbar-windows-start-context');
        this._applyThemeClass(menu.actor);
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        menuManager.addMenu(menu);

        const powerItems = [];
        powerItems.push(this._addPowerAction(
            menu,
            _('Suspend'),
            'canSuspend',
            'notify::can-suspend',
            () => this._systemActions.activateSuspend()
        ));
        powerItems.push(this._addPowerAction(
            menu,
            _('Restart…'),
            'canRestart',
            'notify::can-restart',
            () => this._systemActions.activateRestart()
        ));
        powerItems.push(this._addPowerAction(
            menu,
            _('Power Off…'),
            'canPowerOff',
            'notify::can-power-off',
            () => this._systemActions.activatePowerOff()
        ));
        const separator = new PopupMenu.PopupSeparatorMenuItem();
        menu.addMenuItem(separator);
        const sessionItems = [];
        sessionItems.push(this._addPowerAction(
            menu,
            _('Lock Screen'),
            'canLockScreen',
            'notify::can-lock-screen',
            () => this._systemActions.activateLockScreen()
        ));
        sessionItems.push(this._addPowerAction(
            menu,
            _('Log Out…'),
            'canLogout',
            'notify::can-logout',
            () => this._systemActions.activateLogout()
        ));
        sessionItems.push(this._addPowerAction(
            menu,
            _('Switch User…'),
            'canSwitchUser',
            'notify::can-switch-user',
            () => this._systemActions.activateSwitchUser()
        ));
        const syncSeparator = () => {
            separator.visible =
                powerItems.some(item => item.visible) &&
                sessionItems.some(item => item.visible);
        };
        for (const item of [...powerItems, ...sessionItems])
            item.connectObject('notify::visible', syncSeparator, menu.actor);
        syncSeparator();

        this._powerMenu = menu;
        this._powerMenuManager = menuManager;
        menu.connect('menu-closed', () => {
            if (this._powerMenu !== menu)
                return;
            this._powerMenu = null;
            this._powerMenuManager = null;
            menu.destroy();
        });

        this._systemActions.forceUpdate();
        menu.open(BoxPointer.PopupAnimation.FULL);
    }

    _addPowerAction(menu, label, property, signal, activate) {
        const item = menu.addAction(
            label,
            () => this._queuePowerAction(activate)
        );
        const syncVisibility = () => {
            item.visible = this._systemActions[property];
        };
        this._systemActions.connectObject(signal, syncVisibility, menu.actor);
        syncVisibility();
        return item;
    }

    _queuePowerAction(activate) {
        if (this._powerActionIdleId)
            return;

        this._powerActionIdleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._powerActionIdleId = 0;
                this.close();
                activate();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _destroyPowerMenu() {
        const menu = this._powerMenu;
        this._powerMenu = null;
        this._powerMenuManager = null;
        menu?.destroy();
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

    _createIconButton(iconSource, accessibleName, callback, params = {}) {
        const iconProperty = typeof iconSource === 'string'
            ? {icon_name: iconSource}
            : {gicon: iconSource};
        const icon = new St.Icon({
            ...iconProperty,
            style_class: params.iconStyleClass ?? null,
            icon_size: params.iconSize ?? 18,
        });
        const button = new St.Button({
            style_class: 'simple-taskbar-windows-start-icon-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: accessibleName,
            child: new St.Bin({
                width: 20,
                height: 20,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                child: icon,
            }),
        });
        this._enableKeyNavigation(button);
        button.connect('clicked', callback);
        this._syncShellButtonClasses(button);
        return button;
    }

    _showPinnedApps() {
        this._searchController.cancel();
        this._setCategorySidebarVisible(false);
        this._setScrollbarPolicy(true, false);
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

    _showDefaultView() {
        if (this._settings.get_boolean('start-menu-open-all-apps'))
            this._showAllApps();
        else
            this._showPinnedApps();
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
        this._setScrollbarPolicy(true);
        this._view = 'all';
        this._headerTitle.text = _('All apps');
        this._allAppsButton.hide();
        this._backButton.visible =
            !this._settings.get_boolean('start-menu-open-all-apps');
        const apps = this._allApps();
        if (this._settings.get_boolean('start-menu-app-categories')) {
            this._selectedAppCategory = 'all';
            const groupedApps = this._groupAppsByCategory(apps);
            this._buildCategorySidebar(apps, groupedApps);
            this._setCategorySidebarVisible(true);
            this._displayAppList(apps, true);
        } else {
            this._setCategorySidebarVisible(false);
            this._displayAppList(apps);
        }
    }

    _showSearchResults(query) {
        this._setCategorySidebarVisible(false);
        this._setScrollbarPolicy(false);
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

    _setScrollbarPolicy(visible, resetScroll = visible) {
        this._scrollView.set_overlay_scrollbars(!visible);
        this._scrollView.set_policy(
            St.PolicyType.NEVER,
            visible ? St.PolicyType.AUTOMATIC : St.PolicyType.EXTERNAL
        );
        if (resetScroll)
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

    _displayAppList(apps, categorized = false) {
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
            list.add_child(this._createAppListButton(app, false, categorized));
        this._content.add_child(list);
    }

    _groupAppsByCategory(apps) {
        const groupedApps = new Map([
            ...APP_CATEGORIES.map(category => [category.id, []]),
            ['other', []],
        ]);
        for (const app of apps)
            groupedApps.get(this._categoryForApp(app)).push(app);
        return groupedApps;
    }

    _categoryForApp(app) {
        const categories = new Set(
            (app.get_app_info().get_categories() ?? '')
                .split(';')
                .filter(Boolean)
        );
        for (const category of APP_CATEGORIES) {
            if (category.desktopCategories.some(name =>
                categories.has(name)
            )) {
                return category.id;
            }
        }
        return 'other';
    }

    _buildCategorySidebar(allApps, groupedApps) {
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
            this._enableKeyNavigation(button);
            button.connect('clicked', () => {
                this._selectedAppCategory = category.id;
                for (const child of this._categorySidebar.get_children()) {
                    child.checked =
                        child._startMenuCategoryId === category.id;
                }
                this._scrollView.vadjustment.value = 0;
                this._displayAppList(category.apps, true);
            });
            this._syncShellButtonClasses(button);
            this._categorySidebar.add_child(button);
        }
    }

    _setCategorySidebarVisible(visible) {
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

    _clearContent() {
        this._hideAppTooltip(true);
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
        this._pinnedDragController.attachGrid(grid);
        for (let index = 0; index < apps.length; index += GRID_COLUMNS) {
            const row = new St.BoxLayout({
                style_class: 'simple-taskbar-windows-start-app-row',
                x_align: Clutter.ActorAlign.CENTER,
            });
            const rowApps = apps.slice(index, index + GRID_COLUMNS);
            for (const app of rowApps)
                row.add_child(this._createAppTile(app, grid));
            for (let empty = rowApps.length; empty < GRID_COLUMNS; empty++)
                row.add_child(new St.Widget({width: APP_TILE_WIDTH}));
            grid.add_child(row);
        }
        return grid;
    }

    _createAppTile(app, pinnedGrid = null) {
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-tile-content',
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
        });
        const icon = app.create_icon_texture(32);
        content.add_child(icon);
        const label = this._createAppLabel(app.get_name(), 78);
        label.add_style_class_name('simple-taskbar-windows-start-app-tile-label');
        label.x_align = Clutter.ActorAlign.CENTER;
        label.clutter_text.set({
            ellipsize: Pango.EllipsizeMode.END,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
        });
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
        this._enableKeyNavigation(button);
        this._addAppTooltip(button, app, label);
        button.connect('clicked', () => this._launchApp(app));
        this._addAppContextMenuHandler(button, app);
        if (pinnedGrid) {
            this._pinnedDragController.makeDraggable(
                button,
                icon,
                app,
                pinnedGrid
            );
        }
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

    _createAppListButton(app, compact = false, categorized = false) {
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-list-content',
            x_expand: true,
        });
        const icon = app.create_icon_texture(compact ? 28 : 30);
        content.add_child(icon);
        const label = this._createAppLabel(
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
        this._enableKeyNavigation(button);
        this._addAppTooltip(button, app, label, !compact);
        button.connect('clicked', () => this._launchApp(app));
        this._addAppContextMenuHandler(button, app);
        if (!compact) {
            this._pinnedDragController.makeTaskbarDraggable(
                button,
                icon,
                app,
                () => this.close()
            );
        }
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
        this._enableKeyNavigation(button);
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

        let icon = result.meta.createIcon(30);
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

            const [x, y] = event.get_coords();
            this._openAppContextMenu(button, app, {x, y});
            return Clutter.EVENT_STOP;
        });
        button.connect('popup-menu', () => {
            this._openAppContextMenu(button, app);
            return Clutter.EVENT_STOP;
        });
    }

    _openAppContextMenu(sourceButton, app, cursorPosition = null) {
        this._hideAppTooltip(true);
        this._destroyAppContextMenu();

        let menuSource = sourceButton;
        if (cursorPosition && this._appContextMenuCursor) {
            this._appContextMenuCursor.set_position(
                Math.round(cursorPosition.x),
                Math.round(cursorPosition.y)
            );
            menuSource = this._appContextMenuCursor;
        }

        const menu = new StartMenuAppMenu(
            menuSource,
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
            if (refreshAfterClose && this._view === 'pinned' &&
                !this._searchEntry.get_text().trim()) {
                this.refresh();
            }
        });
        menu.open(BoxPointer.PopupAnimation.FULL);
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

    _addAppTooltip(button, app, label, alignLeft = false) {
        button.connect('notify::hover', () => {
            if (button.hover)
                this._queueAppTooltip(button, app, label, alignLeft);
            else if (this._appTooltipSource === button)
                this._hideAppTooltip();
        });
        button.connect('destroy', () => {
            if (this._appTooltipSource === button)
                this._hideAppTooltip(true);
        });
    }

    _queueAppTooltip(button, app, label, alignLeft) {
        this._hideAppTooltip(true);
        this._appTooltipSource = button;
        this._appTooltipTimeoutId = GLib.timeout_add_once(
            GLib.PRIORITY_DEFAULT,
            APP_TOOLTIP_DELAY,
            () => {
                this._appTooltipTimeoutId = 0;
                if (this._appTooltipSource !== button || !button.hover)
                    return;
                this._showAppTooltip(button, app, label, alignLeft);
            }
        );
    }

    _showAppTooltip(button, app, label, alignLeft) {
        const description = app.get_description()?.trim() ?? '';
        const ellipsized = label.clutter_text.get_layout().is_ellipsized();
        if (!ellipsized && !description) {
            this._appTooltipSource = null;
            return;
        }

        if (ellipsized) {
            this._appTooltip.text = '';
            const titleMarkup = GLib.markup_escape_text(app.get_name(), -1);
            const descriptionMarkup =
                GLib.markup_escape_text(description, -1);
            this._appTooltip.clutter_text.set_markup(
                description
                    ? `<b>${titleMarkup}</b>\n${descriptionMarkup}`
                    : `<b>${titleMarkup}</b>`
            );
        } else {
            this._appTooltip.text = description;
        }
        this._appTooltip.opacity = 0;
        this._appTooltip.show();

        const [buttonX, buttonY] = button.get_transformed_position();
        const [buttonWidth, buttonHeight] = button.get_transformed_size();
        const tooltipWidth = this._appTooltip.width;
        const tooltipHeight = this._appTooltip.height;
        const monitor = Main.layoutManager.findMonitorForActor(button) ??
            Main.layoutManager.primaryMonitor;
        const gap = 6;
        const minX = monitor.x + gap;
        const maxX = monitor.x + monitor.width - tooltipWidth - gap;
        const [labelX] = label.get_transformed_position();
        const desiredX = alignLeft
            ? labelX
            : buttonX + Math.floor((buttonWidth - tooltipWidth) / 2);
        const x = Math.clamp(
            desiredX,
            minX,
            Math.max(minX, maxX)
        );
        const belowY = buttonY + buttonHeight + gap;
        const aboveY = buttonY - tooltipHeight - gap;
        const y = belowY + tooltipHeight <= monitor.y + monitor.height - gap
            ? belowY
            : Math.max(monitor.y + gap, aboveY);

        this._appTooltip.set_position(Math.round(x), Math.round(y));
        this._appTooltip.ease({
            opacity: 255,
            duration: APP_TOOLTIP_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _hideAppTooltip(instant = false) {
        if (this._appTooltipTimeoutId) {
            GLib.Source.remove(this._appTooltipTimeoutId);
            this._appTooltipTimeoutId = 0;
        }
        this._appTooltipSource = null;
        if (!this._appTooltip.visible)
            return;

        this._appTooltip.remove_all_transitions();
        if (instant) {
            this._appTooltip.opacity = 0;
            this._appTooltip.hide();
            return;
        }

        const tooltip = this._appTooltip;
        this._appTooltip.ease({
            opacity: 0,
            duration: APP_TOOLTIP_HIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => tooltip.hide(),
        });
    }

    _allApps() {
        const apps = [];
        const seen = new Set();
        for (const appInfo of this._appSystem.get_installed()) {
            const id = appInfo.get_id();
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
        if (!this._settings.get_boolean('start-menu-recommended-apps'))
            return [];

        const pinnedIds = new Set(pinnedApps.map(app => app.get_id()));
        return Shell.AppUsage.get_default().get_most_used()
            .filter(app => {
                const appId = app.get_id();
                return this._appShouldShow(app) &&
                    !pinnedIds.has(appId) &&
                    !this._favorites.isFavorite(appId);
            })
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
        const isSystemAction = result.provider.id === 'applications' &&
            !result.id.endsWith('.desktop');
        this.close(isScreenshot
            ? BoxPointer.PopupAnimation.NONE
            : BoxPointer.PopupAnimation.FULL);
        if (isScreenshot) {
            showScreenshotUI();
            return;
        }
        if (isSystemAction) {
            SystemActions.getDefault().activateAction(result.id);
        } else if (result.provider.appInfo) {
            result.provider.activateResult(result.id, result.terms);
        } else if (result.app) {
            result.app.activate();
        }
        if (result.meta.clipboardText) {
            St.Clipboard.get_default().set_text(
                St.ClipboardType.CLIPBOARD,
                result.meta.clipboardText
            );
        }
    }

    _setSearchText(text) {
        if (this._searchEntry.get_text() === text)
            return;

        this._ignoreSearchChanged = true;
        this._searchEntry.set_text(text);
        this._ignoreSearchChanged = false;
    }

    _setSearchFocusVisible(visible) {
        if (visible)
            this._searchEntry.remove_style_class_name(PASSIVE_SEARCH_CLASS);
        else
            this._searchEntry.add_style_class_name(PASSIVE_SEARCH_CLASS);
        this._searchEntry.clutter_text.set_cursor_visible(visible);
    }

    _onKeyNavigation(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;

        const symbol = event.get_key_symbol();
        const actors = this._focusableActors();
        if (actors.length === 0)
            return Clutter.EVENT_PROPAGATE;

        const focus = global.stage.get_key_focus();
        const current = focus
            ? actors.find(actor =>
                actor === focus || actor.contains(focus)
            ) ?? null
            : null;
        let target = null;
        if (symbol === Clutter.KEY_Tab) {
            target = this._nextFocusableActor(actors, current, 1);
        } else if (symbol === Clutter.KEY_ISO_Left_Tab) {
            target = this._nextFocusableActor(actors, current, -1);
        } else if (symbol === Clutter.KEY_Down) {
            target = this._spatialFocusableActor(actors, current, 0, 1);
        } else if (symbol === Clutter.KEY_Up) {
            target = this._spatialFocusableActor(actors, current, 0, -1);
        } else if (current !== this._searchEntry) {
            if (symbol === Clutter.KEY_Left)
                target = this._spatialFocusableActor(actors, current, -1, 0);
            else if (symbol === Clutter.KEY_Right)
                target = this._spatialFocusableActor(actors, current, 1, 0);
        }

        if (!target)
            return Clutter.EVENT_PROPAGATE;

        target.grab_key_focus();
        if (target === this._searchEntry)
            this._setSearchFocusVisible(true);
        else if (!this._searchEntry.get_text())
            this._setSearchFocusVisible(false);
        this._ensureFocusedActorVisible();
        return Clutter.EVENT_STOP;
    }

    _enableKeyNavigation(actor) {
        actor.connect('key-press-event', (_actor, event) =>
            this._onKeyNavigation(event)
        );
    }

    _focusableActors() {
        return this._focusableActorsIn(this._root);
    }

    _focusableActorsIn(root) {
        const actors = [];
        const collect = actor => {
            const focusable = actor === this._searchEntry ||
                actor instanceof St.Button;
            if (focusable && actor.can_focus && actor.reactive && actor.mapped)
                actors.push(actor);
            for (const child of actor.get_children())
                collect(child);
        };
        collect(root);
        return actors;
    }

    _focusFirstViewControl() {
        let target = null;
        if (this._categorySidebar.visible) {
            target = this._focusableActorsIn(this._categorySidebar)[0] ??
                null;
        }
        if (!target)
            target = this._focusableActorsIn(this._content)[0] ?? null;
        if (!target) {
            target = this._view === 'all'
                ? this._backButton.visible
                    ? this._backButton
                    : this._searchEntry
                : this._allAppsButton;
        }

        target.grab_key_focus();
        this._ensureFocusedActorVisible();
    }

    _focusAfterViewChange(pointerActivated) {
        if (!pointerActivated) {
            this._focusFirstViewControl();
            return;
        }

        this._searchEntry.grab_key_focus();
        this._setSearchFocusVisible(false);
    }

    _nextFocusableActor(actors, current, step) {
        const currentIndex = actors.indexOf(current);
        const nextIndex = currentIndex < 0
            ? step > 0 ? 0 : actors.length - 1
            : (currentIndex + step + actors.length) % actors.length;
        return actors[nextIndex];
    }

    _spatialFocusableActor(actors, current, horizontal, vertical) {
        if (!current)
            return actors[0];

        const [currentX, currentY] = current.get_transformed_position();
        const [currentWidth, currentHeight] = current.get_transformed_size();
        const centerX = currentX + currentWidth / 2;
        const centerY = currentY + currentHeight / 2;
        let closest = null;
        let closestScore = Number.POSITIVE_INFINITY;
        for (const actor of actors) {
            if (actor === current)
                continue;

            const [actorX, actorY] = actor.get_transformed_position();
            const [actorWidth, actorHeight] = actor.get_transformed_size();
            const deltaX = actorX + actorWidth / 2 - centerX;
            const deltaY = actorY + actorHeight / 2 - centerY;
            const primary = horizontal !== 0
                ? deltaX * horizontal
                : deltaY * vertical;
            if (primary <= 0)
                continue;

            const secondary = horizontal !== 0
                ? Math.abs(deltaY)
                : Math.abs(deltaX);
            const score = primary * 4 + secondary;
            if (score < closestScore) {
                closest = actor;
                closestScore = score;
            }
        }
        return closest;
    }

    _ensureFocusedActorVisible() {
        const focus = global.stage.get_key_focus();
        if (!focus || !this._content.contains(focus))
            return;

        const [, focusY] = focus.get_transformed_position();
        const [, focusHeight] = focus.get_transformed_size();
        const [, viewY] = this._scrollView.get_transformed_position();
        const [, viewHeight] = this._scrollView.get_transformed_size();
        const adjustment = this._scrollView.vadjustment;
        if (focusY < viewY) {
            adjustment.value -= viewY - focusY;
        } else if (focusY + focusHeight > viewY + viewHeight) {
            adjustment.value +=
                focusY + focusHeight - viewY - viewHeight;
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
        this._resolveThemeNodes(this._menu.actor);
        this._menu.actor.get_preferred_size();
        this._root.get_preferred_size();
        this._menu._boxPointer.setPosition(
            this._sourceActor,
            this._menu._arrowAlignment
        );
    }

    _resolveThemeNodes(actor) {
        if (actor instanceof St.Widget)
            actor.get_theme_node();
        for (const child of actor.get_children())
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
