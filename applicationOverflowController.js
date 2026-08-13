// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    panelArrowSide,
    syncPanelMenuPosition,
} from './panelPosition.js';
import {getScrollDelta} from './scrollUtils.js';
import {
    ApplicationOverflowButtonController,
} from './applicationOverflowButtonController.js';
import {
    ApplicationOverflowDragController,
} from './applicationOverflowDragController.js';
import {
    ApplicationOverflowItemController,
} from './applicationOverflowItemController.js';
import {
    ApplicationOverflowThemeController,
} from './applicationOverflowThemeController.js';

const TASKBAR_CONTENT_CLASS =
    'simple-taskbar-application-overflow-taskbar-content';
const TASKBAR_SCROLLBAR_CLASS =
    'simple-taskbar-application-overflow-taskbar-scrollbar';
const POPUP_MARGIN = 32;

const ApplicationOverflowContainer = GObject.registerClass(
class ApplicationOverflowContainer extends St.BoxLayout {
    _init(onMaximumWidthChanged) {
        super._init({
            style_class: 'simple-taskbar-application-overflow-container',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        this._maximumWidth = Number.MAX_SAFE_INTEGER;
        this._onMaximumWidthChanged = onMaximumWidthChanged;
    }

    setMaximumWidth(width) {
        const maximumWidth = Math.max(1, Math.floor(width));
        if (maximumWidth === this._maximumWidth)
            return;

        this._maximumWidth = maximumWidth;
        this._onMaximumWidthChanged(maximumWidth);
        this.queue_relayout();
    }

    vfunc_get_preferred_width(forHeight) {
        const [, naturalWidth] =
            super.vfunc_get_preferred_width(forHeight);
        return [0, Math.min(naturalWidth, this._maximumWidth)];
    }

    destroy() {
        this._onMaximumWidthChanged = null;
        super.destroy();
    }
});

export class ApplicationOverflowController {
    constructor({settings, taskbarController, previewController, viewport}) {
        this._settings = settings;
        this._taskbarController = taskbarController;
        this._previewController = previewController;
        this._viewport = viewport;
        this._signals = [];
        this._grab = null;
        this._menu = null;
        this._section = null;
        this._button = null;
        this._icon = null;
        this._spacer = new St.Widget({visible: false});
        this._maximumWidth = Number.MAX_SAFE_INTEGER;
        this._syncId = 0;
        this._dragEndListener = () => this._onTaskbarDragEnd();
        this._dragEndListenerRegistered = false;
        this._dragSyncPending = false;
        this._overflowItems = [];
        this._itemController = null;
        this._dragController = null;
        this._style = null;
        this._layoutSignature = null;
        this._buttonController = null;
        this._themeController = null;

        this.actor = new ApplicationOverflowContainer(width => {
            this._maximumWidth = width;
            this._queueSync();
        });
        this._createButton();
        this.actor.add_child(this._viewport);
        this.actor.add_child(this._button);
        this.actor.add_child(this._spacer);
    }

    enable() {
        this._taskbarController.addDragEndListener(
            this._dragEndListener
        );
        this._dragEndListenerRegistered = true;
        this._menu = new PopupMenu.PopupMenu(
            this._button,
            0.5,
            panelArrowSide(this._settings)
        );
        this._menu.actor.add_style_class_name('panel-menu');
        this._menu.actor.add_style_class_name(
            'simple-taskbar-application-overflow-menu'
        );
        this._section = new PopupMenu.PopupMenuSection();
        this._menu.addMenuItem(this._section);
        this._itemController = new ApplicationOverflowItemController(
            this._settings,
            this._taskbarController,
            this._menu,
            this._section
        );
        this._dragController = new ApplicationOverflowDragController(
            this._taskbarController,
            () => this._itemController.records,
            () => this._style
        );
        this._menu.actor.hide();
        Main.uiGroup.add_child(this._menu.actor);
        this._buttonController = new ApplicationOverflowButtonController(
            this._settings,
            this._button,
            this._icon,
            this._menu
        );
        this._themeController = new ApplicationOverflowThemeController(
            this._settings,
            this._menu,
            () => this._style
        );

        this._connect(this._menu, 'open-state-changed', (_menu, open) => {
            if (open) {
                this._button.add_style_pseudo_class('active');
                this._themeController.sync();
                this._syncPopupGeometry();
                this._grab = Main.pushModal(global.stage, {
                    actionMode: Shell.ActionMode.POPUP,
                });
                this._menu.actor.grab_key_focus();
            } else {
                Main.popModal(this._grab);
                this._grab = null;
                this._button.remove_style_pseudo_class('active');
                this._closeAuxiliaryMenus();
                this._buttonController.sync();
            }
        });
        this._connect(
            this._settings,
            'changed::application-overflow-enabled',
            () => this._sync()
        );
        this._connect(
            this._settings,
            'changed::application-overflow-style',
            () => {
                this._style = null;
                this._queueSync();
            }
        );
        this._connect(this._settings, 'changed::icon-spacing', () => {
            this._queueSync();
        });
        this._connect(this._settings, 'changed::transparency-enabled', () => {
            this._themeController.sync();
        });
        this._connect(this._settings, 'changed::transparency-level', () => {
            this._themeController.sync();
        });
        this._connect(this._settings, 'changed::panel-position', () => {
            this.close();
            this._syncPanelPosition();
        });
        this._connect(this._settings, 'changed::default-gnome-panel', () => {
            this._sync();
        });
        this._connect(
            this._settings,
            'changed::windows-xp-theme-enabled',
            () => this._sync()
        );
        this._connect(
            this._button,
            'notify::hover',
            () => this._buttonController.sync()
        );
        this._connect(
            this._button,
            'notify::pseudo-class',
            () => this._buttonController.sync()
        );
        this._connect(
            this._button,
            'key-focus-in',
            () => this._buttonController.sync()
        );
        this._connect(
            this._button,
            'key-focus-out',
            () => this._buttonController.sync()
        );
        for (const item of this._taskbarController.getOrderedItems())
            this._connectTaskbarItem(item);
        this._connect(this._taskbarController.actor, 'child-added',
            (_actor, item) => {
                this._connectTaskbarItem(item);
                this._queueSync();
            });
        this._connect(this._taskbarController.actor, 'child-removed', () => {
            this._queueSync();
        });
        this._connect(
            this._taskbarController.actor,
            'notify::allocation',
            () => this._queueSync()
        );
        this._connect(this._viewport, 'notify::allocation', () => {
            this._queueSync();
        });
        this._connect(this._viewport.hadjustment, 'notify::value', () => {
            if (this._settings.get_boolean('application-overflow-enabled') &&
                this._viewport.hadjustment.get_value() !== 0) {
                this._viewport.hadjustment.set_value(0);
            }
        });
        this._connect(Main.panel, 'notify::style-class', () => {
            this._themeController.sync();
        });
        this._connect(Main.overview, 'showing', () => this.close());
        this._connect(global.stage, 'captured-event', (_stage, event) =>
            this._onCapturedEvent(event));

        this._syncPanelPosition();
        this._sync();
    }

    get menuIsOpen() {
        return this._menu.isOpen;
    }

    close() {
        this._previewController.hide();
        this._menu.close(BoxPointer.PopupAnimation.NONE);
    }

    closeWithAnimation() {
        this._previewController.hide();
        this._menu.close(BoxPointer.PopupAnimation.FULL);
    }

    clearOverflow() {
        this._clearOverflow();
    }

    destroy() {
        if (this._dragEndListenerRegistered) {
            this._taskbarController.removeDragEndListener(
                this._dragEndListener
            );
            this._dragEndListenerRegistered = false;
        }
        if (this._syncId) {
            GLib.Source.remove(this._syncId);
            this._syncId = 0;
        }
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }

        this._dragController.destroy();
        this._dragController = null;
        this._itemController.destroy();
        this._itemController = null;
        this._buttonController.destroy();
        this._buttonController = null;
        this._themeController.destroy();
        this._themeController = null;
        this._menu.destroy();
        this._menu = null;
        this._section = null;

        this.actor.remove_child(this._viewport);
        this.actor.destroy();
        this.actor = null;
        this._button = null;
        this._icon = null;
        this._spacer = null;
        this._viewport = null;
        this._taskbarController = null;
        this._previewController = null;
        this._overflowItems = null;
        this._layoutSignature = null;
        this._settings = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _connectTaskbarItem(item) {
        item.connectObject(
            'notify::scale-x',
            () => this._queueSync(),
            this.actor
        );
    }

    _onCapturedEvent(event) {
        if (!this._menu.isOpen)
            return Clutter.EVENT_PROPAGATE;

        if (event.type() === Clutter.EventType.KEY_PRESS &&
            event.get_key_symbol() === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }

        if (event.type() !== Clutter.EventType.BUTTON_PRESS &&
            event.type() !== Clutter.EventType.TOUCH_BEGIN) {
            return Clutter.EVENT_PROPAGATE;
        }

        const target = global.stage.get_event_actor(event);
        if (this._button === target || this._button.contains(target) ||
            this._menu.actor === target || this._menu.actor.contains(target) ||
            this._eventInAuxiliaryMenu(target)) {
            return Clutter.EVENT_PROPAGATE;
        }

        this.closeWithAnimation();
        return Clutter.EVENT_PROPAGATE;
    }

    _eventInAuxiliaryMenu(target) {
        for (const {auxiliaryItem} of this._itemController.records) {
            for (const menu of [
                auxiliaryItem._taskbarMenu,
                auxiliaryItem._taskbarPreviewMenu,
            ]) {
                if (menu &&
                    (menu.actor === target || menu.actor.contains(target))) {
                    return true;
                }
            }
        }
        return false;
    }

    _closeAuxiliaryMenus() {
        for (const {auxiliaryItem} of this._itemController.records) {
            const menu = auxiliaryItem._taskbarMenu;
            if (menu)
                menu.close(BoxPointer.PopupAnimation.NONE);
        }
    }

    _createButton() {
        this._button = new St.Button({
            style_class: 'panel-button simple-taskbar-application-overflow-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: _('Application overflow'),
            visible: false,
        });
        this._icon = new St.Icon({
            icon_name: 'view-more-symbolic',
            style_class: 'system-status-icon',
        });
        this._button.set_child(this._icon);
        this._button.connect('button-press-event', (_button, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;

            this._menu.toggle();
            return Clutter.EVENT_STOP;
        });
    }

    _queueSync() {
        if (this._taskbarController.isDragging) {
            this._dragSyncPending = true;
            return;
        }

        if (this._syncId)
            return;

        this._syncId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._syncId = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
        if (this._taskbarController.isDragging) {
            this._dragSyncPending = true;
            return;
        }

        this._dragSyncPending = false;
        this._buttonController.sync();
        const enabled = this._settings.get_boolean(
            'application-overflow-enabled'
        ) && !this._settings.get_boolean('default-gnome-panel');
        this._viewport.enable_mouse_scrolling = !enabled;
        if (!enabled) {
            this._taskbarController.setPreserveItemWidths(false);
            this._button.hide();
            this._spacer.hide();
            this._viewport.setMaximumWidth(this._maximumWidth);
            this._clearOverflow();
            return;
        }

        this._viewport.hadjustment.set_value(0);
        const panelHeight = this._settings.get_int('panel-height');
        const items = this._taskbarController.getOrderedItems();
        const itemWidths = items.map(item =>
            item.get_preferred_width(panelHeight)[1]
        );
        const taskbarWidth = itemWidths.reduce((sum, width) => sum + width, 0);
        if (taskbarWidth <= this._maximumWidth) {
            this._taskbarController.setPreserveItemWidths(false);
            this._button.hide();
            this._spacer.hide();
            this._viewport.setMaximumWidth(this._maximumWidth);
            this._clearOverflow();
            return;
        }

        this._button.show();
        this._button.ensure_style();
        const [, buttonWidth] = this._button.get_preferred_width(panelHeight);
        const availableWidth = Math.max(
            1,
            this._maximumWidth - buttonWidth
        );
        let visibleCount = 0;
        let visibleWidth = 0;
        for (let index = visibleCount; index < items.length; index++) {
            if (visibleWidth + itemWidths[index] > availableWidth)
                break;

            visibleWidth += itemWidths[index];
            visibleCount++;
        }

        this._taskbarController.setPreserveItemWidths(true);
        this._viewport.setMaximumWidth(Math.max(1, visibleWidth));
        this._spacer.set_width(Math.max(0, availableWidth - visibleWidth));
        this._spacer.show();
        this._setOverflowItems(items.slice(visibleCount));
        this._themeController.sync();
    }

    _onTaskbarDragEnd() {
        if (this._dragSyncPending)
            this._dragSyncPending = false;
        this._queueSync();
    }


    _clearOverflow() {
        this.close();
        if (this._overflowItems.length > 0)
            this._setOverflowItems([]);
    }

    _setOverflowItems(items) {
        const style = this._settings.get_string(
            'application-overflow-style'
        );
        const panelHeight = this._settings.get_int('panel-height');
        const layoutSignature = items.map(item =>
            item.get_preferred_width(panelHeight)[1]
        ).join(':') + `:${panelHeight}`;
        if (style === this._style &&
            layoutSignature === this._layoutSignature &&
            items.length === this._overflowItems.length &&
            items.every((item, index) => item === this._overflowItems[index])) {
            return;
        }

        this._clearPopupItems();
        this._overflowItems = items;
        this._style = style;
        this._layoutSignature = layoutSignature;
        if (items.length === 0) {
            this.close();
            return;
        }

        if (style === 'taskbar')
            this._buildTaskbarFlyout(items);
        else
            this._buildApplicationList(items);
        this._syncPopupGeometry();
    }

    _buildTaskbarFlyout(items) {
        this._menu.box.add_style_class_name(TASKBAR_CONTENT_CLASS);
        const box = new St.BoxLayout({
            style_class: 'simple-taskbar-application-overflow-taskbar',
        });
        for (const item of items)
            box.add_child(this._itemController.createTaskbarItem(item));
        this._dragController.setContentBox(box);

        const scrollView = new St.ScrollView({
            style_class: 'simple-taskbar-application-overflow-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            enable_mouse_scrolling: true,
            overlay_scrollbars: false,
            child: box,
        });
        scrollView.connect('scroll-event', (_actor, event) => {
            const adjustment = scrollView.hadjustment;
            const increment = Math.max(
                adjustment.step_increment,
                this._settings.get_int('panel-height')
            );
            const delta = getScrollDelta(event, increment);
            adjustment.set_value(adjustment.get_value() + delta);
            return Clutter.EVENT_STOP;
        });
        this._section.actor.add_child(scrollView);
    }

    _buildApplicationList(items) {
        const box = new St.BoxLayout({
            style_class: 'simple-taskbar-application-overflow-list',
            orientation: Clutter.Orientation.VERTICAL,
        });
        for (const item of items)
            box.add_child(this._itemController.createListItem(item));
        this._dragController.setContentBox(box);

        const viewport = new St.Viewport({
            layout_manager: new Clutter.BinLayout(),
        });
        viewport.add_child(box);
        const scrollView = new St.ScrollView({
            style_class: 'simple-taskbar-application-overflow-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            enable_mouse_scrolling: true,
            overlay_scrollbars: false,
            child: viewport,
        });
        this._section.actor.add_child(scrollView);
    }


    _clearPopupItems() {
        this._menu.box.remove_style_class_name(TASKBAR_CONTENT_CLASS);
        this._menu.box.remove_style_class_name(TASKBAR_SCROLLBAR_CLASS);
        this._dragController.clearContentBox();
        this._itemController.clear();
    }

    _syncPopupGeometry() {
        const monitor = Main.layoutManager.findMonitorForActor(this.actor);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(
            monitor.index
        );
        const scrollView = this._section.actor.get_child_at_index(0);
        if (this._style === 'taskbar') {
            const maximumWidth = Math.max(
                1,
                workArea.width - POPUP_MARGIN
            );
            const panelHeight = this._settings.get_int('panel-height');
            const contentWidth = this._overflowItems.reduce(
                (width, item) => width +
                    item.get_preferred_width(panelHeight)[1],
                0
            );
            const hasHorizontalScrollbar = contentWidth > maximumWidth;
            if (hasHorizontalScrollbar) {
                this._menu.box.add_style_class_name(
                    TASKBAR_SCROLLBAR_CLASS
                );
            } else {
                this._menu.box.remove_style_class_name(
                    TASKBAR_SCROLLBAR_CLASS
                );
            }
            scrollView.set_policy(
                hasHorizontalScrollbar
                    ? St.PolicyType.ALWAYS
                    : St.PolicyType.NEVER,
                St.PolicyType.NEVER
            );
            scrollView.set_style(
                `max-width: ${maximumWidth}px;`
            );
        } else {
            this._menu.box.remove_style_class_name(
                TASKBAR_SCROLLBAR_CLASS
            );
            scrollView.set_style(
                `max-height: ${Math.max(1, workArea.height - POPUP_MARGIN)}px;`
            );
        }
        this._menu.actor.queue_relayout();
    }


    _syncPanelPosition() {
        syncPanelMenuPosition(this._menu, this._settings);
    }
}
