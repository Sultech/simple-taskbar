// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    panelArrowSide,
    panelIsVertical,
    syncMenuArrowSide,
} from './panelPosition.js';
import {getScrollDelta} from '../scrollUtils.js';
import {SCROLL_ACTION} from '../shared/applicationScrollActions.js';
import {PANEL_SCROLL_ACTION} from '../shared/panelScrollActions.js';
import {openPopupMenu} from '../popupMenuUtils.js';
import {taskManagerCandidates} from '../shared/taskManagerUtils.js';

const SHELL_VERSION = parseInt(Config.PACKAGE_VERSION);
const CLICK_THROUGH_BLOCKING_MODIFIERS =
    Clutter.ModifierType.CONTROL_MASK |
    Clutter.ModifierType.MOD1_MASK |
    Clutter.ModifierType.MOD4_MASK |
    Clutter.ModifierType.SUPER_MASK |
    Clutter.ModifierType.META_MASK;

export class PanelInteractionController {
    constructor({
        settings,
        taskbarController,
        taskbarBin,
        taskbarContainer,
        previewController,
        openPreferences,
        onAppScrolled,
        onPanelScrolled,
        getVolumeIndicator,
        panelActor = Main.panel,
        panelBoxes = [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ],
        allowTaskbarLock = true,
        getClickThroughMenus = () => [],
    }) {
        this._settings = settings;
        this._taskbarController = taskbarController;
        this._taskbarBin = taskbarBin;
        this._taskbarContainer = taskbarContainer;
        this._previews = previewController;
        this._openPreferences = openPreferences;
        this._onAppScrolled = onAppScrolled;
        this._onPanelScrolled = onPanelScrolled;
        this._getVolumeIndicator = getVolumeIndicator;
        this._panelActor = panelActor;
        this._panelBoxes = panelBoxes;
        this._allowTaskbarLock = allowTaskbarLock;
        this._getClickThroughMenus = getClickThroughMenus;
        this._clickThroughMenus = [];
        this._clickThroughIdleId = 0;
        this._capturedEventId = 0;
        this._workspaceScrollTimeoutId = 0;
        this._appScrollTimeoutId = 0;
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
        this._panelActor.connectObject(
            'popup-menu', () => this._onPanelPopupMenu(),
            this
        );
        this._clickThroughMenus = [
            this._contextMenu,
            ...this._getClickThroughMenus(),
        ].filter(Boolean);
        for (const menu of this._clickThroughMenus) {
            menu.connectObject('open-state-changed', (_menu, open) => {
                if (!open)
                    this._passOutsideClickThrough(menu);
            }, this);
            menu.actor.connectObject('captured-event', (_actor, event) =>
                this._openHoveredMenu(menu, event), this);
        }
    }

    get menuIsOpen() {
        return this._contextMenu.isOpen;
    }

    close() {
        this._contextMenu?.close();
    }

    destroy() {
        this._panelActor.disconnectObject(this);
        for (const menu of this._clickThroughMenus) {
            menu.disconnectObject(this);
            menu.actor.disconnectObject(this);
        }
        this._clickThroughMenus = [];
        this._getClickThroughMenus = null;
        if (this._clickThroughIdleId)
            GLib.Source.remove(this._clickThroughIdleId);
        this._clickThroughIdleId = 0;
        if (this._workspaceScrollTimeoutId)
            GLib.Source.remove(this._workspaceScrollTimeoutId);
        this._workspaceScrollTimeoutId = 0;
        if (this._appScrollTimeoutId)
            GLib.Source.remove(this._appScrollTimeoutId);
        this._appScrollTimeoutId = 0;

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
        this._onAppScrolled = null;
        this._onPanelScrolled = null;
        this._getVolumeIndicator = null;
    }

    _passOutsideClickThrough(menu) {
        const event = Clutter.get_current_event();
        if (!event ||
            event.type() !== Clutter.EventType.BUTTON_PRESS ||
            event.get_state() & CLICK_THROUGH_BLOCKING_MODIFIERS)
            return;

        const mouseButton = event.get_button();
        if (mouseButton !== Clutter.BUTTON_PRIMARY &&
            mouseButton !== Clutter.BUTTON_SECONDARY)
            return;

        const button = this._panelButtonAt(
            global.stage.get_event_actor(event),
            menu.sourceActor,
            mouseButton === Clutter.BUTTON_SECONDARY
        );
        if (!button)
            return;

        if (this._clickThroughIdleId)
            GLib.Source.remove(this._clickThroughIdleId);
        this._clickThroughIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._clickThroughIdleId = 0;
            if (!button.mapped || !button.reactive)
                return GLib.SOURCE_REMOVE;

            const buttonMenu = this._panelMenuOf(button);
            if (buttonMenu)
                buttonMenu.toggle();
            else if (mouseButton === Clutter.BUTTON_SECONDARY)
                button.emit('popup-menu');
            else if (this._isActivitiesButton(button))
                this._toggleOverview();
            else
                button.emit('clicked', Clutter.BUTTON_PRIMARY);
            return GLib.SOURCE_REMOVE;
        });
    }

    _openHoveredMenu(menu, event) {
        if (!menu.isOpen || event.type() !== Clutter.EventType.MOTION)
            return Clutter.EVENT_PROPAGATE;

        const [stageX, stageY] = event.get_coords();
        const hoveredMenu = this._clickThroughMenuAt(
            global.stage.get_actor_at_pos(
                Clutter.PickMode.REACTIVE,
                stageX,
                stageY
            )
        );
        if (!hoveredMenu || hoveredMenu === menu || hoveredMenu.isOpen ||
            !hoveredMenu.sourceActor.reactive)
            return Clutter.EVENT_PROPAGATE;

        menu.close();
        hoveredMenu.open();
        return Clutter.EVENT_PROPAGATE;
    }

    _clickThroughMenuAt(actor) {
        for (let current = actor; current; current = current.get_parent()) {
            if (current === this._panelActor)
                return null;

            const menu = this._clickThroughMenus.find(clickThroughMenu =>
                clickThroughMenu.sourceActor === current);
            if (menu)
                return menu;
        }
        return null;
    }

    _panelMenuOf(actor) {
        return [actor.menu, ...this._clickThroughMenus].find(menu =>
            menu instanceof PopupMenu.PopupMenu &&
            menu.sourceActor === actor) ?? null;
    }

    _isActivitiesButton(actor) {
        return actor.name === 'panelActivities';
    }

    _toggleOverview() {
        if (Main.overview.shouldToggleByCornerOrButton())
            Main.overview.toggle();
    }

    _panelButtonAt(actor, sourceActor, includePanel = false) {
        let button = null;
        for (let current = actor; current; current = current.get_parent()) {
            if (current === sourceActor)
                return null;
            if (!button && (current instanceof St.Button ||
                this._panelMenuOf(current) ||
                this._isActivitiesButton(current)))
                button = current;
            if (current === this._panelActor) {
                const found = button ?? (includePanel ? current : null);
                return found?.reactive ? found : null;
            }
        }
        return null;
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

    handleTargetedEvent(target, event) {
        return this._onCapturedEvent(event, target);
    }

    _onCapturedEvent(event, targetOverride = null) {
        const eventType = event.type();
        const target = targetOverride ?? global.stage.get_event_actor(event);

        if (eventType === Clutter.EventType.BUTTON_PRESS &&
            event.get_button() === Clutter.BUTTON_SECONDARY &&
            this._isFreePanelTarget(target)) {
            this._openContextMenu(event);
            return Clutter.EVENT_STOP;
        }

        let item = null;
        if (eventType === Clutter.EventType.SCROLL) {
            if (target && this._taskbarBin.contains(target) &&
                this._scrollTaskbar(event)) {
                return Clutter.EVENT_STOP;
            }

            item = target &&
                this._taskbarController.getItemAtTarget(target);
            const action = this._settings.get_string('scroll-icon-action');
            if (item && action !== SCROLL_ACTION.SWITCH_WORKSPACE) {
                if (action === SCROLL_ACTION.CYCLE_WINDOWS) {
                    this._previews.hideTooltip(false);
                    this._previews.hide();
                    const [previousDirection, nextDirection] =
                        this._getWorkspaceScrollDirections();
                    const direction = this._getDiscreteScrollDirection(
                        event,
                        previousDirection,
                        nextDirection
                    );
                    if (direction && !this._appScrollTimeoutId) {
                        this._appScrollTimeoutId = GLib.timeout_add(
                            GLib.PRIORITY_DEFAULT,
                            this._getScrollDelay(true),
                            () => {
                                this._appScrollTimeoutId = 0;
                                return GLib.SOURCE_REMOVE;
                            }
                        );
                        this._onAppScrolled(item, direction);
                    }
                }
                return Clutter.EVENT_STOP;
            }
        }

        if (eventType !== Clutter.EventType.SCROLL)
            return Clutter.EVENT_PROPAGATE;

        const configuredPanelAction =
            this._settings.get_string('workspace-scroll-action');

        const scrollOverApp = target &&
            this._taskbarController.hasTarget(target) &&
            (this._settings.get_boolean('application-overflow-enabled') ||
                !this._taskbarHasOverflow());
        if (!this._isFreePanelTarget(target) && !scrollOverApp)
            return Clutter.EVENT_PROPAGATE;
        if (scrollOverApp) {
            this._previews.hideTooltip(false);
            this._previews.hide();
        }

        const panelAction = item
            ? PANEL_SCROLL_ACTION.SWITCH_WORKSPACE
            : configuredPanelAction;
        if (panelAction === PANEL_SCROLL_ACTION.DO_NOTHING)
            return Clutter.EVENT_STOP;
        if (this._workspaceScrollTimeoutId)
            return Clutter.EVENT_STOP;

        if (panelAction === PANEL_SCROLL_ACTION.CHANGE_VOLUME) {
            if (!this._changeVolume(event))
                return Clutter.EVENT_PROPAGATE;
            this._startWorkspaceScrollTimeout();
            return Clutter.EVENT_STOP;
        }

        const [previousDirection, nextDirection] =
            this._getWorkspaceScrollDirections();
        const direction = this._getScrollDirection(
            event,
            previousDirection,
            nextDirection
        );

        if (!direction)
            return Clutter.EVENT_PROPAGATE;

        if (panelAction === PANEL_SCROLL_ACTION.CYCLE_WINDOWS) {
            if (this._onPanelScrolled(direction))
                this._startWorkspaceScrollTimeout(Boolean(item));
            return Clutter.EVENT_STOP;
        }

        const activeWorkspace = global.workspace_manager.get_active_workspace();
        const targetWorkspace = activeWorkspace.get_neighbor(direction);
        if (!targetWorkspace || targetWorkspace === activeWorkspace)
            return Clutter.EVENT_STOP;

        this._startWorkspaceScrollTimeout(Boolean(item));
        Main.wm.actionMoveWorkspace(targetWorkspace);
        return Clutter.EVENT_STOP;
    }

    _getScrollDelay(forApp = false) {
        if (forApp &&
            !this._settings.get_boolean('scroll-icon-follow-panel-delay'))
            return this._settings.get_int('scroll-icon-delay');

        return this._settings.get_int('workspace-scroll-delay');
    }

    _startWorkspaceScrollTimeout(forApp = false) {
        if (this._workspaceScrollTimeoutId) {
            GLib.Source.remove(this._workspaceScrollTimeoutId);
            this._workspaceScrollTimeoutId = 0;
        }
        const scrollDelay = this._getScrollDelay(forApp);
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
    }

    _changeVolume(event) {
        if (event.get_flags() & Clutter.EventFlags.FLAG_POINTER_EMULATED)
            return false;

        const volumeIndicator = this._getVolumeIndicator();
        if (!volumeIndicator)
            return false;

        if (SHELL_VERSION >= 51) {
            const direction = event.get_scroll_direction();
            let delta = 0;
            if (direction === Clutter.ScrollDirection.UP)
                delta = -1;
            else if (direction === Clutter.ScrollDirection.DOWN)
                delta = 1;
            else if (direction === Clutter.ScrollDirection.SMOOTH) {
                [, delta] = event.get_scroll_delta();
                if (event.get_scroll_flags() & Clutter.ScrollFlags.INVERTED)
                    delta *= -1;
            }
            volumeIndicator._handleScroll(
                volumeIndicator._output,
                delta
            );
        } else {
            volumeIndicator._handleScrollEvent(
                volumeIndicator._output,
                event
            );
        }

        return true;
    }

    _scrollTaskbar(event) {
        if (this._settings.get_boolean('application-overflow-enabled'))
            return false;

        const adjustment = this._getTaskbarAdjustment();
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

    _taskbarHasOverflow() {
        const adjustment = this._getTaskbarAdjustment();
        const [, , upper, , , pageSize] = adjustment.get_values();
        return upper > pageSize + 1;
    }

    _getTaskbarAdjustment() {
        return panelIsVertical(this._settings)
            ? this._taskbarBin.vadjustment
            : this._taskbarBin.hadjustment;
    }

    _getWorkspaceScrollDirections() {
        return global.workspace_manager.layout_columns >
            global.workspace_manager.layout_rows
            ? [Meta.MotionDirection.UP, Meta.MotionDirection.DOWN]
            : [Meta.MotionDirection.LEFT, Meta.MotionDirection.RIGHT];
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

    _getDiscreteScrollDirection(event, previousDirection, nextDirection) {
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
        case Clutter.ScrollDirection.LEFT:
            return previousDirection;
        case Clutter.ScrollDirection.DOWN:
        case Clutter.ScrollDirection.RIGHT:
            return nextDirection;
        }

        return null;
    }

    _onPanelPopupMenu() {
        const [stageX, stageY] = global.get_pointer();
        const target = global.stage.get_actor_at_pos(
            Clutter.PickMode.REACTIVE,
            stageX,
            stageY
        );
        if (this._isFreePanelTarget(target))
            this._openContextMenuAt(stageX, stageY);
    }

    _openContextMenu(event) {
        const [stageX, stageY] = event.get_coords();
        this._openContextMenuAt(stageX, stageY);
    }

    _openContextMenuAt(stageX, stageY) {
        Main.layoutManager.setDummyCursorGeometry(stageX, stageY, 0, 0);
        this._taskbarController.dropHoverAnimations();
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
