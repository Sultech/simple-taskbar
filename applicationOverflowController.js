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
    panelIsTop,
    syncMenuArrowSide,
} from './panelPosition.js';
import {panelTransparencyOpacity} from './transparencyUtils.js';

const LIGHT_MENU_CLASS = 'simple-taskbar-application-overflow-light';
const DARK_MENU_CLASS = 'simple-taskbar-application-overflow-dark';
const POPUP_MARGIN = 32;
const LIGHT_GRADIENT_START_MAX_OPACITY = 0.62;
const LIGHT_GRADIENT_END_MAX_OPACITY = 0.54;

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
        this._overflowItems = [];
        this._auxiliaryItems = [];
        this._style = null;
        this._layoutSignature = null;

        this.actor = new ApplicationOverflowContainer(width => {
            this._maximumWidth = width;
            this._queueSync();
        });
        this._createButton();
        this.actor.add_child(this._viewport);
        this.actor.add_child(this._spacer);
        this.actor.add_child(this._button);
    }

    enable() {
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
        this._menu.actor.hide();
        Main.uiGroup.add_child(this._menu.actor);

        this._connect(this._menu, 'open-state-changed', (_menu, open) => {
            if (open) {
                this._button.add_style_pseudo_class('active');
                this._syncTheme();
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
            this._syncTheme();
        });
        this._connect(this._settings, 'changed::transparency-level', () => {
            this._syncTheme();
        });
        this._connect(this._settings, 'changed::panel-position', () => {
            this.close();
            this._syncPanelPosition();
        });
        this._connect(this._settings, 'changed::default-gnome-panel', () => {
            this._sync();
        });
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
            this._syncTheme();
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

    destroy() {
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

        this._clearPopupItems();
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
        this._auxiliaryItems = null;
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
        for (const {auxiliaryItem} of this._auxiliaryItems) {
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
        for (const {auxiliaryItem} of this._auxiliaryItems) {
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
        if (this._syncId)
            return;

        this._syncId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._syncId = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
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
        this._syncTheme();
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
        const box = new St.BoxLayout({
            style_class: 'simple-taskbar-application-overflow-taskbar',
        });
        for (const item of items)
            box.add_child(this._createTaskbarItem(item));

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
            let delta = 0;
            switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                delta = -increment;
                break;
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                delta = increment;
                break;
            case Clutter.ScrollDirection.SMOOTH: {
                const [dx, dy] = event.get_scroll_delta();
                delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy) * increment;
                break;
            }
            }
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
            box.add_child(this._createListItem(item));

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

    _createTaskbarItem(item) {
        const panelHeight = this._settings.get_int('panel-height');
        const [, width] = item.get_preferred_width(panelHeight);
        const clone = new Clutter.Clone({source: item});
        const button = new St.Button({
            style_class: 'simple-taskbar-app-item simple-taskbar-application-overflow-taskbar-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width,
            height: panelHeight,
            accessible_name: item._taskbarButton.accessible_name,
            child: clone,
        });
        this._configureAuxiliaryItem(button, item, item, true);
        return button;
    }

    _createListItem(item) {
        const app = item._taskbarApp;
        const window = item._taskbarWindow;
        const icon = app.create_icon_texture(Math.min(
            32,
            this._settings.get_int('icon-size')
        ));
        const label = new St.Label({
            text: window ? window.get_title() || app.get_name() : app.get_name(),
            y_align: Clutter.ActorAlign.CENTER,
        });
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-application-overflow-list-content',
            x_align: Clutter.ActorAlign.START,
            x_expand: true,
        });
        content.add_child(icon);
        content.add_child(label);
        const button = new St.Button({
            style_class: 'simple-taskbar-application-overflow-list-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            accessible_name: item._taskbarButton.accessible_name,
            child: content,
        });
        if (window) {
            window.connectObject('notify::title', () => {
                label.text = window.get_title() || app.get_name();
            }, button);
        }
        const syncState = () => {
            button.set_style_class_name(
                'simple-taskbar-application-overflow-list-item' +
                `${item.has_style_class_name('running') ? ' running' : ''}` +
                `${item.has_style_class_name('focused') ? ' focused' : ''}`
            );
        };
        item.connectObject('notify::style-class', syncState, button);
        syncState();
        this._configureAuxiliaryItem(button, item, button, false);
        return button;
    }

    _configureAuxiliaryItem(
        auxiliaryItem,
        sourceItem,
        styleItem,
        previewsEnabled
    ) {
        auxiliaryItem._taskbarApp = sourceItem._taskbarApp;
        auxiliaryItem._taskbarWindow = sourceItem._taskbarWindow;
        auxiliaryItem._taskbarIsLauncher = sourceItem._taskbarIsLauncher;
        auxiliaryItem._taskbarButton = auxiliaryItem;
        this._auxiliaryItems.push({auxiliaryItem, sourceItem, styleItem});
        this._taskbarController.registerAuxiliaryItem(auxiliaryItem);
        sourceItem._taskbarButton.connectObject(
            'notify::accessible-name',
            () => {
                auxiliaryItem.accessible_name =
                    sourceItem._taskbarButton.accessible_name;
            },
            auxiliaryItem
        );

        if (previewsEnabled) {
            auxiliaryItem.connect('notify::hover', () => {
                this._taskbarController.handleItemHover(
                    auxiliaryItem,
                    auxiliaryItem.hover,
                    styleItem,
                    false
                );
            });
        }
        auxiliaryItem.connect('clicked', () => {
            const keepOpen = this._taskbarController.activateItem(
                sourceItem,
                auxiliaryItem
            );
            if (!keepOpen)
                this._menu.close(BoxPointer.PopupAnimation.FULL);
        });
        auxiliaryItem.connect('button-press-event', (_button, event) => {
            const mouseButton = event.get_button();
            if (mouseButton === Clutter.BUTTON_MIDDLE) {
                this._taskbarController.handleItemMiddleClick(sourceItem);
                this._menu.close(BoxPointer.PopupAnimation.FULL);
                return Clutter.EVENT_STOP;
            }
            if (mouseButton === Clutter.BUTTON_SECONDARY) {
                this._taskbarController.popupItemMenu(
                    sourceItem,
                    auxiliaryItem
                );
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        auxiliaryItem.connect('popup-menu', () => {
            this._taskbarController.popupItemMenu(sourceItem, auxiliaryItem);
            return Clutter.EVENT_STOP;
        });
    }

    _clearPopupItems() {
        for (const {auxiliaryItem, styleItem} of this._auxiliaryItems) {
            styleItem.remove_style_pseudo_class('hover');
            this._taskbarController.removeAuxiliaryItem(auxiliaryItem);
        }
        this._auxiliaryItems = [];
        this._section.actor.destroy_all_children();
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
            scrollView.set_policy(
                contentWidth > maximumWidth
                    ? St.PolicyType.ALWAYS
                    : St.PolicyType.NEVER,
                St.PolicyType.NEVER
            );
            scrollView.set_style(
                `max-width: ${maximumWidth}px;`
            );
        } else {
            scrollView.set_style(
                `max-height: ${Math.max(1, workArea.height - POPUP_MARGIN)}px;`
            );
        }
        this._menu.actor.queue_relayout();
    }

    _syncTheme() {
        const light = Main.panel.has_style_class_name(
            'simple-taskbar-theme-light'
        );
        this._menu.actor.remove_style_class_name(LIGHT_MENU_CLASS);
        this._menu.actor.remove_style_class_name(DARK_MENU_CLASS);
        this._menu.actor.add_style_class_name(
            light ? LIGHT_MENU_CLASS : DARK_MENU_CLASS
        );

        const radiusDeclaration = (this._menu.box.get_style() ?? '')
            .match(/(?:^|;)\s*(border-radius:\s*[^;]+)/)?.[1] ?? '';
        const popupBlurEnabled = global.blur_my_shell?._popup?.enabled;
        if (popupBlurEnabled && !light) {
            this._menu.box.set_style(
                'background: transparent !important; ' +
                radiusDeclaration
            );
            return;
        }

        const panelOpacity = popupBlurEnabled
            ? 1
            : panelTransparencyOpacity(this._settings);
        const gradientStart = light ? '249, 250, 253' : '42, 42, 47';
        const gradientEnd = light ? '230, 234, 242' : '30, 30, 34';
        const startOpacity = light
            ? Math.min(panelOpacity, LIGHT_GRADIENT_START_MAX_OPACITY)
            : panelOpacity;
        const endOpacity = light
            ? Math.min(panelOpacity, LIGHT_GRADIENT_END_MAX_OPACITY)
            : panelOpacity;
        this._menu.box.set_style(
            'background: transparent !important; ' +
            'background-gradient-direction: vertical !important; ' +
            `background-gradient-start: rgba(${gradientStart}, ` +
                `${startOpacity.toFixed(2)}) !important; ` +
            `background-gradient-end: rgba(${gradientEnd}, ` +
                `${endOpacity.toFixed(2)}) !important; ` +
            radiusDeclaration
        );
    }

    _syncPanelPosition() {
        syncMenuArrowSide(this._menu, this._settings);
        if (panelIsTop(this._settings)) {
            this._menu.actor.remove_style_class_name(
                'simple-taskbar-bottom-panel-menu'
            );
        } else {
            this._menu.actor.add_style_class_name(
                'simple-taskbar-bottom-panel-menu'
            );
        }
    }
}
