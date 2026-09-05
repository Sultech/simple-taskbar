// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {showScreenshotUI} from 'resource:///org/gnome/shell/ui/screenshot.js';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    panelArrowSide,
    panelIsVertical,
    syncMenuArrowSide,
} from '../panel/panelPosition.js';
import {panelGeometry} from '../panel/panelGeometry.js';
import {
    closePopupMenu,
    openPopupMenu,
} from '../shared/popupMenuUtils.js';
import {StartMenuContextMenuController} from './startMenuContextMenuController.js';
import {StartMenuCategorySidebar} from './startMenuCategorySidebar.js';
import {StartMenuFooterController} from './startMenuFooterController.js';
import {StartMenuNavigationController} from './startMenuNavigationController.js';
import {StartMenuPinnedDragController} from './startMenuPinnedDragController.js';
import {StartMenuPinnedModel} from './startMenuPinnedModel.js';
import {StartMenuPinnedViewBuilder} from './startMenuPinnedView.js';
import {StartMenuListViewBuilder} from './startMenuListView.js';
import {
    StartMenuRunningIndicatorController,
} from './startMenuRunningIndicatorController.js';
import {
    animateStartMenuItemIn,
    animateStartMenuItemsIn,
    animateStartMenuItemOut,
    animateStartMenuContentView,
    animateStartMenuLaunch,
    resetStartMenuContentTransition,
} from './startMenuItemAnimations.js';
import {StartMenuPowerController} from './startMenuPowerController.js';
import {StartMenuSearchController} from './startMenuSearchController.js';
import {StartMenuTooltipController} from './startMenuTooltipController.js';
import {SourcePressGuard} from './sourcePressGuard.js';
import {
    panelUsesLightTheme,
    shellMenusUseLightTheme,
} from '../themeUtils.js';
import {panelTransparencyOpacity} from '../transparencyUtils.js';
import {
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from '../shared/blurMyShellUtils.js';
import {
    getPanelBlur,
    getPopupBlur,
} from '../integration/blurMyShellRuntime.js';
import {
    appShouldShow,
    getAllApps,
    getRecommendedApps,
    groupAppsByCategory,
} from './startMenuAppModel.js';

const GRID_COLUMNS = 6;
const APP_TILE_WIDTH = 88;
const MENU_MIN_HEIGHT = 420;
const MENU_BASE_HEIGHT = 610;
const MENU_MAX_HEIGHT = 810;
const MENU_MONITOR_MARGIN = 96;
const BLURRED_CLASS =
    'simple-taskbar-windows-start-blurred';
const PASSIVE_SEARCH_CLASS =
    'simple-taskbar-windows-start-search-passive';
const BLUR_MY_SHELL_POPUP_CLASSES = [
    'bms-popup-background-transparent',
    'bms-popup-background-light',
    'bms-popup-background-dark',
];

export class StartMenuController {
    constructor(sourceActor, settings, params = {}) {
        this._sourceActor = sourceActor;
        this._settings = settings;
        this._onOpenStateChanged = params.onOpenStateChanged;
        this._onSourceContextMenu = params.onSourceContextMenu;
        this._powerGIcon = params.powerGIcon;
        this._settingsGIcon = params.settingsGIcon;
        this._appSystem = Shell.AppSystem.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._pinnedModel = new StartMenuPinnedModel(settings);
        this._runningIndicatorController =
            new StartMenuRunningIndicatorController(
                settings,
                params.getInterestingWindows
            );
        const defaultFolderName = _('Folder');
        this._searchController = new StartMenuSearchController();
        this._tooltipController = new StartMenuTooltipController();
        this._contextMenuController = new StartMenuContextMenuController(
            settings,
            {
                applyTheme: actor => this._applyThemeClass(actor),
                closeApp: params.closeApp,
                closeMenu: () => this.close(),
                getInterestingWindows: params.getInterestingWindows,
                hideTooltip: instant =>
                    this._tooltipController.hide(instant),
                pinnedModel: this._pinnedModel,
                defaultFolderName,
                removeFolderLabel: _('Remove folder'),
                refreshAfterPinChange: change =>
                    this._animatePinnedMutation(change),
            }
        );
        this._powerController = new StartMenuPowerController(settings, {
            closeMenu: () => this.close(),
            applyTheme: actor => this._applyThemeClass(actor),
        });
        this._pinnedDragController = new StartMenuPinnedDragController(
            this._pinnedModel,
            {
                columns: GRID_COLUMNS,
                tileWidth: APP_TILE_WIDTH,
                closeContextMenu: () => this._contextMenuController.close(),
                defaultFolderName,
                onChanged: change => {
                    if (change)
                        this._animatePinnedMutation(change);
                    else
                        this._queueRefresh();
                },
                onMoveOut: change => {
                    if (!change.folderCollapsed) {
                        this._view = 'pinned';
                        this._activeFolderId = null;
                    }
                    this._animatePinnedMutation(change);
                },
            }
        );
        this._firstSearchResult = null;
        this._view = 'pinned';
        this._firstVisibleApp = null;
        this._sourcePress = new SourcePressGuard();
        this._blurMyShellPopupSettings = getBlurMyShellChildSettings(
            getBlurMyShellSettings(),
            'popup'
        );
        this._prepareIdleId = 0;
        this._transparencySyncId = 0;
        this._menuOpenStateId = 0;
        this._ignoreSearchChanged = false;
        this._appliedTheme = null;
        this._pinnedView = null;
        this._pinnedSignature = null;
        this._pinnedApps = [];
        this._activeFolderId = null;
        this._menuWidth = 0;
        this._menuHeight = 0;
        this._menu = new PopupMenu.PopupMenu(
            sourceActor,
            0.5,
            panelArrowSide(settings)
        );
        this._menu.actor.add_style_class_name('simple-taskbar-windows-start-menu');
        this._menu.actor.hide();
        Main.uiGroup.add_child(this._menu.actor);

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
        this._navigationController = new StartMenuNavigationController({
            getActors: () => ({
                allAppsButton: this._allAppsButton,
                backButton: this._backButton,
                categorySidebar: this._categorySidebarController.actor,
                content: this._content,
                root: this._root,
                scrollView: this._scrollView,
                searchEntry: this._searchEntry,
            }),
            getView: () => this._view,
            setSearchFocusVisible: visible =>
                this._setSearchFocusVisible(visible),
        });
        this._pinnedViewBuilder = new StartMenuPinnedViewBuilder(settings, {
            columns: GRID_COLUMNS,
            tileWidth: APP_TILE_WIDTH,
            navigationController: this._navigationController,
            tooltipController: this._tooltipController,
            contextMenuController: this._contextMenuController,
            pinnedDragController: this._pinnedDragController,
            createRunningIndicator: (app, icon) =>
                this._runningIndicatorController.createIconStack(app, icon),
            launchApp: (app, actor) => this._launchApp(app, actor),
            showFolder: folderId => this._showPinnedFolder(folderId, true),
            syncButtonClasses: actor => this._syncShellButtonClasses(actor),
        });
        this._listViewBuilder = new StartMenuListViewBuilder({
            navigationController: this._navigationController,
            tooltipController: this._tooltipController,
            contextMenuController: this._contextMenuController,
            pinnedDragController: this._pinnedDragController,
            runningIndicatorController: this._runningIndicatorController,
            launchApp: (app, actor) => this._launchApp(app, actor),
            activateSearchResult: (result, actor) =>
                this._activateSearchResult(result, actor),
            syncButtonClasses: actor => this._syncShellButtonClasses(actor),
            closeMenu: () => this.close(),
        });

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
        this._body = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-body',
            x_expand: true,
            y_expand: true,
        });
        this._categorySidebarController = new StartMenuCategorySidebar({
            body: this._body,
            scrollView: this._scrollView,
            navigationController: this._navigationController,
            syncButtonClasses: actor => this._syncShellButtonClasses(actor),
            displayAppList: (apps, categorized) =>
                this._displayAppList(apps, categorized),
        });
        this._body.add_child(this._scrollView);
        this._root.add_child(this._body);

        this._footerController = new StartMenuFooterController({
            appSystem: this._appSystem,
            powerController: this._powerController,
            powerGIcon: this._powerGIcon,
            settings,
            settingsGIcon: this._settingsGIcon,
            closeMenu: () => this.close(),
            enableNavigation: actor =>
                this._navigationController.enable(actor),
            syncButtonClasses: actor =>
                this._syncShellButtonClasses(actor),
            onLocationsChanged: () => this._updateSize(),
        });
        this._root.add_child(this._footerController.actor);
        this._showDefaultView();
        this._updateSize();
        this.syncTheme(true);
        this._prepareHiddenMenu();

        this._refreshIdleId = 0;
        this._installedChangedId = this._appSystem.connect(
            'installed-changed',
            () => this._queueRefresh()
        );

        this._menuOpenStateId = this._menu.connect(
            'open-state-changed',
            (_menu, open) => {
                if (open) {
                    this._updateSize();
                } else {
                    this._tooltipController.hide(true);
                    this._contextMenuController.close();
                    this._powerController.close();
                }
                this._onOpenStateChanged(open);
            }
        );

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
                const powerButton = this._powerController.button;
                const insidePowerSource = target && powerButton &&
                    (target === powerButton || powerButton.contains(target));

                if ((isButtonPress || isTouchBegin) && insideSource) {
                    this._sourcePress.mark();
                } else if ((isButtonPress || isTouchBegin) &&
                    insidePowerSource && this._powerController.isOpen) {
                    this._powerController.markSourcePress();
                }
                return Clutter.EVENT_PROPAGATE;
            }
        );
    }

    get isOpen() {
        return this._menu.isOpen;
    }

    toggle() {
        if (this._sourcePress.consume()) {
            this.close();
            return;
        }

        if (this.isOpen)
            this.close();
        else
            this.open();
    }

    open() {
        this._sourcePress.clear();
        this._setSearchText('');
        this._searchEntry.add_style_class_name(PASSIVE_SEARCH_CLASS);
        this._showDefaultView();
        this._scrollView.vadjustment.value = 0;
        this._updateSize();
        syncMenuArrowSide(this._menu, this._settings);
        this._syncPositionSource();
        openPopupMenu(this._menu);
        const keyboardBox = Main.layoutManager.keyboardBox;
        const keyboardBoxParent = keyboardBox.get_parent();
        const stackingSibling = keyboardBoxParent === Main.uiGroup
            ? keyboardBox
            : keyboardBoxParent;
        Main.uiGroup.set_child_below_sibling(this._menu.actor, stackingSibling);
        this._syncPositionSource();
        if (this.isOpen) {
            this._searchEntry.grab_key_focus();
            this._searchEntry.clutter_text.set_cursor_visible(false);
        }
    }

    close(animate = true) {
        this._sourcePress.clear();
        this._searchController.cancel();
        this._contextMenuController.close();
        this._powerController.close();
        closePopupMenu(this._menu, animate);
    }

    refresh() {
        if (!this.isOpen)
            return;

        const query = this._searchEntry.get_text().trim();
        if (query)
            this._showSearchResults(query);
        else if (this._view === 'all')
            this._showAllApps(true);
        else if (this._view === 'folder' && this._activeFolderId)
            this._showPinnedFolder(this._activeFolderId);
        else
            this._showPinnedApps();
    }

    _queueRefresh() {
        if (this._refreshIdleId)
            return;

        this._refreshIdleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._refreshIdleId = 0;
                this.refresh();
                return GLib.SOURCE_REMOVE;
            }
        );
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
            this._applyThemeClass(this._menu.actor, theme);
            this._applyThemeClass(this._tooltipController.actor, theme);
            this._syncShellButtonClasses(this._root);
            this._appliedTheme = theme;
            this._queuePrepare();
        }
        this._contextMenuController.syncTheme();
        this._powerController.syncTheme();
        this.syncTransparency();
    }

    queueTransparencySync() {
        if (this._transparencySyncId)
            return;

        this._transparencySyncId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._transparencySyncId = 0;
                this.syncTransparency();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    syncTransparency() {
        if (this._blurMyShellBlursPopup())
            this._menu.actor.add_style_class_name(BLURRED_CLASS);
        else
            this._menu.actor.remove_style_class_name(BLURRED_CLASS);
        if (this._blurMyShellOwnsTransparency()) {
            this._menu.box.set_style(this._blurMyShellCornerStyle());
            return;
        }

        if (!this._settings.get_boolean(
            'start-menu-follow-panel-transparency'
        )) {
            this._menu.box.set_style(null);
            return;
        }

        const opacity = panelTransparencyOpacity(this._settings);
        const theme = this._effectiveTheme();
        const light = theme === 'light' ||
            (theme === 'shell' && shellMenusUseLightTheme());
        const gradientStart = light ? '249, 250, 253' : '42, 42, 47';
        const gradientEnd = light ? '230, 234, 242' : '30, 30, 34';
        this._menu.box.set_style(
            'background: transparent; ' +
            'background-gradient-direction: vertical; ' +
            `background-gradient-start: rgba(${gradientStart}, ` +
                `${opacity.toFixed(2)}); ` +
            `background-gradient-end: rgba(${gradientEnd}, ` +
                `${opacity.toFixed(2)});`
        );
    }

    _blurMyShellCornerStyle() {
        if (!getPopupBlur())
            return null;

        if (!blurMyShellHasKey(
            this._blurMyShellPopupSettings,
            'menu-corner-radius'
        ))
            return null;

        const radius = this._blurMyShellPopupSettings.get_int(
            'menu-corner-radius'
        );
        return `border-radius: ${radius}px;`;
    }

    _blurMyShellBlursPopup() {
        if (getPopupBlur())
            return true;

        return BLUR_MY_SHELL_POPUP_CLASSES.some(styleClass =>
            Main.uiGroup.has_style_class_name(styleClass)
        );
    }

    _blurMyShellOwnsTransparency() {
        return this._blurMyShellBlursPopup() || getPanelBlur();
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
        const fixedPanelPosition = monitor &&
            this._settings.get_boolean('panel-autohide-enabled');
        const useDummySource = Boolean(
            monitor && (centerOnMonitor ||
                (fixedPanelPosition && this._sourceActor.has_allocation()))
        );
        const sourceActor = useDummySource
            ? Main.layoutManager.dummyCursor
            : this._sourceActor;

        if (useDummySource) {
            const panelHeight = this._settings.get_int('panel-height');
            const vertical = panelIsVertical(this._settings);
            const geometry = panelGeometry(
                this._settings,
                monitor,
                panelHeight
            );
            let sourceX = monitor.x + monitor.width / 2;
            let sourceY = monitor.y + monitor.height / 2;
            let sourceWidth = 1;
            let sourceHeight = 1;
            if (!centerOnMonitor) {
                const [actorX, actorY] =
                    this._sourceActor.get_transformed_position();
                const [actorWidth, actorHeight] =
                    this._sourceActor.get_transformed_size();
                sourceX = actorX;
                sourceY = actorY;
                sourceWidth = Math.max(1, Math.round(actorWidth));
                sourceHeight = Math.max(1, Math.round(actorHeight));
            }
            if (vertical)
                sourceX = geometry.x;
            else
                sourceY = geometry.y;
            Main.layoutManager.setDummyCursorGeometry(
                Math.round(sourceX),
                Math.round(sourceY),
                vertical ? panelHeight : sourceWidth,
                vertical ? sourceHeight : panelHeight
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

        return panelUsesLightTheme(this._settings)
            ? 'light'
            : 'dark';
    }

    _getSourceMonitor() {
        if (!this._sourceActor.get_stage())
            return Main.layoutManager.primaryMonitor;

        return Main.layoutManager.findMonitorForActor(this._sourceActor) ??
            Main.layoutManager.primaryMonitor;
    }

    destroy() {
        this._sourcePress.destroy();
        this._sourcePress = null;
        this._blurMyShellPopupSettings = null;
        if (this._prepareIdleId) {
            GLib.Source.remove(this._prepareIdleId);
            this._prepareIdleId = 0;
        }
        if (this._transparencySyncId) {
            GLib.Source.remove(this._transparencySyncId);
            this._transparencySyncId = 0;
        }
        if (this._refreshIdleId) {
            GLib.Source.remove(this._refreshIdleId);
            this._refreshIdleId = 0;
        }
        this._content.remove_all_transitions();
        this._appSystem.disconnect(this._installedChangedId);
        this._installedChangedId = 0;
        if (this._stageCapturedEventId) {
            global.stage.disconnect(this._stageCapturedEventId);
            this._stageCapturedEventId = 0;
        }
        this._menu.disconnect(this._menuOpenStateId);
        this._menuOpenStateId = 0;
        this._searchClearIcon.destroy();
        this._searchClearIcon = null;
        this._pinnedView?.destroy();
        this._pinnedView = null;
        this._listViewBuilder.destroy();
        this._listViewBuilder = null;
        this._pinnedViewBuilder.destroy();
        this._pinnedViewBuilder = null;
        this._categorySidebarController.destroy();
        this._categorySidebarController = null;
        this._pinnedDragController.destroy();
        this._pinnedDragController = null;
        this._pinnedApps = null;
        this._activeFolderId = null;
        this._pinnedModel = null;
        this._pinnedSignature = null;
        this._searchController.destroy();
        this._searchController = null;
        this._contextMenuController.close();
        this._powerController.close();
        this._footerController.destroy();
        this._footerController = null;
        this._menu.destroy();
        this._menu = null;
        this._runningIndicatorController.destroy();
        this._runningIndicatorController = null;
        this._navigationController.destroy();
        this._navigationController = null;
        this._contextMenuController.destroy();
        this._contextMenuController = null;
        this._powerController.destroy();
        this._powerController = null;
        this._tooltipController.destroy();
        this._tooltipController = null;
        this._body = null;
        this._sourceActor = null;
        this._powerGIcon = null;
        this._settingsGIcon = null;
        this._settings = null;
        this._onSourceContextMenu = null;
        this._firstSearchResult = null;
        this._appSystem = null;
        this._favorites = null;
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
            else if (this._view === 'folder' && this._activeFolderId)
                this._showPinnedFolder(this._activeFolderId);
            else
                this._showPinnedApps();
        });
        this._searchEntry.clutter_text.connect('key-press-event', (_actor, event) => {
            const navigationResult = this._navigationController.handle(event);
            if (navigationResult === Clutter.EVENT_STOP)
                return navigationResult;

            const symbol = event.get_key_symbol();
            if (symbol !== Clutter.KEY_Return && symbol !== Clutter.KEY_KP_Enter)
                return Clutter.EVENT_PROPAGATE;

            if (this._firstSearchResult) {
                const result = this._firstSearchResult;
                const actor = result.app
                    ? this._findAppIcon(result.app)
                    : null;
                this._activateSearchResult(result, actor);
                return Clutter.EVENT_STOP;
            }
            if (this._firstVisibleApp) {
                this._launchApp(
                    this._firstVisibleApp,
                    this._findAppIcon(this._firstVisibleApp)
                );
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
                this._setSearchText('');
                this._showAllApps(
                    false,
                    true,
                    () => this._navigationController.focusAfterViewChange(
                        pointerActivated
                    )
                );
            }
        );
        this._backButton = this._createTextButton(
            _('Back'),
            'go-previous-symbolic',
            pointerActivated => {
                this._setSearchText('');
                this._setSearchFocusVisible(false);
                if (this._view === 'folder' ||
                    (this._view === 'all' &&
                    !this._settings.get_boolean('start-menu-open-all-apps'))) {
                    this._showPinnedApps(
                        true,
                        () => this._navigationController.focusAfterViewChange(
                            pointerActivated
                        )
                    );
                } else {
                    this._showDefaultView();
                    this._navigationController.focusAfterViewChange(
                        pointerActivated
                    );
                }
            }
        );
        this._backButton.hide();
        this._pinnedDragController.attachMoveOutTarget(this._backButton);
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
        this._navigationController.enable(button);
        button.connect('clicked', () => {
            const activatedWithPointer = pointerActivated;
            pointerActivated = false;
            callback(activatedWithPointer);
        });
        this._syncShellButtonClasses(button);
        return button;
    }

    syncPowerOptions() {
        this._powerController.syncVisibility();
    }

    syncUserAvatar() {
        this._footerController.syncUserAvatar();
    }

    _showPinnedApps(animate = false, onShown = null) {
        const show = () => {
            this._searchController.cancel();
            this._categorySidebarController.setVisible(false);
            this._setScrollbarPolicy(true, false);
            this._view = 'pinned';
            this._activeFolderId = null;
            this._headerTitle.text = _('Pinned');
            this._allAppsButton.show();
            this._backButton.hide();
            this._ensurePinnedView();
            this._firstVisibleApp = this._pinnedApps[0] ?? null;
            this._firstSearchResult = null;

            const children = this._content.get_children();
            if (children.length !== 1 || children[0] !== this._pinnedView) {
                this._clearContent(false);
                this._content.add_child(this._pinnedView);
            }
            this._updateSize();
            if (onShown)
                onShown();
        };
        if (animate && this.isOpen &&
            (this._view === 'folder' || this._view === 'all')) {
            animateStartMenuContentView(this._content, false, show);
            return;
        }

        resetStartMenuContentTransition(this._content);
        show();
    }

    _showDefaultView() {
        if (this._settings.get_boolean('start-menu-open-all-apps'))
            this._showAllApps();
        else
            this._showPinnedApps();
    }

    _ensurePinnedView() {
        const pinnedItems = this._resolvePinnedItems();
        const pinnedApps = pinnedItems.flatMap(item =>
            item.type === 'app' ? [item.app] : item.apps
        );
        const recommended = getRecommendedApps(
            this._settings,
            this._favorites,
            pinnedApps
        );
        const hidePinnedAppTitles = this._settings.get_boolean(
            'start-menu-hide-pinned-app-titles'
        );
        const signature = JSON.stringify({
            pinned: pinnedItems.map(item => item.type === 'app'
                ? ['app', item.app.get_id(), item.app.get_name()]
                : [
                    'folder',
                    item.id,
                    item.name,
                    item.appIds,
                    item.apps.map(app => [app.get_id(), app.get_name()]),
                ]),
            recommended: recommended.map(app => [app.get_id(), app.get_name()]),
            hidePinnedAppTitles,
        });
        if (this._pinnedView && signature === this._pinnedSignature)
            return;

        const view = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-pinned-view',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        if (pinnedItems.length > 0) {
            view.add_child(this._pinnedViewBuilder.createPinnedGrid(pinnedItems));
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
            view.add_child(
                this._listViewBuilder.createRecommendedGrid(recommended)
            );
        }

        this._pinnedView?.destroy();
        this._pinnedView = view;
        this._pinnedApps = pinnedApps;
        this._pinnedSignature = signature;
        this._queuePrepare();
    }

    _showPinnedFolder(folderId, animate = false) {
        const folderItem = this._pinnedModel.getFolder(folderId);
        if (!folderItem) {
            this._showPinnedApps();
            return;
        }

        const folder = this._resolveFolder(folderItem);
        const show = () => {
            this._searchController.cancel();
            this._categorySidebarController.setVisible(false);
            this._setScrollbarPolicy(true, false);
            this._view = 'folder';
            this._activeFolderId = folderId;
            this._headerTitle.text = folder.name;
            this._allAppsButton.hide();
            this._backButton.show();
            this._firstVisibleApp = folder.apps[0] ?? null;
            this._firstSearchResult = null;

            const view = new St.BoxLayout({
                style_class: 'simple-taskbar-windows-start-pinned-view',
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
            });
            if (folder.apps.length > 0) {
                view.add_child(this._pinnedViewBuilder.createFolderGrid(folder));
            } else {
                view.add_child(new St.Label({
                    style_class: 'simple-taskbar-windows-start-empty-pinned',
                    text: _('This folder is empty'),
                    x_align: Clutter.ActorAlign.CENTER,
                }));
            }

            this._clearContent(false);
            this._content.add_child(view);
            this._updateSize();
        };
        if (animate && this.isOpen && this._view === 'pinned') {
            animateStartMenuContentView(this._content, true, show);
            return;
        }

        resetStartMenuContentTransition(this._content);
        show();
    }

    _resolvePinnedItems() {
        const items = [];
        for (const item of this._pinnedModel.getItems()) {
            if (item.type === 'app') {
                const app = this._resolvePinnedApp(item.appId);
                if (app)
                    items.push({...item, app});
                continue;
            }

            const folder = this._resolveFolder(item);
            if (folder.apps.length > 0)
                items.push(folder);
        }
        return items;
    }

    _resolveFolder(folder) {
        return {
            ...folder,
            apps: folder.appIds
                .map(appId => this._resolvePinnedApp(appId))
                .filter(Boolean),
        };
    }

    _resolvePinnedApp(appId) {
        const app = this._appSystem.lookup_app(appId);
        return app && appShouldShow(app) ? app : null;
    }

    _showAllApps(keepCategory = false, animate = false, onShown = null) {
        const show = () => {
            this._searchController.cancel();
            this._setScrollbarPolicy(true);
            this._view = 'all';
            this._activeFolderId = null;
            this._headerTitle.text = _('All apps');
            this._allAppsButton.hide();
            this._backButton.visible =
                !this._settings.get_boolean('start-menu-open-all-apps');
            const apps = getAllApps(this._appSystem);
            if (this._settings.get_boolean('start-menu-app-categories')) {
                if (!keepCategory)
                    this._categorySidebarController.resetSelection();
                const groupedApps = groupAppsByCategory(apps);
                const selected = this._categorySidebarController
                    .buildCategorySidebar(apps, groupedApps);
                this._categorySidebarController.setVisible(true);
                this._displayAppList(selected.apps, true);
            } else {
                this._categorySidebarController.setVisible(false);
                this._displayAppList(apps);
            }
            if (onShown)
                onShown();
        };
        if (animate && this.isOpen && this._view === 'pinned') {
            animateStartMenuContentView(this._content, true, show);
            return;
        }

        resetStartMenuContentTransition(this._content);
        show();
    }

    _showSearchResults(query) {
        this._categorySidebarController.setVisible(false);
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

    _showEmptyMessage() {
        this._content.add_child(new St.Label({
            style_class: 'simple-taskbar-windows-start-empty',
            text: _('No results found'),
            x_align: Clutter.ActorAlign.CENTER,
        }));
    }

    _displaySearchResults(groups, complete) {
        this._clearContent();
        this._firstSearchResult = groups[0]?.results[0] ?? null;
        if (groups.length === 0) {
            if (!complete)
                return;
            this._showEmptyMessage();
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
                list.add_child(
                    this._listViewBuilder.createSearchResultButton(result)
                );
            this._content.add_child(list);
        }
    }

    _displayAppList(apps, categorized = false) {
        this._clearContent();
        this._firstVisibleApp = apps[0] ?? null;
        this._firstSearchResult = null;
        if (apps.length === 0) {
            this._showEmptyMessage();
            return;
        }

        const list = new St.BoxLayout({
            style_class: 'simple-taskbar-windows-start-app-list',
            orientation: Clutter.Orientation.VERTICAL,
        });
        for (const app of apps)
            list.add_child(
                this._listViewBuilder.createAppListButton(
                    app,
                    false,
                    categorized
                )
            );
        this._content.add_child(list);
    }

    _clearContent(resetTransition = true) {
        if (resetTransition)
            resetStartMenuContentTransition(this._content);
        this._tooltipController.hide(true);
        for (const child of this._content.get_children()) {
            if (child === this._pinnedView)
                this._content.remove_child(child);
            else
                child.destroy();
        }
    }

    _launchApp(app, actor) {
        if (actor)
            animateStartMenuLaunch(actor);
        this.close();
        app.open_new_window(-1);
    }

    _activateSearchResult(result, actor) {
        const isScreenshot = result.id === 'open-screenshot-ui';
        const isSystemAction = result.provider.id === 'applications' &&
            !result.id.endsWith('.desktop');
        if (result.app && !isScreenshot && !isSystemAction && actor)
            animateStartMenuLaunch(actor);
        this.close(!isScreenshot);
        if (isScreenshot) {
            showScreenshotUI();
            return;
        }
        if (isSystemAction) {
            SystemActions.getDefault().activateAction(result.id);
        } else if (result.provider.appInfo) {
            result.provider.activateResult(result.id, result.terms);
        } else if (result.app) {
            result.app.open_new_window(-1);
        }
        if (result.meta.clipboardText) {
            St.Clipboard.get_default().set_text(
                St.ClipboardType.CLIPBOARD,
                result.meta.clipboardText
            );
        }
    }

    _animatePinnedMutation(change) {
        if (!this.isOpen || this._searchEntry.get_text().trim() ||
            (this._view !== 'pinned' && this._view !== 'folder')) {
            return;
        }

        if (!change) {
            this.refresh();
            return;
        }

        if (change.type === 'folder-create' || change.type === 'folder-add') {
            this.refresh();
            return;
        }

        const sourceButton = change.sourceButton;
        const finish = () => this._finishPinnedMutation(change);
        if (sourceButton && sourceButton.get_stage())
            animateStartMenuItemOut(sourceButton, finish);
        else
            finish();
    }

    _finishPinnedMutation(change) {
        if (change.type === 'folder-remove') {
            this.refresh();
            const actors = change.appIds
                .map(appId => this._findContentActor(candidate =>
                    candidate._startMenuAppId === appId
                ))
                .filter(Boolean);
            animateStartMenuItemsIn(actors);
            return;
        }

        if (change.folderCollapsed && this._view === 'folder' &&
            this._activeFolderId === change.folderId) {
            this._showPinnedApps(true);
            return;
        }

        this.refresh();
        this._animateVisibleAppResult(change.appId);
    }

    _animateVisibleAppResult(appId) {
        if (!appId)
            return;

        const actor = this._findContentActor(candidate =>
            candidate._startMenuAppId === appId
        );
        if (actor)
            animateStartMenuItemIn(actor);
    }

    _findAppIcon(app) {
        const appId = app.get_id();
        const button = this._findContentActor(candidate =>
            candidate._startMenuAppId === appId
        );
        if (!button)
            return null;
        return button._startMenuAppIcon;
    }

    _findContentActor(predicate) {
        const actors = [this._content];
        while (actors.length > 0) {
            const actor = actors.pop();
            if (predicate(actor))
                return actor;
            actors.push(...actor.get_children());
        }
        return null;
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
        if (this.isOpen)
            return;

        this._updateSize();
        syncMenuArrowSide(this._menu, this._settings);
        this._resolveThemeNodes(this._menu.actor);
        this._menu.actor.get_preferred_size();
        this._root.get_preferred_size();
        this._syncPositionSource();
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
        const available = Math.max(
            MENU_MIN_HEIGHT,
            monitor.height - MENU_MONITOR_MARGIN
        );
        const height = Math.min(
            Math.max(MENU_BASE_HEIGHT, this._preferredHeight(width)),
            MENU_MAX_HEIGHT,
            available
        );
        if (width === this._menuWidth && height === this._menuHeight)
            return;

        this._menuWidth = width;
        this._menuHeight = height;
        this._root.set_style(`width: ${width}px; height: ${height}px;`);
    }

    _preferredHeight(width) {
        this._resolveThemeNodes(this._searchEntry);
        this._resolveThemeNodes(this._header);
        this._resolveThemeNodes(this._footerController.actor);

        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const forWidth = width * scale;
        const scrollNode = this._scrollView.get_theme_node();
        const chrome =
            this._searchEntry.get_preferred_height(forWidth)[1] +
            this._header.get_preferred_height(forWidth)[1] +
            this._footerController.actor.get_preferred_height(forWidth)[1] +
            scrollNode.get_padding(St.Side.TOP) +
            scrollNode.get_padding(St.Side.BOTTOM);

        const contentWidth = forWidth -
            scrollNode.get_padding(St.Side.LEFT) -
            scrollNode.get_padding(St.Side.RIGHT);
        return Math.ceil(
            (chrome + this._pinnedContentHeight(contentWidth)) / scale
        );
    }

    _pinnedContentHeight(forWidth) {
        if (!this._pinnedView ||
            this._pinnedView.get_parent() !== this._content)
            return 0;

        this._resolveThemeNodes(this._pinnedView);
        return this._pinnedView.get_preferred_height(forWidth)[1];
    }
}
