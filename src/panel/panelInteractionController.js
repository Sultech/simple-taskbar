// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    panelArrowSide,
    panelIsVertical,
    syncMenuArrowSide,
} from './panelPosition.js';
import {getScrollDelta} from '../scrollUtils.js';
import {openPopupMenu} from '../shared/popupMenuUtils.js';
import {taskManagerCandidates} from '../shared/taskManagerUtils.js';

export class PanelInteractionController {
    constructor({
        settings,
        taskbarController,
        taskbarBin,
        taskbarContainer,
        previewController,
        openPreferences,
        panelActor = Main.panel,
        panelBoxes = [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ],
        allowTaskbarLock = true,
    }) {
        this._settings = settings;
        this._taskbarController = taskbarController;
        this._taskbarBin = taskbarBin;
        this._taskbarContainer = taskbarContainer;
        this._previews = previewController;
        this._openPreferences = openPreferences;
        this._panelActor = panelActor;
        this._panelBoxes = panelBoxes;
        this._allowTaskbarLock = allowTaskbarLock;
        this._capturedEventId = 0;
        this._workspaceScrollTimeoutId = 0;
        this._contextMenu = null;
        this._contextMenuManager = null;
        this._lockChangedId = 0;
    }

    enable() {
        this._createContextMenu();
        this._capturedEventId = this._panelActor.connect(
            'captured-event',
            (_actor, event) => this._onCapturedEvent(event)
        );
    }

    get menuIsOpen() {
        return this._contextMenu.isOpen;
    }

    destroy() {
        if (this._workspaceScrollTimeoutId)
            GLib.Source.remove(this._workspaceScrollTimeoutId);
        this._workspaceScrollTimeoutId = 0;

        if (this._capturedEventId)
            this._panelActor.disconnect(this._capturedEventId);
        this._capturedEventId = 0;

        if (this._lockChangedId)
            this._settings.disconnect(this._lockChangedId);
        this._lockChangedId = 0;

        this._contextMenu.destroy();
        this._contextMenu = null;
        this._contextMenuManager = null;
        this._previews = null;
        this._taskbarController = null;
        this._taskbarBin = null;
        this._taskbarContainer = null;
        this._panelBoxes = null;
        this._panelActor = null;
        this._allowTaskbarLock = false;
        this._settings = null;
        this._openPreferences = null;
    }

    _createContextMenu() {
        const isDock = this._settings.isDock;
        const menu = new PopupMenu.PopupMenu(
            Main.layoutManager.dummyCursor,
            0.5,
            panelArrowSide(this._settings)
        );
        const menuManager = new PopupMenu.PopupMenuManager(this._panelActor);
        menu.addAction(_('Task Manager'), () => this._openTaskManager());
        if (this._allowTaskbarLock) {
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const lockItem = menu.addAction(_('Lock the Taskbar'), () => {
                this._settings.set_boolean(
                    'taskbar-locked',
                    !this._settings.get_boolean('taskbar-locked')
                );
            });
            const ornamentIcon = lockItem._ornamentIcon;
            ornamentIcon.get_parent().remove_child(ornamentIcon);
            const rightOrnament = new St.Bin({
                x_expand: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
                child: ornamentIcon,
            });
            lockItem.add_child(rightOrnament);
            const syncLockItem = () => {
                lockItem.setOrnament(
                    this._settings.get_boolean('taskbar-locked')
                        ? PopupMenu.Ornament.CHECK
                        : PopupMenu.Ornament.NONE
                );
                lockItem.remove_style_class_name(
                    'popup-ornamented-menu-item'
                );
            };
            this._lockChangedId = this._settings.connect(
                'changed::taskbar-locked',
                syncLockItem
            );
            syncLockItem();
        }
        menu.addAction(
            isDock ? _('Dock Settings') : _('Taskbar Settings'),
            () => {
                if (isDock)
                    this._settings.set_string(
                        'target-prefs-page',
                        'dock'
                    );
                this._openPreferences();
            }
        );
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        menuManager.addMenu(menu);

        this._contextMenu = menu;
        this._contextMenuManager = menuManager;
    }

    _openTaskManager() {
        const configuredApp = this._settings.get_string('task-manager-app');
        const appSystem = Shell.AppSystem.get_default();
        for (const appId of taskManagerCandidates(configuredApp)) {
            if (!appId)
                continue;

            const app = appSystem.lookup_app(appId);
            if (!app)
                continue;

            app.activate();
            return;
        }

        console.error(
            `Simple Taskbar could not find task manager application: ${configuredApp}`
        );
    }

    _onCapturedEvent(event) {
        const eventType = event.type();
        const target = global.stage.get_event_actor(event);

        if (eventType === Clutter.EventType.BUTTON_PRESS &&
            event.get_button() === Clutter.BUTTON_SECONDARY &&
            this._isFreePanelTarget(target)) {
            this._openContextMenu(event);
            return Clutter.EVENT_STOP;
        }

        if (target && eventType === Clutter.EventType.SCROLL &&
            this._taskbarBin.contains(target) &&
            this._scrollTaskbar(event)) {
            return Clutter.EVENT_STOP;
        }

        if (!this._settings.get_boolean('workspace-scroll-enabled') ||
            eventType !== Clutter.EventType.SCROLL)
            return Clutter.EVENT_PROPAGATE;

        const scrollOverOverflowApp = target &&
            this._settings.get_boolean('application-overflow-enabled') &&
            this._taskbarController.hasTarget(target);
        if (!this._isFreePanelTarget(target) && !scrollOverOverflowApp)
            return Clutter.EVENT_PROPAGATE;
        if (scrollOverOverflowApp) {
            this._previews.hideTooltip(false);
            this._previews.hide();
        }

        const [previousDirection, nextDirection] =
            global.workspace_manager.layout_columns >
            global.workspace_manager.layout_rows
                ? [Meta.MotionDirection.UP, Meta.MotionDirection.DOWN]
                : [Meta.MotionDirection.LEFT, Meta.MotionDirection.RIGHT];
        const direction = this._getScrollDirection(
            event,
            previousDirection,
            nextDirection
        );

        if (!direction)
            return Clutter.EVENT_PROPAGATE;
        if (this._workspaceScrollTimeoutId)
            return Clutter.EVENT_STOP;

        const activeWorkspace = global.workspace_manager.get_active_workspace();
        const targetWorkspace = activeWorkspace.get_neighbor(direction);
        if (!targetWorkspace || targetWorkspace === activeWorkspace)
            return Clutter.EVENT_STOP;

        const scrollDelay = this._settings.get_int('workspace-scroll-delay');
        if (scrollDelay > 0) {
            this._workspaceScrollTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                scrollDelay,
                () => {
                    this._workspaceScrollTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }
        Main.wm.actionMoveWorkspace(targetWorkspace);
        return Clutter.EVENT_STOP;
    }

    _scrollTaskbar(event) {
        if (this._settings.get_boolean('application-overflow-enabled'))
            return false;

        const adjustment = panelIsVertical(this._settings)
            ? this._taskbarBin.vadjustment
            : this._taskbarBin.hadjustment;
        const [value, , upper, stepIncrement, , pageSize] =
            adjustment.get_values();
        if (upper <= pageSize + 1)
            return false;

        const increment = Math.max(stepIncrement, 48);
        const delta = getScrollDelta(event, increment);

        if (delta === 0)
            return false;

        adjustment.set_value(value + delta);
        return true;
    }

    _getScrollDirection(event, previousDirection, nextDirection) {
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
        case Clutter.ScrollDirection.LEFT:
            return previousDirection;
        case Clutter.ScrollDirection.DOWN:
        case Clutter.ScrollDirection.RIGHT:
            return nextDirection;
        case Clutter.ScrollDirection.SMOOTH: {
            const [dx, dy] = event.get_scroll_delta();
            const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
            if (delta < -0.1)
                return previousDirection;
            if (delta > 0.1)
                return nextDirection;
            break;
        }
        }

        return null;
    }

    _openContextMenu(event) {
        const [stageX, stageY] = event.get_coords();
        Main.layoutManager.setDummyCursorGeometry(stageX, stageY, 0, 0);
        this._previews.hideTooltip(false);
        this._previews.hide();
        syncMenuArrowSide(this._contextMenu, this._settings);
        openPopupMenu(this._contextMenu);
    }

    _isFreePanelTarget(target) {
        if (!target || (target !== this._panelActor &&
            !this._panelActor.contains(target)))
            return false;

        if (this._taskbarController.hasTarget(target))
            return false;

        for (const box of this._panelBoxes) {
            for (const child of box.get_children()) {
                if (child === this._taskbarContainer)
                    continue;
                if (child === target || child.contains(target))
                    return false;
            }
        }

        return true;
    }
}
