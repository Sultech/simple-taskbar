// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {TaskbarAppMenu} from './taskbarAppMenu.js';
import {panelArrowSide, syncMenuArrowSide} from './panelPosition.js';

const STARTUP_SETTLE_DELAY = 750;
const INDICATOR_ANIMATION_DURATION = 150;
const INDICATOR_SEGMENT_GAP = 2;
const APP_LABEL_WIDTH = 140;
const APP_LABEL_SPACING = 8;
const APP_CONTENT_VERTICAL_RESERVE = 14;
const WINDOWS_XP_BUTTON_Y = 3;
const WINDOWS_XP_BUTTON_BORDER_WIDTH = 2;
const WINDOWS_XP_TASKBUTTON_WIDTH = 160;
const WINDOWS_XP_TASKBUTTON_HORIZONTAL_PADDING = 8;
const WINDOWS_XP_TASKBUTTON_ICON_SPACING = 4;
const WINDOWS_XP_PINNED_TO_RUNNING_GAP = 6;
const WINDOWS_XP_SHOW_DESKTOP_WIDTH = 30;
const ROUNDED_INDICATORS_CLASS =
    'simple-taskbar-rounded-indicators';

// Retain DashItemContainer's scale-and-fade animation.
const TaskbarItemContainer = GObject.registerClass(
class TaskbarItemContainer extends Dash.DashItemContainer {
    _init() {
        super._init();
        this._preserveNaturalWidth = false;
        this.x_expand = false;
        this.y_expand = false;
    }

    setPreserveNaturalWidth(preserve) {
        if (preserve === this._preserveNaturalWidth)
            return;

        this._preserveNaturalWidth = preserve;
        this.queue_relayout();
    }

    vfunc_get_preferred_width(forHeight) {
        const [minimumWidth, naturalWidth] =
            super.vfunc_get_preferred_width(forHeight);
        return [
            this._preserveNaturalWidth ? naturalWidth : minimumWidth,
            naturalWidth,
        ];
    }

    vfunc_allocate(box) {
        if (this.child === null)
            return;

        this.set_allocation(box);

        const availableWidth = box.x2 - box.x1;
        const availableHeight = box.y2 - box.y1;
        const [, , naturalWidth, naturalHeight] =
            this.child.get_preferred_size();
        const [childScaleX, childScaleY] = this.child.get_scale();
        const childWidth = Math.min(
            naturalWidth * childScaleX,
            availableWidth
        );
        const childHeight = Math.min(
            naturalHeight * childScaleY,
            availableHeight
        );
        const childBox = new Clutter.ActorBox();
        childBox.x1 = (availableWidth - childWidth) / 2;
        childBox.y1 = (availableHeight - childHeight) / 2;
        childBox.x2 = childBox.x1 + childWidth;
        childBox.y2 = childBox.y1 + childHeight;
        this.child.allocate(childBox);
    }
});

export class TaskbarController {
    constructor({
        settings,
        appSystem,
        tracker,
        favorites,
        iconSize,
        panelHeight,
        getInterestingWindows,
        onAppClicked,
        onWindowClicked,
        openNewWindow,
        onShowDesktopClicked,
        onShowDesktopModeChanged,
    }) {
        this._settings = settings;
        this._appSystem = appSystem;
        this._tracker = tracker;
        this._favorites = favorites;
        this._iconSize = iconSize;
        this._panelHeight = panelHeight;
        this._getInterestingWindows = getInterestingWindows;
        this._onAppClicked = onAppClicked;
        this._onWindowClicked = onWindowClicked;
        this._openNewWindow = openNewWindow;
        this._onShowDesktopClicked = onShowDesktopClicked;
        this._onShowDesktopModeChanged = onShowDesktopModeChanged;
        this._windowPreviews = null;
        this._alignmentActor = null;
        this._signals = [];
        this._appSignals = new Map();
        this._appButtons = new Map();
        this._auxiliaryItems = new Set();
        this._dragEndListeners = new Set();
        this._showDesktopButton = null;
        this._showDesktopItem = null;
        this._showDesktopSlot = null;
        this._showDesktopDraggable = null;
        this._showDesktopDragBeginId = 0;
        this._showDesktopDragEndId = 0;
        this._replaceShowDesktopButton = null;
        this._preserveItemWidths = false;
        this._sessionOrder = [];
        this._dragging = false;
        this._dragEnabled = null;
        this._suppressMembershipAnimation = false;
        this._iconGeometryUpdateId = 0;
        this._iconGeometryUpdatesEnabled = true;
        this._dragCursorResetId = 0;
        this._activeWorkspace = null;
        this._activeWorkspaceSignalIds = [];
        this._shownInitially = false;
        this._availableWidth = 0;
        this._whenFullCombinedApps = new Set();
        this._startMenuOpen = false;
        this._appLabelWidth = APP_LABEL_WIDTH;
        this._startupSettling = Main.layoutManager._startingUp;
        this._startupSettleId = 0;
        this._externalDragPlaceholder = null;
        this._externalDragFavoriteIndex = -1;
        this._externalDragFavoriteCenters = null;
        this._panelDropActor = null;
        this._previousPanelDropDelegate = null;
        this._dragMonitor = {
            dragMotion: event => this._onDragMotion(event),
        };

        this.actor = new St.BoxLayout({
            style_class: 'simple-taskbar-apps',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            visible: !this._settings.get_boolean('default-gnome-panel'),
        });
        this.actor._delegate = this;
        this._redisplayWorkId = Main.initializeDeferredWork(
            this.actor,
            () => this.redisplay()
        );
    }

    setPreviewController(controller) {
        this._windowPreviews = controller;
    }

    setAlignmentActor(actor) {
        this._alignmentActor = actor;
    }

    setShowDesktopButton(button, replaceButton) {
        this._showDesktopButton = button;
        this._replaceShowDesktopButton = replaceButton;
        this._syncShowDesktopItem();
    }

    activateShowDesktop() {
        this._onShowDesktopClicked();
    }

    getItems() {
        return [...this._appButtons.values(), ...this._auxiliaryItems];
    }

    getOrderedItems() {
        const items = new Set(this._appButtons.values());
        if (this._showDesktopItem)
            items.add(this._showDesktopItem);
        return this.actor.get_children().filter(item => items.has(item));
    }

    setPreserveItemWidths(preserve) {
        if (preserve === this._preserveItemWidths)
            return;

        this._preserveItemWidths = preserve;
        for (const item of this._appButtons.values())
            item.setPreserveNaturalWidth(preserve);
        if (this._showDesktopItem)
            this._showDesktopItem.setPreserveNaturalWidth(preserve);
    }

    registerAuxiliaryItem(item) {
        this._auxiliaryItems.add(item);
    }

    removeAuxiliaryItem(item) {
        this._auxiliaryItems.delete(item);
        this._windowPreviews.removeItem(item);
        this._destroyAppMenu(item._taskbarButton);
    }

    addDragEndListener(listener) {
        this._dragEndListeners.add(listener);
    }

    removeDragEndListener(listener) {
        this._dragEndListeners.delete(listener);
    }

    isTaskbarItemDraggable(item) {
        return this._dragIsEnabled(item);
    }

    isTaskbarItemPinned(item) {
        return this._isPinnedTaskbarItem(item);
    }

    getTaskbarDragGroup(item) {
        const group = this._taskbarDragGroups().find(group =>
            group.items.includes(item)
        );
        return group ? [...group.items] : [];
    }

    beginExternalTaskbarDrag(item) {
        this._dragging = true;
        item.opacity = 96;
        this._windowPreviews.hideTooltip(false);
        this._windowPreviews.hide();
    }

    finishExternalTaskbarDrag(item, draggable) {
        this._resetDragCursor(draggable);
        item.opacity = 255;
        this._dragging = false;
        this._queueRedisplay();
        this._notifyDragEnd();
    }

    hasOpenMenu() {
        return this.getItems().some(item =>
            item._taskbarButton?._taskbarMenu?.isOpen
        );
    }

    get isDragging() {
        return this._dragging;
    }

    hasTarget(target) {
        for (const item of this._appButtons.values()) {
            if (item === target || item.contains(target))
                return true;
        }
        if (this._showDesktopItem &&
            (this._showDesktopItem === target ||
                this._showDesktopItem.contains(target))) {
            return true;
        }
        return false;
    }

    enable() {
        DND.addDragMonitor(this._dragMonitor);
        if (this._startupSettling) {
            this._connect(Main.layoutManager, 'startup-complete', () => {
                this._scheduleStartupSettle();
            });
        }
        this._connect(this._appSystem, 'app-state-changed', (_system, app) => {
            if (this._combineMode() === 'always' &&
                !this._usePinnedAppLaunchers() &&
                this._isPersistentPinned(app) &&
                this._hasItemsForApp(app.get_id())) {
                this.syncButtonStates();
                return;
            }
            this._queueRedisplay();
        });
        this._connect(this._favorites, 'changed', () => {
            this._queueRedisplay();
            if (!this._dragging)
                this._syncDragEnabled(true);
        });
        this._connect(global.display, 'notify::focus-window', () => {
            this.syncButtonStates();
        });
        this._connect(global.window_manager, 'switch-workspace', () => {
            this._connectActiveWorkspaceSignals();
            this._refreshWorkspaceIsolation(
                false,
                this._settings.get_boolean('isolate-workspaces')
            );
        });
        for (const signal of ['window-entered-monitor', 'window-left-monitor']) {
            this._connect(global.display, signal, () => {
                this._refreshWorkspaceIsolation();
            });
        }
        this._connect(
            this._settings,
            'changed::hide-pinned-taskbar-apps',
            () => {
                this._sessionOrder = [];
                this._queueRedisplay();
                this._syncDragEnabled(true);
            }
        );
        this._connect(
            this._settings,
            'changed::use-pinned-apps-as-launchers',
            () => {
                this._windowPreviews.hideTooltip(false);
                this._windowPreviews.hide();
                this._shownInitially = false;
                this._queueRedisplay();
                this._syncDragEnabled();
            }
        );
        this._connect(
            this._settings,
            'changed::default-gnome-panel',
            () => {
                this._syncApplicationVisibility();
                this._syncShowDesktopItem();
            }
        );
        this._connect(
            this._settings,
            'changed::windows-xp-theme-enabled',
            () => this._syncShowDesktopItem()
        );
        this._connect(
            this._settings,
            'changed::show-desktop-button-visible',
            () => this._syncShowDesktopItem()
        );
        this._connect(
            this._settings,
            'changed::windows-xp-show-desktop-position',
            () => this._queueRedisplay()
        );
        this._connect(this._settings, 'changed::isolate-workspaces', () => {
            this._refreshWorkspaceIsolation(true, true);
        });
        this._connect(this._settings, 'changed::isolate-monitors', () => {
            this._refreshWorkspaceIsolation(true, true);
        });
        this._connect(this._settings, 'changed::multi-monitor-panels', () => {
            this._refreshWorkspaceIsolation(true);
        });
        this._connect(
            this._settings,
            'changed::combine-app-buttons-mode',
            () => {
                this._windowPreviews?.hideTooltip(false);
                this._windowPreviews?.hide();
                this._syncCombineWhenFull();
                this._shownInitially = false;
                this._queueRedisplay();
                this._syncDragEnabled();
            }
        );
        this._connect(this._settings, 'changed::hide-app-labels', () => {
            const {combinationChanged} = this._syncCombineWhenFull();
            if (combinationChanged) {
                this._shownInitially = false;
                this._windowPreviews.hideTooltip(false);
                this._windowPreviews.hide();
                this._queueRedisplay();
                this._syncDragEnabled();
            }
            for (const item of this._appButtons.values()) {
                this._syncItemLabel(item);
                this._updateGlassGeometry(item);
            }
            this.queueIconGeometryUpdate();
        });
        this._connect(
            this._settings,
            'changed::nautilus-places-enabled',
            () => this._syncFileManagerPlaces()
        );
        this._connect(
            this._settings,
            'changed::running-indicator-style',
            () => this.applyAppearance()
        );
        this._connect(
            this._settings,
            'changed::windows-xp-theme-enabled',
            () => this.applyAppearance()
        );
        for (const key of [
            'custom-indicator-colors-enabled',
            'focused-indicator-color',
            'unfocused-indicator-color',
        ]) {
            this._connect(this._settings, `changed::${key}`, () => {
                for (const item of this._appButtons.values())
                    this._syncIndicatorColor(item);
            });
        }
        this._connect(this._settings, 'changed::taskbar-locked', () => {
            this._syncDragEnabled();
        });
        this._connect(this.actor, 'notify::allocation', () => {
            this.queueIconGeometryUpdate();
        });
        this._connectActiveWorkspaceSignals();
        this._syncShowDesktopItem();
        this._syncApplicationVisibility();
    }

    destroy() {
        this._iconGeometryUpdatesEnabled = false;
        DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = null;
        this._clearExternalDragPlaceholder();
        if (this._iconGeometryUpdateId)
            GLib.Source.remove(this._iconGeometryUpdateId);
        this._iconGeometryUpdateId = 0;
        if (this._startupSettleId)
            GLib.Source.remove(this._startupSettleId);
        this._startupSettleId = 0;
        if (this._dragCursorResetId)
            GLib.Source.remove(this._dragCursorResetId);
        this._dragCursorResetId = 0;

        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];
        this._disconnectActiveWorkspaceSignals();

        for (const [app, id] of this._appSignals)
            app.disconnect(id);
        this._appSignals.clear();

        for (const item of [...this._auxiliaryItems])
            this.removeAuxiliaryItem(item);
        this._auxiliaryItems.clear();
        this._dragEndListeners.clear();

        this._removeShowDesktopItem();

        for (const item of this._appButtons.values()) {
            this._windowPreviews?.removeItem(item);
            this._destroyAppMenu(item._taskbarButton);
            item.destroy();
        }
        this._appButtons.clear();
        this.actor.destroy();
        this.actor = null;
        this._redisplayWorkId = 0;

        this._windowPreviews = null;
        this._alignmentActor = null;
        this._settings = null;
        this._appSystem = null;
        this._tracker = null;
        this._favorites = null;
        this._getInterestingWindows = null;
        this._onAppClicked = null;
        this._onWindowClicked = null;
        this._openNewWindow = null;
        this._onShowDesktopClicked = null;
        this._onShowDesktopModeChanged = null;
        this._showDesktopButton = null;
        this._showDesktopItem = null;
        this._showDesktopSlot = null;
        this._showDesktopDraggable = null;
        this._replaceShowDesktopButton = null;
        this._sessionOrder = null;
        this._auxiliaryItems = null;
        this._preserveItemWidths = false;
        this._activeWorkspace = null;
        this._activeWorkspaceSignalIds = null;
        this._shownInitially = false;
        this._availableWidth = 0;
        this._whenFullCombinedApps = null;
        this._startMenuOpen = false;
        this._appLabelWidth = APP_LABEL_WIDTH;
        this._startupSettling = false;
    }

    setAvailableWidth(width) {
        this._availableWidth = Math.max(0, Math.floor(width));
        if (this._syncCombineWhenFull().combinationChanged) {
            this._shownInitially = false;
            this._windowPreviews?.hideTooltip(false);
            this._windowPreviews?.hide();
            this._queueRedisplay();
            this._syncDragEnabled();
        }
    }

    setIconSize(iconSize) {
        this._iconSize = iconSize;
        for (const item of this._appButtons.values()) {
            item._taskbarIcon.icon_size = iconSize;
            this._updateGlassGeometry(item);
        }
        this.queueIconGeometryUpdate();
    }

    setStartMenuOpen(open) {
        if (this._startMenuOpen === open)
            return;

        this._startMenuOpen = open;
        this.syncButtonStates();
    }

    setPanelHeight(panelHeight) {
        this._panelHeight = panelHeight;
        for (const item of this._appButtons.values()) {
            item.set_height(panelHeight);
            item._taskbarButtonContent.set_height(
                this._buttonContentHeight()
            );
            this._updateGlassGeometry(item);
        }
        this._syncTaskbarEdgeSpacing();
        this.queueIconGeometryUpdate();
    }

    applyAppearance() {
        this.actor.set_style('spacing: 0;');
        this.actor.x_align = Clutter.ActorAlign.START;
        this._syncIndicatorStyle();
        for (const item of this._appButtons.values()) {
            this._syncIndicatorVisibility(item);
            this._updateGlassGeometry(item);
        }
        this._syncTaskbarEdgeSpacing();
        this.actor.queue_relayout();
    }

    _syncShowDesktopItem() {
        const hadItem = this._showDesktopItem !== null;
        const shouldShow =
            this._showDesktopButton !== null &&
            this._settings.get_boolean('windows-xp-theme-enabled') &&
            this._settings.get_boolean('show-desktop-button-visible') &&
            !this._settings.get_boolean('default-gnome-panel');
        if (shouldShow && !this._showDesktopItem)
            this._createShowDesktopItem();
        else if (!shouldShow && this._showDesktopItem)
            this._removeShowDesktopItem(true);

        if (!this._showDesktopItem) {
            if (hadItem) {
                this._queueRedisplay();
                this._onShowDesktopModeChanged();
            }
            return;
        }

        this._updateShowDesktopItemGeometry();
        this._syncShowDesktopDraggable();
        this._placeShowDesktopItem();
        this._syncTaskbarEdgeSpacing();
        if (!hadItem) {
            this._queueRedisplay();
            this._onShowDesktopModeChanged();
        }
    }

    _createShowDesktopItem() {
        const item = new TaskbarItemContainer();
        item.setPreserveNaturalWidth(this._preserveItemWidths);
        item.add_style_class_name('simple-taskbar-show-desktop-item');
        item.reactive = true;
        item.y_align = Clutter.ActorAlign.FILL;
        item.set_height(this._panelHeight);

        const slot = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: this._showDesktopSlotWidth(false),
            height: this._panelHeight,
            clip_to_allocation: false,
        });
        const parent = this._showDesktopButton.get_parent();
        if (parent)
            parent.remove_child(this._showDesktopButton);
        this._showDesktopButton.set_size(
            WINDOWS_XP_SHOW_DESKTOP_WIDTH,
            this._panelHeight
        );
        slot.add_child(this._showDesktopButton);
        item.setChild(slot);
        item._taskbarIsShowDesktop = true;
        item._taskbarButton = this._showDesktopButton;
        item._taskbarSlot = slot;
        this._showDesktopButton._delegate = {
            _taskbarItem: item,
        };
        this._showDesktopItem = item;
        this._showDesktopSlot = slot;
        this.actor.add_child(item);
        item.show(false);
    }

    _removeShowDesktopItem(replaceButton = false) {
        if (!this._showDesktopItem)
            return;

        const hadDraggable = this._showDesktopDraggable !== null;
        this._destroyShowDesktopDraggable();
        const item = this._showDesktopItem;
        const slot = this._showDesktopSlot;
        const button = this._showDesktopButton;
        if (button.get_parent() === slot)
            slot.remove_child(button);
        if (item.get_parent() === this.actor)
            this.actor.remove_child(item);
        if (slot.get_parent() === item)
            item.remove_child(slot);
        item.child = null;
        slot.destroy();
        item.destroy();
        button.set_size(-1, -1);
        button._delegate = null;
        this._showDesktopItem = null;
        this._showDesktopSlot = null;
        if (replaceButton && hadDraggable) {
            this._showDesktopButton =
                this._replaceShowDesktopButton(button);
        }
    }

    _updateShowDesktopItemGeometry(trailing = false) {
        if (!this._showDesktopItem)
            return;

        const slotWidth = this._showDesktopSlotWidth(trailing);
        this._showDesktopItem.set_height(this._panelHeight);
        this._showDesktopSlot.set_size(slotWidth, this._panelHeight);
        this._showDesktopButton.set_size(
            WINDOWS_XP_SHOW_DESKTOP_WIDTH,
            this._panelHeight
        );
    }

    _showDesktopSlotWidth(trailing) {
        const spacing = this._settings.get_int('icon-spacing');
        return WINDOWS_XP_SHOW_DESKTOP_WIDTH + spacing +
            (trailing && spacing < 0 ? -spacing : 0);
    }

    _syncShowDesktopDraggable() {
        const enabled = this._showDesktopItem !== null &&
            this._dragIsEnabled(this._showDesktopItem);
        if (enabled && !this._showDesktopDraggable) {
            const button = this._showDesktopButton;
            const item = this._showDesktopItem;
            button._delegate = {
                _taskbarItem: item,
                getDragActor: () => new Clutter.Clone({
                    source: button,
                }),
                getDragActorSource: () => button,
            };
            const draggable = DND.makeDraggable(button, {
                timeoutThreshold: 200,
            });
            this._showDesktopDraggable = draggable;
            this._showDesktopDragBeginId = draggable.connect(
                'drag-begin',
                () => {
                    this._dragging = true;
                    item.opacity = 96;
                    this._windowPreviews.hideTooltip(false);
                    this._windowPreviews.hide();
                }
            );
            this._showDesktopDragEndId = draggable.connect(
                'drag-end',
                () => {
                    this._resetDragCursor(draggable);
                    item.opacity = 255;
                    this._dragging = false;
                    this._queueRedisplay();
                    this._notifyDragEnd();
                }
            );
            return;
        }

        if (enabled || !this._showDesktopDraggable)
            return;

        this._removeShowDesktopItem(true);
        this._createShowDesktopItem();
        this._placeShowDesktopItem();
        this._syncTaskbarEdgeSpacing();
    }

    _destroyShowDesktopDraggable() {
        if (!this._showDesktopDraggable)
            return;

        const draggable = this._showDesktopDraggable;
        draggable.disconnect(this._showDesktopDragBeginId);
        draggable.disconnect(this._showDesktopDragEndId);
        this._showDesktopButton._delegate = null;
        this._showDesktopDraggable = null;
        this._showDesktopDragBeginId = 0;
        this._showDesktopDragEndId = 0;
        this._dragging = false;
    }

    _resetDragCursor(draggable) {
        if (draggable._updateCursor) {
            if (this._dragCursorResetId)
                GLib.Source.remove(this._dragCursorResetId);
            this._dragCursorResetId = GLib.idle_add_once(
                GLib.PRIORITY_DEFAULT_IDLE,
                () => {
                    this._dragCursorResetId = 0;
                    if (this._dragging)
                        return;

                    const grabActor = global.stage.get_grab_actor() || global.stage;
                    grabActor.set_cursor_type(Clutter.CursorType.DEFAULT);
                }
            );
            return;
        }

        global.display.set_cursor(Meta.Cursor.DEFAULT);
    }

    _placeShowDesktopItem() {
        if (!this._showDesktopItem ||
            this._showDesktopItem.get_parent() !== this.actor) {
            return;
        }

        const children = this.actor.get_children();
        const pinnedItems = children.filter(child =>
            child !== this._showDesktopItem &&
            child._taskbarIsLauncher &&
            !child.animatingOut
        );
        const position = Math.clamp(
            this._settings.get_int('windows-xp-show-desktop-position'),
            0,
            pinnedItems.length
        );
        const stationaryChildren = children.filter(child =>
            child !== this._showDesktopItem
        );
        const target = pinnedItems[position];
        const targetIndex = target
            ? stationaryChildren.indexOf(target)
            : pinnedItems.length > 0
                ? stationaryChildren.indexOf(
                    pinnedItems[pinnedItems.length - 1]
                ) + 1
                : 0;
        if (children.indexOf(this._showDesktopItem) !== targetIndex)
            this.actor.set_child_at_index(this._showDesktopItem, targetIndex);
    }

    _syncTaskbarEdgeSpacing() {
        let trailingItem = null;
        for (const child of this.actor.get_children()) {
            if (!child.animatingOut)
                trailingItem = child;
        }

        for (const item of this._appButtons.values()) {
            const trailingSpacing = item === trailingItem &&
                item._taskbarIsLauncher;
            if (item._taskbarTrailingSpacing === trailingSpacing)
                continue;

            item._taskbarTrailingSpacing = trailingSpacing;
            this._updateGlassGeometry(item);
        }

        this._updateShowDesktopItemGeometry(
            this._showDesktopItem === trailingItem
        );
    }

    _saveShowDesktopPinnedPosition() {
        if (!this._showDesktopItem)
            return;

        const children = this.actor.get_children();
        const showDesktopIndex = children.indexOf(this._showDesktopItem);
        const position = children.slice(0, showDesktopIndex)
            .filter(child => child._taskbarIsLauncher)
            .length;
        if (this._settings.get_int('windows-xp-show-desktop-position') !==
            position) {
            this._settings.set_int(
                'windows-xp-show-desktop-position',
                position
            );
        }
    }

    _handleShowDesktopDragOver(item, x) {
        const children = this.actor.get_children();
        const stationaryChildren = children.filter(child => child !== item);
        const pinnedItems = stationaryChildren.filter(child =>
            child._taskbarIsLauncher && !child.animatingOut
        );
        const targetPinnedIndex = pinnedItems.findIndex(child =>
            x < child.x + child.width / 2
        );
        const pinnedIndex = targetPinnedIndex < 0
            ? pinnedItems.length
            : targetPinnedIndex;
        const target = pinnedItems[pinnedIndex];
        const targetIndex = target
            ? stationaryChildren.indexOf(target)
            : pinnedItems.length > 0
                ? stationaryChildren.indexOf(
                    pinnedItems[pinnedItems.length - 1]
                ) + 1
                : 0;
        const sourceIndex = children.indexOf(item);
        if (sourceIndex !== targetIndex)
            this.actor.set_child_at_index(item, targetIndex);
        return DND.DragMotionResult.MOVE_DROP;
    }

    activateItem(item, interactionItem = item) {
        const app = item._taskbarApp;
        this._windowPreviews.hideTooltip();
        if (item._taskbarIsLauncher) {
            this._windowPreviews.hide();
            this._animatePinnedLaunch(item);
            this._openNewWindow(app);
            return false;
        }

        const targetWindow = item._taskbarWindow;
        if (!targetWindow && this._favorites.isFavorite(app.get_id()) &&
            this._interestingWindows(app).length === 0) {
            this._animatePinnedLaunch(item);
        }
        if (targetWindow) {
            this._windowPreviews.hide();
            this._onWindowClicked(targetWindow);
            return false;
        }

        const keepOpen = this._interestingWindows(app).length > 1 &&
            !this._settings.get_boolean('multi-window-click-spread');
        this._onAppClicked(interactionItem, app);
        return keepOpen;
    }

    handleItemMiddleClick(item) {
        const app = item._taskbarApp;
        this._windowPreviews.hideTooltip();
        this._windowPreviews.hide();
        if (this._settings.get_boolean('middle-click-close-apps')) {
            app.request_quit();
        } else {
            if (this._favorites.isFavorite(app.get_id()))
                this._animatePinnedLaunch(item);
            this._openNewWindow(app);
        }
    }

    popupItemMenu(item, button = item._taskbarButton) {
        this._popupAppMenu(button, item._taskbarApp, item);
    }

    handleItemHover(item, hovering, styleItem = item, retainForPreview = true) {
        if (this._dragging)
            return;

        if (hovering) {
            styleItem.add_style_pseudo_class('hover');
            const windowCount = item._taskbarIsLauncher
                ? 0
                : this._windowsForItem(item).length;
            if (this._windowPreviews.currentItem &&
                this._windowPreviews.currentItem !== item) {
                if (windowCount > 0)
                    this._windowPreviews.scheduleSwitch(item);
                else
                    this._windowPreviews.hide(true);
            } else {
                this._windowPreviews.schedule(item);
            }
            if (windowCount === 0)
                this._windowPreviews.scheduleTooltip(item);
            else
                this._windowPreviews.hideTooltip();
            return;
        }

        if (!retainForPreview || this._windowPreviews.hoverItem !== item)
            styleItem.remove_style_pseudo_class('hover');
        if (this._windowPreviews.tooltipItem === item)
            this._windowPreviews.hideTooltip();
        this._windowPreviews.scheduleClose();
    }

    _syncIndicatorStyle() {
        const rounded = this._settings.get_string(
            'running-indicator-style'
        ) === 'rounded';
        if (rounded)
            this.actor.add_style_class_name(ROUNDED_INDICATORS_CLASS);
        else
            this.actor.remove_style_class_name(ROUNDED_INDICATORS_CLASS);
    }

    redisplay() {
        if (this._dragging)
            return;

        if (this._settings.get_boolean('default-gnome-panel')) {
            this._clearAppButtons();
            return;
        }

        const {combinationChanged, labelWidthChanged} =
            this._syncCombineWhenFull();
        if (combinationChanged) {
            this._shownInitially = false;
            this._windowPreviews?.hideTooltip(false);
            this._windowPreviews?.hide();
            this._syncDragEnabled();
        }
        const entries = this._orderedEntries(this._startupSettling);
        const animateIndicators = this._shownInitially &&
            !this._startupSettling && !labelWidthChanged;
        const animateMembershipChanges = animateIndicators &&
            !this._suppressMembershipAnimation;
        this._suppressMembershipAnimation = false;
        const wantedKeys = new Set(entries.map(entry => entry.key));
        const wantedAppIds = new Set(
            entries.map(entry => entry.app.get_id())
        );

        for (const [key, item] of this._appButtons) {
            if (!wantedKeys.has(key)) {
                this._windowPreviews.removeItem(item);
                this._destroyAppMenu(item._taskbarButton);
                this._appButtons.delete(key);
                if (this._isPinnedPlaceholder(
                    item._taskbarApp,
                    item._taskbarWindow,
                    item._taskbarIsLauncher
                ) || !animateMembershipChanges) {
                    item.destroy();
                } else {
                    this._animateItemOutAndDestroy(item);
                }
            }
        }

        for (let index = 0; index < entries.length; index++) {
            const {
                key,
                app,
                window,
                isLauncher,
                isCombined,
                isPinnedPrimary,
            } = entries[index];
            const pinnedToRunningGap = isLauncher &&
                index + 1 < entries.length &&
                !entries[index + 1].isLauncher;
            let item = this._appButtons.get(key);
            if (!item) {
                item = this._createAppButton(
                    app,
                    window,
                    isLauncher,
                    isCombined,
                    isPinnedPrimary
                );
                this._trackApp(app);
                this._appButtons.set(key, item);
                this._syncButtonState(
                    item,
                    this._tracker?.focus_app,
                    global.display.focus_window,
                    false
                );
                this._placeItemAtActiveIndex(item, index);
                this._animateItemIn(
                    item,
                    animateMembershipChanges &&
                        !this._isPinnedPlaceholder(
                            app,
                            window,
                            isLauncher
                        )
                );
            } else {
                this._placeItemAtActiveIndex(item, index);
            }
            item._taskbarIsPinnedPrimary = isPinnedPrimary;

            if (item._taskbarPinnedToRunningGap !== pinnedToRunningGap) {
                item._taskbarPinnedToRunningGap = pinnedToRunningGap;
                this._updateGlassGeometry(item);
            }
        }

        for (const app of [...this._appSignals.keys()]) {
            if (!wantedAppIds.has(app.get_id()))
                this._untrackApp(app);
        }

        this._placeShowDesktopItem();
        this._syncTaskbarEdgeSpacing();
        this._shownInitially = true;
        this.syncButtonStates(animateIndicators);
        this.actor.queue_relayout();
        this.queueIconGeometryUpdate();
    }

    _syncApplicationVisibility() {
        const visible = !this._settings.get_boolean('default-gnome-panel');
        this.actor.visible = visible;
        if (!visible) {
            this._windowPreviews?.hideTooltip(false);
            this._windowPreviews?.hide();
            this._clearAppButtons();
            return;
        }

        this._queueRedisplay();
    }

    _clearAppButtons() {
        for (const item of this._appButtons.values()) {
            this._windowPreviews?.removeItem(item);
            this._untrackApp(item._taskbarApp);
            this._destroyAppMenu(item._taskbarButton);
            item.remove_all_transitions();
            item.destroy();
        }
        this._appButtons.clear();
        for (const child of this.actor.get_children()) {
            if (child === this._showDesktopItem)
                continue;
            child.remove_all_transitions();
            child.destroy();
        }
        this._sessionOrder = [];
        this._shownInitially = false;
    }

    syncButtonStates(animate = true) {
        const focusedApp = this._tracker?.focus_app;
        const focusedWindow = global.display.focus_window;
        for (const item of this._appButtons.values())
            this._syncButtonState(item, focusedApp, focusedWindow, animate);
    }

    _syncButtonState(item, focusedApp, focusedWindow, animate) {
        const app = item._taskbarApp;
        const window = item._taskbarWindow;
        const button = item._taskbarButton;
        const isLauncher = item._taskbarIsLauncher;
        const windowCount = isLauncher
            ? 0
            : this._windowsForItem(item).length;
        const running = !isLauncher && (window
            ? windowCount > 0
            : app.state === Shell.AppState.RUNNING && windowCount > 0);
        const hasFocus = !isLauncher && (window
            ? window === focusedWindow
            : app === focusedApp &&
                this._interestingWindows(app).includes(focusedWindow));
        const focused = hasFocus && !this._startMenuOpen;
        item.set_style_class_name(
            `dash-item-container simple-taskbar-app-item` +
            `${isLauncher ? ' simple-taskbar-app-launcher' : ''}` +
            `${running ? ' running' : ''}` +
            `${!isLauncher && !window && windowCount > 1
                ? ' multiple-windows'
                : ''}` +
            `${focused ? ' focused' : ''}`
        );
        item._taskbarFocused = focused;
        item._taskbarRunning = running;
        item._taskbarMultipleWindows = !window && windowCount > 1;
        item._taskbarShowSecondary =
            !window && focused && windowCount > 1;
        this._updateIndicatorGeometry(item, animate);
        this._syncIndicatorColor(item);
        button.accessible_name = window
            ? `${window.get_title() || app.get_name()}, ${_('running')}`
            : running
                ? `${app.get_name()}, ${_('running')}`
                : app.get_name();
        this._syncItemLabel(item);

        if (focused)
            button.add_style_pseudo_class('selected');
        else
            button.remove_style_pseudo_class('selected');
    }

    queueIconGeometryUpdate() {
        if (!this._iconGeometryUpdatesEnabled || this._iconGeometryUpdateId)
            return;

        this._iconGeometryUpdateId = GLib.idle_add(
            GLib.PRIORITY_LOW,
            () => {
                this._iconGeometryUpdateId = 0;
                this.updateWindowIconGeometries();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    updateWindowIconGeometries() {
        for (const item of this._appButtons.values())
            this._updateItemIconGeometry(item);
    }

    updateAppIconGeometry(app) {
        if (!app)
            return;

        for (const item of this._appButtons.values()) {
            if (item._taskbarApp === app)
                this._updateItemIconGeometry(item);
        }
    }

    _updateItemIconGeometry(item) {
        const icon = item?._taskbarIcon;
        if (!icon?.get_stage() || !icon.has_allocation())
            return;

        const [x, y] = icon.get_transformed_position();
        const [width, height] = icon.get_transformed_size();
        if (width <= 0 || height <= 0)
            return;

        const geometry = new Mtk.Rectangle();
        geometry.x = Math.round(x);
        geometry.y = Math.round(y);
        geometry.width = Math.max(1, Math.round(width));
        geometry.height = Math.max(1, Math.round(height));
        const monitor = Main.layoutManager.findMonitorForActor(this.actor);
        const monitorScoped =
            this._settings.get_boolean('multi-monitor-panels') &&
            Main.layoutManager.monitors.length > 1;
        for (const window of this._windowsForItem(item)) {
            if (monitorScoped && monitor &&
                window.get_monitor() !== monitor.index)
                continue;
            window.set_icon_geometry(geometry);
        }
    }

    _sameTaskbarDragGroup(left, right) {
        return left._taskbarApp === right._taskbarApp &&
            left._taskbarIsLauncher === right._taskbarIsLauncher &&
            left._taskbarIsPinnedPrimary === right._taskbarIsPinnedPrimary;
    }

    _isPinnedTaskbarItem(item) {
        return item._taskbarIsLauncher ||
            (item._taskbarIsPinnedPrimary &&
                this._isPersistentPinned(item._taskbarApp));
    }

    _isRunningTaskbarItem(item) {
        return !item._taskbarIsLauncher &&
            !item._taskbarIsPinnedPrimary;
    }

    _taskbarDragGroups() {
        const groups = [];
        for (const child of this.actor.get_children()) {
            if (child === this._showDesktopItem ||
                child === this._externalDragPlaceholder ||
                !child._taskbarApp || child.animatingOut) {
                continue;
            }

            const group = groups.find(existing =>
                this._sameTaskbarDragGroup(existing.items[0], child)
            );
            if (group)
                group.items.push(child);
            else
                groups.push({items: [child]});
        }
        return groups;
    }

    _reorderTaskbarGroup(item, x) {
        const groups = this._taskbarDragGroups();
        const sourceGroup = groups.find(group =>
            group.items.includes(item)
        );
        if (!sourceGroup)
            return false;

        const sourceIsPinned = this._isPinnedTaskbarItem(item);
        const targetGroups = groups.filter(group => {
            if (group === sourceGroup)
                return false;

            const target = group.items[0];
            return sourceIsPinned
                ? this._isPinnedTaskbarItem(target)
                : this._isRunningTaskbarItem(target);
        });
        if (targetGroups.length === 0)
            return false;

        let targetGroup = targetGroups.find(group => {
            const first = group.items[0];
            const last = group.items.at(-1);
            const groupStart = first.x;
            const groupEnd = last.x + last.width;
            return x < groupStart + (groupEnd - groupStart) / 2;
        });
        const insertBefore = targetGroup !== undefined;
        if (!targetGroup)
            targetGroup = targetGroups.at(-1);

        return this._reorderTaskbarGroups(
            sourceGroup,
            targetGroup,
            insertBefore
        );
    }

    reorderTaskbarItem(sourceItem, targetItem, insertBefore) {
        const groups = this._taskbarDragGroups();
        const sourceGroup = groups.find(group =>
            group.items.includes(sourceItem)
        );
        const targetGroup = groups.find(group =>
            group.items.includes(targetItem)
        );
        if (!sourceGroup || !targetGroup || sourceGroup === targetGroup)
            return false;

        const sourceIsPinned = this._isPinnedTaskbarItem(sourceGroup.items[0]);
        const targetIsPinned = this._isPinnedTaskbarItem(targetGroup.items[0]);
        if (sourceIsPinned !== targetIsPinned)
            return false;

        return this._reorderTaskbarGroups(
            sourceGroup,
            targetGroup,
            insertBefore
        );
    }

    _reorderTaskbarGroups(sourceGroup, targetGroup, insertBefore) {
        const sourceItems = new Set(sourceGroup.items);
        const children = this.actor.get_children();
        const remainingChildren = children.filter(child =>
            !sourceItems.has(child)
        );
        const target = insertBefore
            ? targetGroup.items[0]
            : targetGroup.items.at(-1);
        const targetIndex = remainingChildren.indexOf(target);
        const insertIndex = targetIndex + (insertBefore ? 0 : 1);
        const desiredChildren = [...remainingChildren];
        desiredChildren.splice(insertIndex, 0, ...sourceGroup.items);
        let changed = false;

        for (let index = 0; index < desiredChildren.length; index++) {
            const child = desiredChildren[index];
            if (this.actor.get_child_at_index(index) === child)
                continue;

            this.actor.set_child_at_index(child, index);
            changed = true;
        }
        return changed;
    }

    _getRunningTaskbarOrder() {
        const order = [];
        const seen = new Set();
        for (const group of this._taskbarDragGroups()) {
            const item = group.items[0];
            if (!this._isRunningTaskbarItem(item))
                continue;

            const appId = item._taskbarApp.get_id();
            if (seen.has(appId))
                continue;

            seen.add(appId);
            order.push(appId);
        }
        return order;
    }

    _getPinnedTaskbarOrder() {
        const order = [];
        const seen = new Set();
        for (const group of this._taskbarDragGroups()) {
            const item = group.items[0];
            if (!this._isPinnedTaskbarItem(item))
                continue;

            const appId = item._taskbarApp.get_id();
            if (seen.has(appId))
                continue;

            seen.add(appId);
            order.push(appId);
        }
        return order;
    }

    handleDragOver(source, _actor, x, _y, _time) {
        if (source && source._startMenuTaskbarApp)
            return this._handleStartMenuDragOver(source, x);

        if (!this._dragIsEnabled(source?._taskbarItem)) {
            return DND.DragMotionResult.NO_DROP;
        }

        const item = source?._taskbarItem;
        if (!item || item.get_parent() !== this.actor)
            return DND.DragMotionResult.CONTINUE;

        if (item._taskbarIsShowDesktop)
            return this._handleShowDesktopDragOver(item, x);

        if (!this._isPinnedTaskbarItem(item) &&
            !this._isRunningTaskbarItem(item)) {
            return DND.DragMotionResult.NO_DROP;
        }

        this._reorderTaskbarGroup(item, x);

        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source, _actor, _x, _y, _time) {
        if (source && source._startMenuTaskbarApp)
            return this._acceptStartMenuDrop(source);

        if (!this._dragIsEnabled(source?._taskbarItem)) {
            return false;
        }

        const item = source?._taskbarItem;
        if (!item || item.get_parent() !== this.actor)
            return false;

        if (item._taskbarIsShowDesktop) {
            this._saveShowDesktopPinnedPosition();
            source._taskbarDropAccepted = true;
            source._taskbarDropTarget = this;
            return true;
        }

        const accepted = this.acceptTaskbarItemDrop(item, source);
        if (accepted)
            source._taskbarDropTarget = this;
        return accepted;
    }

    acceptTaskbarItemDrop(item, source = null) {
        if (!this._isPinnedTaskbarItem(item) &&
            !this._isRunningTaskbarItem(item)) {
            return false;
        }

        const appId = item._taskbarApp.get_id();
        if (this._isPinnedTaskbarItem(item)) {
            if (global.settings.is_writable('favorite-apps')) {
                const favoriteIndex = this._getPinnedTaskbarOrder()
                    .indexOf(appId);
                if (favoriteIndex >= 0)
                    this._favorites.moveFavoriteToPos(appId, favoriteIndex);
            }
        } else {
            this._sessionOrder = this._getRunningTaskbarOrder();
        }

        this._saveShowDesktopPinnedPosition();
        if (source)
            source._taskbarDropAccepted = true;
        return true;
    }

    _handleStartMenuDragOver(source, x) {
        if (!this._canAcceptStartMenuDrop(source)) {
            if (source._taskbarDropTarget === this)
                source._clearTaskbarDropTarget();
            return DND.DragMotionResult.NO_DROP;
        }

        if (source._taskbarDropTarget !== this) {
            source._clearTaskbarDropTarget();
            source._taskbarDropTarget = this;
            source._clearTaskbarDropTarget = () => {
                this._clearExternalDragPlaceholder();
                if (source._taskbarDropTarget === this)
                    source._taskbarDropTarget = null;
            };
        }
        this._activatePanelDropTarget();

        const appId = source.app.get_id();
        const favoriteItems = [];
        const seen = new Set();
        for (const child of this.actor.get_children()) {
            if (child === this._externalDragPlaceholder)
                continue;
            const childId = child._taskbarApp
                ? child._taskbarApp.get_id()
                : null;
            if (!childId || childId === appId || seen.has(childId) ||
                !this._favorites.isFavorite(childId) ||
                this._usePinnedAppLaunchers() && !child._taskbarIsLauncher) {
                continue;
            }
            seen.add(childId);
            favoriteItems.push(child);
        }

        if (!this._externalDragFavoriteCenters) {
            this._externalDragFavoriteCenters = favoriteItems.map(item => {
                const [itemX] = item.get_transformed_position();
                const [itemWidth] = item.get_transformed_size();
                return itemX + itemWidth / 2;
            });
        }
        const [actorX] = this.actor.get_transformed_position();
        const stageX = actorX + x;
        let favoriteIndex = this._externalDragFavoriteCenters.findIndex(
            center => stageX < center
        );
        if (favoriteIndex < 0)
            favoriteIndex = favoriteItems.length;

        this._showExternalDragPlaceholder(favoriteItems, favoriteIndex);
        return DND.DragMotionResult.COPY_DROP;
    }

    _acceptStartMenuDrop(source) {
        if (!this._canAcceptStartMenuDrop(source) ||
            source._taskbarDropTarget !== this ||
            !this._externalDragPlaceholder) {
            return false;
        }

        const appId = source.app.get_id();
        const favoriteIndex = this._externalDragFavoriteIndex;
        source._taskbarDropAccepted = true;
        source._clearTaskbarDropTarget();
        if (this._favorites.isFavorite(appId))
            this._favorites.moveFavoriteToPos(appId, favoriteIndex);
        else
            this._favorites.addFavoriteAtPos(appId, favoriteIndex);
        return true;
    }

    _canAcceptStartMenuDrop(source) {
        return Boolean(
            source.app &&
            !source.app.is_window_backed() &&
            !this._favorites.isFavorite(source.app.get_id()) &&
            !this._settings.get_boolean('taskbar-locked') &&
            !this._settings.get_boolean('default-gnome-panel') &&
            !this._settings.get_boolean('hide-pinned-taskbar-apps') &&
            global.settings.is_writable('favorite-apps') &&
            this.actor.visible
        );
    }

    _showExternalDragPlaceholder(favoriteItems, favoriteIndex) {
        if (!this._externalDragPlaceholder) {
            const reference = favoriteItems[0];
            this._externalDragPlaceholder = new St.Widget({
                style_class: 'simple-taskbar-drag-placeholder',
                width: Math.max(
                    reference ? reference.width : 0,
                    this._iconSize + 8
                ),
                height: Math.max(1, this._panelHeight - 10),
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.actor.add_child(this._externalDragPlaceholder);
        }

        if (favoriteIndex === this._externalDragFavoriteIndex)
            return;

        this._externalDragFavoriteIndex = favoriteIndex;
        const beforeItem = favoriteItems[favoriteIndex] ?? null;
        const children = this.actor.get_children().filter(child =>
            child !== this._externalDragPlaceholder
        );
        let actorIndex;
        if (beforeItem) {
            actorIndex = children.indexOf(beforeItem);
        } else if (favoriteItems.length > 0) {
            actorIndex = children.indexOf(favoriteItems.at(-1)) + 1;
        } else {
            actorIndex = 0;
        }
        this.actor.set_child_at_index(
            this._externalDragPlaceholder,
            actorIndex
        );
    }

    _clearExternalDragPlaceholder() {
        if (this._externalDragPlaceholder)
            this._externalDragPlaceholder.destroy();
        this._externalDragPlaceholder = null;
        this._externalDragFavoriteIndex = -1;
        this._externalDragFavoriteCenters = null;
        this._restorePanelDropTarget();
    }

    _onDragMotion(event) {
        const source = event.source;
        if (!source || !source._startMenuTaskbarApp)
            return DND.DragMotionResult.CONTINUE;

        if (!this._stagePointIsInPanel(event.x, event.y)) {
            if (source._taskbarDropTarget === this)
                source._clearTaskbarDropTarget();
            return DND.DragMotionResult.CONTINUE;
        }

        const [, x] = this.actor.transform_stage_point(event.x, event.y);
        return this._handleStartMenuDragOver(source, x);
    }

    _activatePanelDropTarget() {
        if (this._panelDropActor)
            return;

        const panelActor = this._alignmentActor.get_parent();
        this._panelDropActor = panelActor;
        this._previousPanelDropDelegate = panelActor._delegate ?? null;
        panelActor._delegate = this;
    }

    _restorePanelDropTarget() {
        if (!this._panelDropActor)
            return;

        if (this._panelDropActor._delegate === this) {
            this._panelDropActor._delegate =
                this._previousPanelDropDelegate;
        }
        this._panelDropActor = null;
        this._previousPanelDropDelegate = null;
    }

    _stagePointIsInPanel(x, y) {
        const monitor = Main.layoutManager.findMonitorForActor(this.actor);
        if (!monitor)
            return false;

        const [, actorY] = this.actor.get_transformed_position();
        const [, actorHeight] = this.actor.get_transformed_size();
        const panelHeight = Math.max(actorHeight, this._panelHeight);
        return x >= monitor.x && x < monitor.x + monitor.width &&
            y >= actorY && y < actorY + panelHeight;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _queueRedisplay() {
        if (this._startupSettling && !Main.layoutManager._startingUp) {
            this._scheduleStartupSettle();
            return;
        }

        if (this._redisplayWorkId)
            Main.queueDeferredWork(this._redisplayWorkId);
    }

    _notifyDragEnd() {
        for (const listener of [...this._dragEndListeners])
            listener();
    }

    _scheduleStartupSettle() {
        if (!this._startupSettling)
            return;

        if (this._startupSettleId)
            GLib.Source.remove(this._startupSettleId);
        this._startupSettleId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            STARTUP_SETTLE_DELAY,
            () => {
                this._startupSettleId = 0;
                this._startupSettling = false;
                // Initial discovery should not animate as a new launch.
                this._shownInitially = false;
                this._queueRedisplay();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _connectActiveWorkspaceSignals() {
        this._disconnectActiveWorkspaceSignals();
        const workspace = global.workspace_manager.get_active_workspace();
        if (!workspace)
            return;

        this._activeWorkspace = workspace;
        for (const signal of ['window-added', 'window-removed']) {
            this._activeWorkspaceSignalIds.push(
                workspace.connect(signal, () => {
                    this._refreshWorkspaceIsolation();
                })
            );
        }
    }

    _disconnectActiveWorkspaceSignals() {
        for (const id of this._activeWorkspaceSignalIds ?? []) {
            if (id)
                this._activeWorkspace?.disconnect(id);
        }
        this._activeWorkspaceSignalIds = [];
        this._activeWorkspace = null;
    }

    _refreshWorkspaceIsolation(force = false, suppressAnimations = false) {
        if (!force &&
            !this._settings.get_boolean('isolate-workspaces') &&
            !this._settings.get_boolean('isolate-monitors')) {
            return;
        }

        this._windowPreviews?.hideTooltip(false);
        this._windowPreviews?.hide();
        if (suppressAnimations)
            this._shownInitially = false;
        for (const item of this.getItems())
            item._taskbarButton._taskbarMenu?.syncWindowScope();
        this._queueRedisplay();
    }

    _interestingWindows(app) {
        return this._getInterestingWindows(app);
    }

    closeApp(app, timestamp) {
        if (!this._settings.get_boolean('isolate-workspaces') &&
            !this._settings.get_boolean('isolate-monitors')) {
            app.request_quit();
            return;
        }

        for (const window of this._interestingWindows(app)) {
            if (window.get_compositor_private() !== null)
                window.delete(timestamp);
        }
    }

    _windowsForItem(item) {
        if (item._taskbarIsLauncher)
            return [];

        const window = item._taskbarWindow;
        if (!window)
            return this._interestingWindows(item._taskbarApp);

        return this._interestingWindows(item._taskbarApp).includes(window)
            ? [window]
            : [];
    }

    _isPinnedPlaceholder(app, window, isLauncher = false) {
        return !window &&
            this._favorites.isFavorite(app.get_id()) &&
            !this._settings.get_boolean('hide-pinned-taskbar-apps') &&
            (!this._usePinnedAppLaunchers() || isLauncher);
    }

    _isPersistentPinned(app) {
        const appId = app?.get_id();
        return Boolean(appId) && this._favorites.isFavorite(appId) &&
            !this._settings.get_boolean('hide-pinned-taskbar-apps');
    }

    _usePinnedAppLaunchers() {
        return this._settings.get_boolean('use-pinned-apps-as-launchers');
    }

    _pinnedApps() {
        if (this._settings.get_boolean('hide-pinned-taskbar-apps'))
            return [];

        const apps = [];
        const seen = new Set();
        for (const app of this._favorites.getFavorites()) {
            const id = app.get_id();
            if (!id || seen.has(id))
                continue;

            seen.add(id);
            apps.push(app);
        }
        return apps;
    }

    _orderedApps(pinnedOnly = false) {
        const seen = new Set();
        const runningApps = pinnedOnly ? [] : this._getRunningApps();
        const pinnedApps = this._pinnedApps();

        for (const app of pinnedApps) {
            const id = app.get_id();
            if (!id || seen.has(id))
                continue;

            seen.add(id);
        }

        const unpinnedApps = runningApps.filter(app => {
            const id = app.get_id();
            if (!id || seen.has(id))
                return false;

            seen.add(id);
            return true;
        });
        const usePinnedAppLaunchers = this._usePinnedAppLaunchers();
        const orderPinnedRunningApps = usePinnedAppLaunchers ||
            this._combineMode() !== 'always';
        const appsToOrder = orderPinnedRunningApps
            ? runningApps
            : unpinnedApps;
        const visibleRunningIds = new Set(
            appsToOrder.map(app => app.get_id())
        );
        this._sessionOrder = this._sessionOrder.filter(appId =>
            visibleRunningIds.has(appId)
        );

        const orderedIds = new Set(this._sessionOrder);
        for (const app of appsToOrder) {
            const appId = app.get_id();
            if (orderedIds.has(appId))
                continue;

            this._sessionOrder.push(appId);
            orderedIds.add(appId);
        }

        const positions = new Map(
            this._sessionOrder.map((id, index) => [id, index])
        );
        const orderedRunningApps = [...appsToOrder].sort((a, b) =>
            positions.get(a.get_id()) - positions.get(b.get_id())
        );
        if (!usePinnedAppLaunchers)
            return [
                ...pinnedApps,
                ...unpinnedApps.sort((a, b) =>
                    positions.get(a.get_id()) - positions.get(b.get_id())
                ),
            ];

        return [...pinnedApps, ...orderedRunningApps];
    }

    _orderedEntries(pinnedOnly = false) {
        const apps = this._orderedApps(pinnedOnly);
        const usePinnedAppLaunchers = this._usePinnedAppLaunchers();
        const launcherCount = usePinnedAppLaunchers
            ? this._pinnedApps().length
            : 0;
        if (this._combineAppButtons()) {
            return apps.map((app, index) => {
                const isLauncher = index < launcherCount;
                return {
                    key: isLauncher
                        ? `launcher:${app.get_id()}`
                        : usePinnedAppLaunchers
                            ? `app:${app.get_id()}`
                            : app.get_id(),
                    app,
                    window: null,
                    isLauncher,
                    isPinnedPrimary: !usePinnedAppLaunchers &&
                        this._isPersistentPinned(app),
                };
            });
        }

        const combinedAppIds = this._combineMode() === 'when-full'
            ? this._whenFullCombinedApps
            : new Set();
        return this._uncombinedEntries(apps, launcherCount, combinedAppIds);
    }

    _uncombinedEntries(apps, launcherCount = 0, combinedAppIds = new Set()) {
        if (!this._usePinnedAppLaunchers())
            return this._uncombinedWindowEntries(apps, combinedAppIds);

        const entries = [];
        for (let index = 0; index < apps.length; index++) {
            const app = apps[index];
            const isLauncher = index < launcherCount;
            if (isLauncher) {
                entries.push({
                    key: `launcher:${app.get_id()}`,
                    app,
                    window: null,
                    isLauncher: true,
                    isPinnedPrimary: false,
                });
                continue;
            }

            if (combinedAppIds.has(app.get_id())) {
                entries.push({
                    key: `app:${app.get_id()}`,
                    app,
                    window: null,
                    isLauncher: false,
                    isCombined: true,
                    isPinnedPrimary: false,
                });
                continue;
            }

            const windows = this._interestingWindows(app).sort((a, b) =>
                a.get_stable_sequence() - b.get_stable_sequence()
            );
            if (windows.length === 0) {
                entries.push({
                    key: app.get_id(),
                    app,
                    window: null,
                    isLauncher: false,
                    isPinnedPrimary: false,
                });
                continue;
            }

            for (const window of windows) {
                entries.push({
                    key: `window:${window.get_stable_sequence()}`,
                    app,
                    window,
                    isLauncher: false,
                    isPinnedPrimary: false,
                });
            }
        }
        return entries;
    }

    _uncombinedWindowEntries(apps, combinedAppIds = new Set()) {
        const pinnedEntries = [];
        const runningGroups = new Map();
        for (const app of apps) {
            const windows = this._interestingWindows(app).sort((a, b) =>
                a.get_stable_sequence() - b.get_stable_sequence()
            );
            const isPinned = this._isPersistentPinned(app);

            if (combinedAppIds.has(app.get_id())) {
                const entry = {
                    key: `app:${app.get_id()}`,
                    app,
                    window: null,
                    isLauncher: false,
                    isCombined: true,
                    isPinnedPrimary: isPinned,
                };
                if (isPinned)
                    pinnedEntries.push(entry);
                else
                    runningGroups.set(app.get_id(), [entry]);
                continue;
            }

            if (!isPinned) {
                runningGroups.set(app.get_id(), windows.map(window => ({
                    key: `window:${window.get_stable_sequence()}`,
                    app,
                    window,
                    isLauncher: false,
                    isPinnedPrimary: false,
                })));
                continue;
            }

            if (windows.length === 0) {
                pinnedEntries.push({
                    key: app.get_id(),
                    app,
                    window: null,
                    isLauncher: false,
                    isPinnedPrimary: true,
                });
                continue;
            }

            const [firstWindow, ...remainingWindows] = windows;
            pinnedEntries.push({
                key: `window:${firstWindow.get_stable_sequence()}`,
                app,
                window: firstWindow,
                isLauncher: false,
                isPinnedPrimary: true,
            });
            if (remainingWindows.length > 0) {
                runningGroups.set(app.get_id(), remainingWindows.map(window => ({
                    key: `window:${window.get_stable_sequence()}`,
                    app,
                    window,
                    isLauncher: false,
                    isPinnedPrimary: false,
                })));
            }
        }

        const positions = new Map(
            this._sessionOrder.map((id, index) => [id, index])
        );
        const orderedRunningGroups = [...runningGroups.entries()]
            .sort((left, right) =>
                positions.get(left[0]) - positions.get(right[0])
            )
            .map(([, entries]) => entries)
            .flat();
        return [...pinnedEntries, ...orderedRunningGroups];
    }

    _combineMode() {
        return this._settings.get_string('combine-app-buttons-mode');
    }

    _combineAppButtons() {
        return this._combineMode() === 'always';
    }

    _syncCombineWhenFull() {
        let combinedAppIds = new Set();
        let labelWidth = APP_LABEL_WIDTH;
        if (this._combineMode() === 'when-full' &&
            this._availableWidth > 0) {
            const layout = this._calculateWhenFullLayout();
            combinedAppIds = layout.combinedAppIds;
        }

        const combinationChanged = !this._sameAppIdSet(
            combinedAppIds,
            this._whenFullCombinedApps
        );
        const labelWidthChanged = labelWidth !== this._appLabelWidth;
        if (!combinationChanged && !labelWidthChanged)
            return {combinationChanged: false, labelWidthChanged: false};

        this._whenFullCombinedApps = combinedAppIds;
        this._appLabelWidth = labelWidth;
        if (labelWidthChanged)
            this._applyCurrentButtonWidths();
        return {combinationChanged, labelWidthChanged};
    }

    _calculateWhenFullLayout() {
        const pinnedApps = this._pinnedApps();
        const apps = this._orderedApps(this._startupSettling);
        const launcherCount = this._usePinnedAppLaunchers()
            ? pinnedApps.length
            : 0;
        const entries = this._uncombinedEntries(
            apps,
            launcherCount
        );
        const showLabels = !this._settings.get_boolean('hide-app-labels');
        if (this._entriesWidth(entries, showLabels) <= this._availableWidth)
            return {combinedAppIds: new Set()};

        const candidates = [];
        const candidateIds = new Set();
        for (let index = 0; index < apps.length; index++) {
            const app = apps[index];
            const appId = app.get_id();
            if (candidateIds.has(appId))
                continue;

            const windowCount = this._interestingWindows(app).length;
            if (windowCount < 2)
                continue;

            candidateIds.add(appId);
            candidates.push({appId, index, windowCount});
        }

        candidates.sort((a, b) =>
            b.windowCount - a.windowCount || a.index - b.index
        );

        const combinedAppIds = new Set();
        for (const candidate of candidates) {
            combinedAppIds.add(candidate.appId);
            const groupedEntries = this._uncombinedEntries(
                apps,
                launcherCount,
                combinedAppIds
            );
            if (this._entriesWidth(groupedEntries, showLabels) <=
                this._availableWidth) {
                break;
            }
        }

        return {combinedAppIds};
    }

    _entriesWidth(entries, showLabels) {
        return entries.reduce((width, entry, index) => {
            const entryShowLabels = showLabels &&
                (Boolean(entry.window) || entry.isCombined);
            const pinnedToRunningGap = entry.isLauncher &&
                index + 1 < entries.length &&
                !entries[index + 1].isLauncher;
            const transitionGap =
                this._settings.get_boolean('windows-xp-theme-enabled') &&
                pinnedToRunningGap
                    ? WINDOWS_XP_PINNED_TO_RUNNING_GAP
                    : 0;
            const iconSpacing = this._iconSpacing(entry.isLauncher);
            const trailingSpacing = index + 1 === entries.length &&
                iconSpacing < 0
                ? -iconSpacing
                : 0;
            return width + this._buttonWidth(
                entry.window,
                entryShowLabels,
                APP_LABEL_WIDTH,
                entry.isCombined
            ) + iconSpacing + transitionGap + trailingSpacing;
        }, 0);
    }

    _sameAppIdSet(left, right) {
        if (left.size !== right.size)
            return false;

        return [...left].every(appId => right.has(appId));
    }

    _showAppLabels() {
        return this._combineMode() !== 'always' &&
            !this._settings.get_boolean('hide-app-labels');
    }

    _hasItemsForApp(appId) {
        return [...this._appButtons.values()].some(item =>
            item._taskbarApp.get_id() === appId
        );
    }

    _getRunningApps() {
        const apps = [];
        const seen = new Set();

        for (const windowActor of global.get_window_actors()) {
            const window = windowActor.meta_window;
            if (!window || window.skip_taskbar) {
                continue;
            }

            const app = this._tracker.get_window_app(window);
            const appId = app?.get_id();
            if (!appId || seen.has(appId) ||
                this._interestingWindows(app).length === 0) {
                continue;
            }

            seen.add(appId);
            apps.push(app);
        }
        return apps;
    }

    _createAppButton(
        app,
        window = null,
        isLauncher = false,
        isCombined = false,
        isPinnedPrimary = false
    ) {
        const glassWidth = this._buttonWidth(
            window,
            this._showAppLabels(),
            this._appLabelWidth,
            isCombined
        );
        const slotWidth = this._itemSlotWidth(
            window,
            isLauncher,
            false,
            isCombined
        );
        const glassHeight = this._glassHeight();
        const glassInset = this._glassInset();
        const glassContentWidth = glassWidth - glassInset * 2;
        const glassContentHeight = glassHeight - glassInset * 2;
        const glassY = this._glassY();
        const item = new TaskbarItemContainer();
        item.setPreserveNaturalWidth(this._preserveItemWidths);
        item.add_style_class_name('simple-taskbar-app-item');
        item.reactive = true;
        item.track_hover = true;
        item.y_align = Clutter.ActorAlign.FILL;
        item.set_height(this._panelHeight);
        item.connect('notify::allocation', () => {
            this.queueIconGeometryUpdate();
        });
        const slot = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: slotWidth,
            height: this._panelHeight,
            clip_to_allocation: false,
        });
        const visual = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            height: this._panelHeight,
            clip_to_allocation: false,
        });
        visual.set_pivot_point(0.5, 0.5);
        const glassHost = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            height: this._panelHeight,
            clip_to_allocation: false,
        });
        const glass = new St.Widget({
            style_class: 'simple-taskbar-app-glass',
            x: glassInset,
            y: glassY + glassInset,
            width: glassContentWidth,
            height: glassContentHeight,
        });
        const glassBorder = new St.Widget({
            style_class: 'simple-taskbar-app-glass-border',
            x: 0,
            y: glassY,
            width: glassWidth,
            height: glassHeight,
        });
        const glassTexture = new St.Widget({
            style_class: 'simple-taskbar-app-glass-texture',
            x: glassInset,
            y: glassY + glassInset,
            width: glassContentWidth,
            height: glassContentHeight,
        });
        glassTexture.set_style(
            `background-size: ${glassContentWidth}px ${glassContentHeight}px;`
        );
        glassHost.add_child(glass);
        glassHost.add_child(glassTexture);
        glassHost.add_child(glassBorder);
        const layout = new St.Widget({
            layout_manager: new Clutter.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
            }),
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        const topSpacer = new St.Widget({height: 7});
        const content = new St.Widget({
            style_class: 'simple-taskbar-app-content',
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_expand: true,
        });
        const icon = app.create_icon_texture(this._iconSize);
        icon.x_align = Clutter.ActorAlign.CENTER;
        icon.y_align = Clutter.ActorAlign.CENTER;
        const buttonContent = new St.BoxLayout({
            style_class: 'simple-taskbar-app-button-content',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            height: this._buttonContentHeight(),
        });
        buttonContent.add_child(icon);
        const label = new St.Label({
            style_class: 'simple-taskbar-app-label',
            text: window?.get_title() || app.get_name(),
            width: this._labelWidthForButton(window, isCombined),
            y_align: Clutter.ActorAlign.CENTER,
            visible: (Boolean(window) || isCombined) &&
                this._showAppLabels(),
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        buttonContent.add_child(label);
        content.add_child(buttonContent);

        const button = new St.Button({
            style_class: 'simple-taskbar-app-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            accessible_name: app.get_name(),
            child: layout,
        });
        const indicator = new St.Widget({
            style_class: 'simple-taskbar-running-indicator',
            x_align: Clutter.ActorAlign.CENTER,
        });
        const indicatorPrimary = new St.Widget({
            style_class: 'simple-taskbar-running-indicator-segment',
        });
        const indicatorSecondary = new St.Widget({
            style_class: 'simple-taskbar-running-indicator-segment',
            visible: false,
        });
        indicator.add_child(indicatorPrimary);
        indicator.add_child(indicatorSecondary);
        layout.add_child(topSpacer);
        layout.add_child(content);
        layout.add_child(indicator);
        visual.add_child(glassHost);
        visual.add_child(button);
        slot.add_child(visual);
        item.setChild(slot);

        item._taskbarApp = app;
        item._taskbarWindow = window;
        item._taskbarIsLauncher = isLauncher;
        item._taskbarIsCombinedApp = isCombined;
        item._taskbarIsPinnedPrimary = isPinnedPrimary;
        item._taskbarPinnedToRunningGap = false;
        item._taskbarTrailingSpacing = false;
        item._taskbarButton = button;
        item._taskbarButtonContent = buttonContent;
        item._taskbarIcon = icon;
        item._taskbarLabel = label;
        item._taskbarSlot = slot;
        item._taskbarVisual = visual;
        item._taskbarGlassHost = glassHost;
        item._taskbarGlass = glass;
        item._taskbarGlassTexture = glassTexture;
        item._taskbarGlassBorder = glassBorder;
        item._taskbarIndicator = indicator;
        item._taskbarIndicatorPrimary = indicatorPrimary;
        item._taskbarIndicatorSecondary = indicatorSecondary;
        this._syncLauncherIconPosition(item);
        item._taskbarFocused = false;
        item._taskbarRunning = false;
        item._taskbarMultipleWindows = false;
        item._taskbarShowSecondary = false;
        this._syncIndicatorVisibility(item);
        this._updateIndicatorGeometry(item, false, glassWidth);
        if (window) {
            window.connectObject(
                'notify::title',
                () => this._syncItemLabel(item),
                item
            );
        }

        item.connect('notify::hover', () => {
            this.handleItemHover(item, item.hover);
        });

        this._makeDraggable(item, button, icon, app);
        button.connect('clicked', () => {
            this.activateItem(item);
        });
        button.connect('button-press-event', (_actor, event) => {
            const mouseButton = event.get_button();
            if (mouseButton === 2) {
                this.handleItemMiddleClick(item);
                return Clutter.EVENT_STOP;
            }
            if (mouseButton === 3) {
                this.popupItemMenu(item, button);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('popup-menu', () => {
            this.popupItemMenu(item, button);
            return Clutter.EVENT_STOP;
        });

        return item;
    }

    _makeDraggable(item, button, icon, app) {
        const dragSource = {
            app,
            _taskbarItem: item,
            getDragActor: () => app.create_icon_texture(this._iconSize),
            getDragActorSource: () => icon,
        };
        button._delegate = dragSource;

        if (!this._dragIsEnabled(item))
            return;

        const draggable = DND.makeDraggable(button, {
            timeoutThreshold: 200,
            dragActorMaxSize: this._iconSize,
        });
        item._taskbarDraggable = draggable;
        draggable.connect('drag-begin', () => {
            dragSource._taskbarDropAccepted = false;
            this._dragging = true;
            item.opacity = 96;
            this._windowPreviews.hideTooltip(false);
            this._windowPreviews.hide();
            button._taskbarMenu?.close();
        });
        draggable.connect('drag-end', () => {
            this._resetDragCursor(draggable);
            item.opacity = 255;
            this._dragging = false;
            this._queueRedisplay();
            this._notifyDragEnd();
        });
    }

    _dragIsEnabled(item = null) {
        if (this._settings.get_boolean('taskbar-locked'))
            return false;

        if (item && item._taskbarIsShowDesktop)
            return this._settings.get_boolean('windows-xp-theme-enabled');

        if (!item)
            return true;

        if (item._taskbarIsLauncher)
            return true;

        return !item._taskbarIsPinnedPrimary ||
            this._combineMode() !== 'never';
    }

    _syncDragEnabled(force = false) {
        const configuration = [
            this._settings.get_boolean('taskbar-locked'),
            this._combineMode(),
            this._usePinnedAppLaunchers(),
            this._settings.get_boolean('hide-pinned-taskbar-apps'),
        ].join(':');
        if (!force && configuration === this._dragEnabled)
            return;

        this._dragEnabled = configuration;
        const sessionOrder = this._sessionOrder;
        const shownInitially = this._shownInitially;
        this._clearAppButtons();
        this._sessionOrder = sessionOrder;
        this._shownInitially = shownInitially;
        this._suppressMembershipAnimation = true;
        this._syncShowDesktopDraggable();
        this._queueRedisplay();
    }

    _createAppMenu(button, app, item) {
        const menu = new TaskbarAppMenu(button, panelArrowSide(this._settings), {
            favoritesSection: true,
            showSingleWindows: true,
            targetWindow: item._taskbarWindow,
            closeApp: (app, timestamp) => this.closeApp(app, timestamp),
            getInterestingWindows: app => this._interestingWindows(app),
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
                this._windowPreviews.hoverItem !== item) {
                item.remove_style_pseudo_class('hover');
            }
        });
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        menuManager.addMenu(menu);

        button._taskbarMenu = menu;
        button._taskbarMenuManager = menuManager;
    }

    _syncFileManagerPlaces() {
        const enabled = this._settings.get_boolean(
            'nautilus-places-enabled'
        );
        for (const item of this.getItems()) {
            item._taskbarButton._taskbarMenu
                ?.setFileManagerPlacesEnabled(enabled);
        }
    }

    _popupAppMenu(button, app, item) {
        this._windowPreviews.hideTooltip();
        this._windowPreviews.hide();
        if (!button._taskbarMenu)
            this._createAppMenu(button, app, item);

        const menu = button._taskbarMenu;
        syncMenuArrowSide(menu, this._settings);
        menu.open(BoxPointer.PopupAnimation.FULL);
    }

    _destroyAppMenu(button) {
        this._windowPreviews?.destroyButton(button);
        button._taskbarMenu?.destroy();
        button._taskbarMenu = null;
        button._taskbarMenuManager = null;
    }

    _trackApp(app) {
        if (this._appSignals.has(app))
            return;

        const id = app.connect('windows-changed', () => {
            this._windowPreviews.windowsChanged(app);
            if (this._combineMode() === 'always' &&
                !this._usePinnedAppLaunchers() &&
                this._isPersistentPinned(app)) {
                this.syncButtonStates();
                this.queueIconGeometryUpdate();
                return;
            }
            this._queueRedisplay();
        });
        this._appSignals.set(app, id);
    }

    _animateItemIn(item, animate) {
        item.show(animate);
    }

    _placeItemAtActiveIndex(item, index) {
        const children = this.actor.get_children();
        const activeChildren = children.filter(child =>
            child !== item &&
            child !== this._showDesktopItem &&
            !child.animatingOut
        );
        const currentActiveChildren = children.filter(child =>
            child !== this._showDesktopItem && !child.animatingOut
        );
        if (currentActiveChildren.indexOf(item) === index)
            return;

        const next = activeChildren[index] ?? null;
        const currentActorIndex = children.indexOf(item);
        let actorIndex = next
            ? children.indexOf(next)
            : children.length;
        if (currentActorIndex >= 0 && currentActorIndex < actorIndex)
            actorIndex--;

        if (currentActorIndex >= 0)
            this.actor.set_child_at_index(item, actorIndex);
        else
            this.actor.insert_child_at_index(item, actorIndex);
    }

    _animateItemOutAndDestroy(item) {
        if (!item.get_stage()) {
            item.destroy();
            return;
        }

        item.reactive = false;
        item.animateOutAndDestroy();
    }

    _animatePinnedLaunch(item) {
        const icon = item?._taskbarIcon;
        if (icon?.get_stage() && icon.has_allocation())
            IconGrid.zoomOutActor(icon);
    }

    _untrackApp(app) {
        const id = this._appSignals.get(app);
        if (!id)
            return;

        app.disconnect(id);
        this._appSignals.delete(app);
    }

    _updateGlassGeometry(item) {
        const glassWidth = this._buttonWidth(
            item._taskbarWindow,
            this._showAppLabels(),
            this._appLabelWidth,
            item._taskbarIsCombinedApp
        );
        const slotWidth = this._itemSlotWidth(
            item._taskbarWindow,
            item._taskbarIsLauncher,
            item._taskbarPinnedToRunningGap,
            item._taskbarIsCombinedApp,
            item._taskbarTrailingSpacing
        );
        const glassHeight = this._glassHeight();

        this._syncLauncherIconPosition(item);
        item._taskbarButton.set_width(glassWidth);
        item._taskbarSlot.set_size(slotWidth, this._panelHeight);
        item._taskbarVisual.set_size(glassWidth, this._panelHeight);
        item._taskbarGlassHost.set_size(glassWidth, this._panelHeight);
        const glassInset = this._glassInset();
        const glassY = this._glassY();
        const glassContentWidth = glassWidth - glassInset * 2;
        const glassContentHeight = glassHeight - glassInset * 2;
        item._taskbarGlass.set_position(glassInset, glassY + glassInset);
        item._taskbarGlass.set_size(glassContentWidth, glassContentHeight);
        item._taskbarGlassTexture.set_position(
            glassInset,
            glassY + glassInset
        );
        item._taskbarGlassTexture.set_size(
            glassContentWidth,
            glassContentHeight
        );
        item._taskbarGlassTexture.set_style(
            `background-size: ${glassContentWidth}px ${glassContentHeight}px;`
        );
        item._taskbarGlassBorder.set_position(0, glassY);
        item._taskbarGlassBorder.set_size(glassWidth, glassHeight);
        item._taskbarLabel.set_width(
            this._labelWidthForButton(
                item._taskbarWindow,
                item._taskbarIsCombinedApp
            )
        );
        this._updateIndicatorGeometry(item, false, glassWidth);
    }

    _glassHeight() {
        if (this._settings.get_boolean('windows-xp-theme-enabled'))
            return this._panelHeight - 5;

        const roundedIndicators = this._settings.get_string(
            'running-indicator-style'
        ) === 'rounded';
        return Math.max(
            1,
            this._panelHeight - (roundedIndicators ? 7 : 8)
        );
    }

    _glassY() {
        return this._settings.get_boolean('windows-xp-theme-enabled')
            ? WINDOWS_XP_BUTTON_Y
            : 4;
    }

    _glassInset() {
        return this._settings.get_boolean('windows-xp-theme-enabled')
            ? WINDOWS_XP_BUTTON_BORDER_WIDTH
            : 0;
    }

    _updateIndicatorGeometry(
        item,
        animate = false,
        glassWidth = this._buttonWidth(
            item._taskbarWindow,
            this._showAppLabels(),
            this._appLabelWidth,
            item._taskbarIsCombinedApp
        )
    ) {
        const evenWidth = glassWidth % 2 === 0;
        const containerWidth = evenWidth ? 20 : 21;
        let barWidth = evenWidth ? 8 : 7;

        if (item._taskbarFocused)
            barWidth = containerWidth;
        else if (item._taskbarMultipleWindows)
            barWidth = evenWidth ? 18 : 17;

        const show = item._taskbarShowSecondary;
        const secondaryWidth = Math.max(1, Math.floor(
            (containerWidth - INDICATOR_SEGMENT_GAP) / 2
        ));
        const primaryWidth = show
            ? barWidth - INDICATOR_SEGMENT_GAP - secondaryWidth
            : barWidth;
        const primaryX = (containerWidth - barWidth) / 2;
        const secondaryX = show
            ? primaryX + primaryWidth + INDICATOR_SEGMENT_GAP
            : primaryX + primaryWidth;

        if (item._taskbarIndicatorWidth === containerWidth &&
            item._taskbarIndicatorPrimaryWidth === primaryWidth &&
            item._taskbarIndicatorPrimaryX === primaryX &&
            item._taskbarIndicatorSecondaryX === secondaryX &&
            item._taskbarIndicatorSecondaryShown === show)
            return;

        item._taskbarIndicatorWidth = containerWidth;
        item._taskbarIndicatorPrimaryWidth = primaryWidth;
        item._taskbarIndicatorPrimaryX = primaryX;
        item._taskbarIndicatorSecondaryX = secondaryX;
        item._taskbarIndicatorSecondaryShown = show;

        const indicator = item._taskbarIndicator;
        const primary = item._taskbarIndicatorPrimary;
        const secondary = item._taskbarIndicatorSecondary;

        indicator.set_width(containerWidth);
        secondary.set_width(secondaryWidth);

        if (!animate) {
            primary.remove_transition('width');
            primary.remove_transition('x');
            secondary.remove_transition('x');
            secondary.remove_transition('opacity');
            primary.set_width(primaryWidth);
            primary.set_x(primaryX);
            secondary.set_x(secondaryX);
            secondary.opacity = 255;
            secondary.visible = show;
            return;
        }

        primary.ease({
            width: primaryWidth,
            x: primaryX,
            duration: INDICATOR_ANIMATION_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        if (show) {
            if (!secondary.visible) {
                secondary.set_x(primaryX + barWidth);
                secondary.opacity = 0;
                secondary.visible = true;
            }
            secondary.ease({
                x: secondaryX,
                opacity: 255,
                duration: INDICATOR_ANIMATION_DURATION,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            return;
        }

        secondary.ease({
            x: secondaryX,
            opacity: 0,
            duration: INDICATOR_ANIMATION_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                secondary.visible = false;
                secondary.opacity = 255;
            },
        });
    }

    _syncIndicatorColor(item) {
        let style = null;
        if (item._taskbarRunning &&
            this._settings.get_boolean('custom-indicator-colors-enabled')) {
            const key = item._taskbarFocused
                ? 'focused-indicator-color'
                : 'unfocused-indicator-color';
            style = `background-color: ${
                this._settings.get_string(key)
            };`;
        }

        for (const segment of item._taskbarIndicator.get_children())
            segment.set_style(style);
    }

    _syncIndicatorVisibility(item) {
        item._taskbarIndicator.opacity = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        ) ? 0 : 255;
    }

    _buttonWidth(
        window,
        showLabels = this._showAppLabels(),
        labelWidth = this._appLabelWidth,
        isCombined = false
    ) {
        const hasLabel = Boolean(window) || isCombined;
        if (this._settings.get_boolean('windows-xp-theme-enabled') &&
            hasLabel && showLabels)
            return WINDOWS_XP_TASKBUTTON_WIDTH;

        const minimumIconWidth = this._iconSize % 2 === 0 ? 22 : 21;
        const iconWidth =
            Math.max(this._iconSize, minimumIconWidth) + 8;
        return hasLabel && showLabels
            ? iconWidth + APP_LABEL_SPACING + labelWidth
            : iconWidth;
    }

    _labelWidthForButton(window, isCombined = false) {
        if (this._settings.get_boolean('windows-xp-theme-enabled') &&
            (window || isCombined)) {
            return WINDOWS_XP_TASKBUTTON_WIDTH - this._iconSize -
                WINDOWS_XP_TASKBUTTON_ICON_SPACING -
                WINDOWS_XP_TASKBUTTON_HORIZONTAL_PADDING * 2;
        }

        return this._appLabelWidth;
    }

    _buttonContentHeight() {
        return Math.max(
            1,
            this._panelHeight - APP_CONTENT_VERTICAL_RESERVE
        );
    }

    _syncLauncherIconPosition(item) {
        if (!item._taskbarIsLauncher)
            return;

        item._taskbarIcon.translation_x =
            this._settings.get_boolean('windows-xp-theme-enabled') ? -1 : 0;
    }

    _iconSpacing(isLauncher) {
        const spacing = this._settings.get_int('icon-spacing');
        if (this._settings.get_boolean('windows-xp-theme-enabled') &&
            isLauncher)
            return spacing;

        return Math.max(spacing, 0);
    }

    _itemSlotWidth(
        window,
        isLauncher = false,
        pinnedToRunningGap = false,
        isCombined = false,
        trailing = false
    ) {
        const transitionGap =
            this._settings.get_boolean('windows-xp-theme-enabled') &&
            pinnedToRunningGap
                ? WINDOWS_XP_PINNED_TO_RUNNING_GAP
                : 0;
        const iconSpacing = this._iconSpacing(isLauncher);
        return this._buttonWidth(
            window,
            this._showAppLabels(),
            this._appLabelWidth,
            isCombined
        ) +
            iconSpacing + transitionGap +
            (trailing && iconSpacing < 0 ? -iconSpacing : 0);
    }

    _applyCurrentButtonWidths() {
        for (const item of this._appButtons.values())
            this._updateGlassGeometry(item);
        this.actor.queue_relayout();
    }

    _syncItemLabel(item) {
        const label = item?._taskbarLabel;
        if (!label)
            return;

        const window = item._taskbarWindow;
        const text = window?.get_title() || item._taskbarApp.get_name();
        label.text = text;
        label.visible = (Boolean(window) || item._taskbarIsCombinedApp) &&
            this._showAppLabels();
        if (window)
            item._taskbarButton.accessible_name = `${text}, ${_('running')}`;
    }

}
