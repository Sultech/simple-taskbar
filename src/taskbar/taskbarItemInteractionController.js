// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {TaskbarAppMenu} from './taskbarAppMenu.js';
import {TaskbarLocationMenu} from './taskbarLocationMenu.js';
import {panelArrowSide, syncMenuArrowSide} from '../panel/panelPosition.js';
import {openPopupMenu} from '../shared/popupMenuUtils.js';

export class TaskbarItemInteractionController {
    constructor({
        settings,
        favorites,
        animatePinnedLaunch,
        closeApp,
        getInterestingWindows,
        getPreviewController,
        isDragging,
        onAppClicked,
        onWindowClicked,
        openNewWindow,
        windowsForItem,
    }) {
        this._settings = settings;
        this._favorites = favorites;
        this._animatePinnedLaunch = animatePinnedLaunch;
        this._closeApp = closeApp;
        this._getInterestingWindows = getInterestingWindows;
        this._getPreviewController = getPreviewController;
        this._isDragging = isDragging;
        this._onAppClicked = onAppClicked;
        this._onWindowClicked = onWindowClicked;
        this._openNewWindow = openNewWindow;
        this._windowsForItem = windowsForItem;
    }

    activate(item, interactionItem = item) {
        const previews = this._getPreviewController();
        const app = item._taskbarApp;
        previews.hideTooltip();
        if (item._taskbarIsLauncher) {
            previews.hide();
            this._animatePinnedLaunch(item);
            this._openNewWindow(app);
            return false;
        }

        const targetWindow = item._taskbarWindow;
        if (!targetWindow && this._favorites.isFavorite(app.get_id()) &&
            this._getInterestingWindows(app).length === 0) {
            this._animatePinnedLaunch(item);
        }
        if (targetWindow) {
            previews.hide();
            this._onWindowClicked(targetWindow);
            return false;
        }

        const keepOpen = this._getInterestingWindows(app).length > 1 &&
            !this._settings.get_boolean('multi-window-click-spread') &&
            previews.previewsEnabled;
        this._onAppClicked(interactionItem, app);
        return keepOpen;
    }

    middleClick(item) {
        const previews = this._getPreviewController();
        const app = item._taskbarApp;
        previews.hideTooltip();
        previews.hide();
        if (app._simpleTaskbarLocation) {
            this._openNewWindow(app);
            return;
        }
        if (this._settings.get_boolean('middle-click-close-apps')) {
            app.request_quit();
        } else {
            if (this._favorites.isFavorite(app.get_id()))
                this._animatePinnedLaunch(item);
            this._openNewWindow(app);
        }
    }

    hover(item, hovering, styleItem = item, retainForPreview = true) {
        if (this._isDragging())
            return;

        const previews = this._getPreviewController();
        if (hovering) {
            styleItem.add_style_pseudo_class('hover');
            const windowCount = item._taskbarIsLauncher
                ? 0
                : this._windowsForItem(item).length;
            if (!previews.previewsEnabled) {
                previews.hide();
                previews.scheduleTooltip(item);
                return;
            }
            if (previews.currentItem && previews.currentItem !== item) {
                previews.scheduleClose();
            } else {
                previews.schedule(item);
            }
            if (windowCount === 0)
                previews.scheduleTooltip(item);
            else
                previews.hideTooltip();
            return;
        }

        if (!retainForPreview || previews.hoverItem !== item)
            styleItem.remove_style_pseudo_class('hover');
        if (previews.tooltipItem === item)
            previews.hideTooltip();
        previews.scheduleClose();
    }

    popupMenu(item, button = item._taskbarButton) {
        const previews = this._getPreviewController();
        previews.hideTooltip();
        previews.hide();
        if (item._taskbarApp._simpleTaskbarLocation) {
            if (button._taskbarMenu)
                this.destroyButton(button);
            this._createLocationMenu(button, item._taskbarApp, item);
            const locationMenu = button._taskbarMenu;
            syncMenuArrowSide(locationMenu, this._settings);
            openPopupMenu(locationMenu);
            return;
        }
        if (!button._taskbarMenu)
            this._createMenu(button, item._taskbarApp, item);

        const menu = button._taskbarMenu;
        syncMenuArrowSide(menu, this._settings);
        openPopupMenu(menu);
    }

    syncFileManagerPlaces(items) {
        const enabled = this._settings.get_boolean(
            'nautilus-places-enabled'
        );
        for (const item of items) {
            if (item._taskbarApp && item._taskbarApp._simpleTaskbarLocation)
                continue;
            item._taskbarButton._taskbarMenu
                ?.setFileManagerPlacesEnabled(enabled);
        }
    }

    destroyButton(button) {
        this._getPreviewController().destroyButton(button);
        button._taskbarMenu?.destroy();
        button._taskbarMenu = null;
        button._taskbarMenuManager = null;
    }

    destroy() {
        this._windowsForItem = null;
        this._openNewWindow = null;
        this._onWindowClicked = null;
        this._onAppClicked = null;
        this._isDragging = null;
        this._getPreviewController = null;
        this._getInterestingWindows = null;
        this._closeApp = null;
        this._animatePinnedLaunch = null;
        this._favorites = null;
        this._settings = null;
    }

    _createMenu(button, app, item) {
        const menu = new TaskbarAppMenu(button, panelArrowSide(this._settings), {
            favoritesSection: true,
            isDock: this._settings.isDock,
            showSingleWindows: true,
            targetWindow: item._taskbarWindow,
            closeApp: (targetApp, timestamp) =>
                this._closeApp(targetApp, timestamp),
            getInterestingWindows: targetApp =>
                this._getInterestingWindows(targetApp),
            fileManagerPlacesApp: app,
            fileManagerPlacesEnabled: this._settings.get_boolean(
                'nautilus-places-enabled'
            ),
        });
        const menuManager = new PopupMenu.PopupMenuManager(button);

        menu.setApp(app);
        menu.connect('open-state-changed', (_popup, isOpen) => {
            if (isOpen) {
                item.add_style_pseudo_class('hover');
            } else if (!item.hover &&
                this._getPreviewController().hoverItem !== item) {
                item.remove_style_pseudo_class('hover');
            }
        });
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        menuManager.addMenu(menu);

        button._taskbarMenu = menu;
        button._taskbarMenuManager = menuManager;
    }

    _createLocationMenu(button, app, item) {
        const menu = new TaskbarLocationMenu(
            button,
            this._settings,
            app
        );
        const menuManager = new PopupMenu.PopupMenuManager(button);

        menu.connect('open-state-changed', (_popup, isOpen) => {
            if (isOpen) {
                item.add_style_pseudo_class('hover');
            } else if (!item.hover &&
                this._getPreviewController().hoverItem !== item) {
                item.remove_style_pseudo_class('hover');
            }
        });
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        menuManager.addMenu(menu);

        button._taskbarMenu = menu;
        button._taskbarMenuManager = menuManager;
    }
}
