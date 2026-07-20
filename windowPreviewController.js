// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelArrowSide, panelIsTop} from './panelPosition.js';

const PREVIEW_OPEN_DELAY = 320;
const PREVIEW_CLOSE_DELAY = 180;
const PREVIEW_WIDTH = 260;
const PREVIEW_HEIGHT = 146;
const APP_TOOLTIP_DELAY = 300;
const APP_TOOLTIP_SHOW_TIME = 150;
const APP_TOOLTIP_HIDE_TIME = 100;

export class WindowPreviewController {
    constructor(getTaskbarItems, getInterestingWindows, settings) {
        this._getTaskbarItems = getTaskbarItems;
        this._getInterestingWindows = getInterestingWindows;
        this._settings = settings;
        this._previewItem = null;
        this._previewPendingItem = null;
        this._previewOpenId = 0;
        this._previewCloseId = 0;
        this._previewSwitchId = 0;
        this._previewSwitchItem = null;
        this._previewRefreshId = 0;
        this._previewHoverItem = null;
        this._closingPreviewMenus = new Set();
        this._appTooltip = null;
        this._tooltipItem = null;
        this._tooltipTimeoutId = 0;
    }

    get currentItem() {
        return this._previewItem;
    }

    get hoverItem() {
        return this._previewHoverItem;
    }

    get tooltipItem() {
        return this._tooltipItem;
    }

    get isOpen() {
        return Boolean(
            this._previewItem || this._closingPreviewMenus.size > 0
        );
    }

    destroy() {
        this.hideTooltip(false);
        this.hide();
        this._clearTimeouts();
        this._appTooltip?.destroy();
        this._appTooltip = null;

        const closingMenus = [...this._closingPreviewMenus];
        this._closingPreviewMenus.clear();
        for (const menu of closingMenus)
            menu.destroy();

        this._getTaskbarItems = null;
        this._getInterestingWindows = null;
        this._settings = null;
        this._previewHoverItem = null;
        this._tooltipItem = null;
    }

    removeItem(item) {
        if (this._previewPendingItem === item)
            this._clearTimeout('_previewOpenId');
        if (this._previewSwitchItem === item)
            this._clearSwitch();
        if (this._previewHoverItem === item)
            this._previewHoverItem = null;
        if (this._tooltipItem === item)
            this.hideTooltip();
        if (this._previewItem === item)
            this.hide();
    }

    destroyButton(button) {
        if (this._previewItem?._taskbarButton === button)
            this.hide();
        else
            button._taskbarPreviewMenu?.destroy();
        button._taskbarPreviewMenu = null;
        button._taskbarPreviewBox = null;
    }

    windowsChanged(app) {
        if (this._previewItem?._taskbarApp === app)
            this._queueRefresh(app);
        if (this._tooltipItem?._taskbarApp === app)
            this.hideTooltip();
    }

    schedule(item) {
        this._clearTimeout('_previewCloseId');
        this._clearTimeout('_previewOpenId');
        if (this._windowsForItem(item).length === 0)
            return;
        if (this._previewItem === item)
            return;

        this._previewPendingItem = item;
        this._previewOpenId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            PREVIEW_OPEN_DELAY,
            () => {
                this._previewOpenId = 0;
                this._previewPendingItem = null;
                this.show(item);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    scheduleClose() {
        this._clearTimeout('_previewOpenId');
        this._clearTimeout('_previewCloseId');
        if (!this._previewItem)
            return;
        this._previewCloseId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            PREVIEW_CLOSE_DELAY,
            () => {
                this._previewCloseId = 0;
                if (this._pointerIsOverPreview(this._previewItem))
                    return GLib.SOURCE_REMOVE;
                this.hide(true);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    scheduleTooltip(item) {
        if (this._windowsForItem(item).length > 0)
            return;
        if (this._tooltipItem === item &&
            (this._tooltipTimeoutId || this._appTooltip?.visible))
            return;

        if (this._tooltipTimeoutId)
            GLib.Source.remove(this._tooltipTimeoutId);
        const delay = this._appTooltip?.visible ? 0 : APP_TOOLTIP_DELAY;
        this._tooltipItem = item;
        this._tooltipTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                this._tooltipTimeoutId = 0;
                if (this._tooltipItem === item && item.mapped)
                    this._showTooltip(item);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    hideTooltip(animate = true) {
        if (this._tooltipTimeoutId)
            GLib.Source.remove(this._tooltipTimeoutId);
        this._tooltipTimeoutId = 0;
        this._tooltipItem = null;

        const label = this._appTooltip;
        if (!label?.visible)
            return;

        label.remove_all_transitions();
        if (!animate) {
            label.hide();
            return;
        }

        label.ease({
            opacity: 0,
            duration: APP_TOOLTIP_HIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!this._tooltipItem)
                    label.hide();
            },
        });
    }

    scheduleSwitch(item) {
        this._clearTimeout('_previewOpenId');
        this._clearTimeout('_previewCloseId');
        if (this._previewSwitchItem === item)
            return;

        this._clearSwitch();
        this._previewSwitchItem = item;
        this._previewSwitchId = GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
            this._previewSwitchId = 0;
            const target = this._previewSwitchItem;
            this._previewSwitchItem = null;
            if (target?.mapped)
                this.show(target);
            return GLib.SOURCE_REMOVE;
        });
    }

    show(item) {
        this._clearTimeouts();
        this.hideTooltip();
        const windows = this._windowsForItem(item)
            .sort((a, b) => b.get_user_time() - a.get_user_time());
        if (windows.length === 0)
            return;

        if (this._previewItem === item &&
            item._taskbarButton?._taskbarPreviewMenu?.isOpen)
            return;

        this.hide();

        const button = item._taskbarButton;
        const monitor = Main.layoutManager.findMonitorForActor(item) ??
            Main.layoutManager.primaryMonitor;
        const menu = new PopupMenu.PopupMenu(
            button,
            0.5,
            panelArrowSide(this._settings)
        );
        const section = new PopupMenu.PopupMenuSection();
        const scrollView = new St.ScrollView({
            style_class: 'simple-taskbar-preview-scroll',
            style: `max-width: ${Math.max(320, monitor.width - 32)}px;`,
            hscrollbar_policy: St.PolicyType.EXTERNAL,
            vscrollbar_policy: St.PolicyType.NEVER,
            enable_mouse_scrolling: true,
            overlay_scrollbars: true,
        });
        scrollView.connect('scroll-event', (_actor, event) => {
            const adjustment = scrollView.get_hscroll_bar().get_adjustment();
            const increment = Math.max(
                adjustment.step_increment,
                PREVIEW_WIDTH / 2
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
        const previewBox = new St.BoxLayout({
            style_class: 'simple-taskbar-preview-list',
        });

        for (const window of windows) {
            const preview = this._createWindowPreview(window);
            if (preview)
                previewBox.add_child(preview);
        }
        if (previewBox.get_n_children() === 0) {
            menu.destroy();
            return;
        }

        scrollView.add_child(previewBox);
        section.actor.add_child(scrollView);
        menu.addMenuItem(section);
        // Window previews are visual flyouts rather than modal menus, so they
        // must not consume the first click intended for the source icon.
        menu.actor.add_style_class_name('simple-taskbar-preview-menu');
        menu.actor.track_hover = true;
        menu.actor.hide();
        Main.uiGroup.add_child(menu.actor);
        button._taskbarPreviewMenu = menu;
        button._taskbarPreviewBox = previewBox;
        this._previewItem = item;
        this._setHoverItem(item);

        menu.actor.connect('notify::hover', actor => {
            if (this._previewItem !== item)
                return;
            if (actor.hover)
                this._clearTimeout('_previewCloseId');
            else if (!item.hover)
                this.scheduleClose();
        });
        menu.actor.connect('captured-event', (_actor, event) => {
            if (this._previewItem !== item ||
                event.type() !== Clutter.EventType.MOTION)
                return Clutter.EVENT_PROPAGATE;

            const hoveredItem = this._taskbarItemAtPointer();
            const pointerInsidePreview = this._pointerIsOverPreview(item);
            if (hoveredItem)
                this._setHoverItem(hoveredItem);
            else if (!pointerInsidePreview)
                this._setHoverItem(null);

            if (hoveredItem && hoveredItem !== item &&
                this._windowsForItem(hoveredItem).length > 0) {
                this.scheduleSwitch(hoveredItem);
                return Clutter.EVENT_PROPAGATE;
            }

            if (this._previewSwitchId)
                this._clearSwitch();
            if (pointerInsidePreview)
                this._clearTimeout('_previewCloseId');
            else if (!this._previewCloseId)
                this.scheduleClose();

            return Clutter.EVENT_PROPAGATE;
        });
        menu.connect('open-state-changed', (_popup, isOpen) => {
            if (!isOpen && this._previewItem === item)
                this.scheduleClose();
        });

        menu.open(BoxPointer.PopupAnimation.FULL);
    }

    hide(animate = false) {
        this._clearTimeouts();
        this._releaseHoverItem();
        const item = this._previewItem;
        this._previewItem = null;
        if (!item)
            return;

        const button = item._taskbarButton;
        const menu = button?._taskbarPreviewMenu;
        button._taskbarPreviewMenu = null;
        button._taskbarPreviewBox = null;
        if (!menu)
            return;

        if (!animate || !menu.isOpen) {
            menu.destroy();
            return;
        }

        this._closingPreviewMenus.add(menu);
        menu.connect('menu-closed', () => {
            if (this._closingPreviewMenus?.delete(menu))
                menu.destroy();
        });
        menu.close(BoxPointer.PopupAnimation.FULL);
    }

    _interestingWindows(app) {
        return this._getInterestingWindows(app);
    }

    _windowsForItem(item) {
        const window = item?._taskbarWindow;
        if (!window)
            return this._interestingWindows(item._taskbarApp);

        return this._interestingWindows(item._taskbarApp).includes(window)
            ? [window]
            : [];
    }

    _clearTimeout(name) {
        const id = this[name];
        if (id)
            GLib.Source.remove(id);
        this[name] = 0;
        if (name === '_previewOpenId')
            this._previewPendingItem = null;
    }

    _clearSwitch() {
        if (this._previewSwitchId)
            GLib.Source.remove(this._previewSwitchId);
        this._previewSwitchId = 0;
        this._previewSwitchItem = null;
    }

    _clearTimeouts() {
        this._clearTimeout('_previewOpenId');
        this._clearTimeout('_previewCloseId');
        this._clearSwitch();
        if (this._previewRefreshId)
            GLib.Source.remove(this._previewRefreshId);
        this._previewRefreshId = 0;
    }

    _pointerIsOverPreview(item) {
        if (!item?.mapped)
            return false;

        const [x, y] = global.get_pointer();
        const actor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
        const menuActor = item._taskbarButton?._taskbarPreviewMenu?.actor;
        return item.contains(actor) || menuActor?.contains(actor) === true;
    }

    _taskbarItemAtPointer() {
        const [x, y] = global.get_pointer();
        const actor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);

        for (const item of this._getTaskbarItems()) {
            if (item.mapped && item.contains(actor))
                return item;
        }

        return null;
    }

    _setHoverItem(item) {
        if (this._previewHoverItem === item)
            return;

        this._previewHoverItem?.remove_style_pseudo_class('hover');
        this._previewHoverItem = item;
        item?.add_style_pseudo_class('hover');

        if (item && this._windowsForItem(item).length === 0)
            this.scheduleTooltip(item);
        else
            this.hideTooltip();
    }

    _releaseHoverItem() {
        const item = this._previewHoverItem;
        this._previewHoverItem = null;
        if (item && item !== this._taskbarItemAtPointer())
            item.remove_style_pseudo_class('hover');
    }

    _showTooltip(item) {
        if (!this._appTooltip) {
            this._appTooltip = new St.Label({style_class: 'dash-label'});
            this._appTooltip.hide();
            Main.layoutManager.addChrome(this._appTooltip);
        }

        const label = this._appTooltip;
        label.remove_all_transitions();
        label.set_text(item._taskbarApp.get_name());
        label.opacity = 0;
        label.show();

        const [stageX, stageY] = item.get_transformed_position();
        const [, labelWidth] = label.get_preferred_width(-1);
        const [, labelHeight] = label.get_preferred_height(labelWidth);
        const monitor = Main.layoutManager.findMonitorForActor(item) ??
            Main.layoutManager.primaryMonitor;
        const itemWidth = item.allocation.get_width();
        const x = Math.clamp(
            stageX + Math.floor((itemWidth - labelWidth) / 2),
            monitor.x,
            monitor.x + monitor.width - labelWidth
        );
        const itemHeight = item.allocation.get_height();
        const y = panelIsTop(this._settings)
            ? Math.min(
                monitor.y + monitor.height - labelHeight,
                stageY + itemHeight + 8
            )
            : Math.max(monitor.y, stageY - labelHeight - 8);
        label.set_position(x, y);
        label.ease({
            opacity: 255,
            duration: APP_TOOLTIP_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _queueRefresh(app) {
        if (this._previewRefreshId)
            return;

        this._previewRefreshId = GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
            this._previewRefreshId = 0;
            const item = this._previewItem;
            if (item?._taskbarApp === app)
                this._refresh(item);
            return GLib.SOURCE_REMOVE;
        });
    }

    _refresh(item) {
        const button = item._taskbarButton;
        const previewBox = button?._taskbarPreviewBox;
        const windows = this._windowsForItem(item)
            .sort((a, b) => b.get_user_time() - a.get_user_time());
        if (!previewBox || windows.length === 0) {
            this.hide(true);
            return;
        }

        previewBox.destroy_all_children();
        for (const window of windows) {
            const preview = this._createWindowPreview(window);
            if (preview)
                previewBox.add_child(preview);
        }
        button._taskbarPreviewMenu?.actor.queue_relayout();
    }

    _createWindowPreview(window) {
        const source = window.get_compositor_private();
        if (!source)
            return null;

        const [sourceWidth, sourceHeight] = source.get_size();
        if (sourceWidth <= 0 || sourceHeight <= 0)
            return null;

        const scale = Math.min(
            1,
            PREVIEW_WIDTH / sourceWidth,
            PREVIEW_HEIGHT / sourceHeight
        );
        const previewWidth = Math.max(1, Math.round(sourceWidth * scale));
        const previewHeight = Math.max(1, Math.round(sourceHeight * scale));
        const clone = new Clutter.Clone({
            source,
            width: previewWidth,
            height: previewHeight,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        const thumbnail = new St.Widget({
            style_class: 'simple-taskbar-preview-thumbnail',
            layout_manager: new Clutter.BinLayout(),
            width: previewWidth,
            height: previewHeight,
            clip_to_allocation: true,
        });
        thumbnail.add_child(clone);

        const title = window.get_title() || _('Untitled Window');
        const label = new St.Label({
            style_class: 'simple-taskbar-preview-title',
            text: title,
            width: previewWidth,
            x_align: Clutter.ActorAlign.START,
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-preview-content',
            orientation: Clutter.Orientation.VERTICAL,
        });
        content.add_child(label);
        content.add_child(thumbnail);

        const previewButton = new St.Button({
            style_class: 'simple-taskbar-preview-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: title,
            child: content,
        });
        previewButton.connect('clicked', () => {
            this.hide();
            Main.activateWindow(window);
            Main.overview.hide();
        });

        const preview = new St.Widget({
            style_class: 'simple-taskbar-preview-item',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            track_hover: true,
        });
        preview.add_child(previewButton);

        if (window.can_close()) {
            const closeButton = new St.Button({
                style_class: 'simple-taskbar-preview-close',
                reactive: true,
                can_focus: true,
                track_hover: true,
                accessible_name: _('Close Window'),
                child: new St.Icon({
                    style_class: 'simple-taskbar-preview-close-icon',
                    icon_name: 'window-close-symbolic',
                }),
            });
            const closeButtonBin = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                opacity: 0,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.START,
                x_expand: true,
                y_expand: true,
            });
            const setCloseButtonVisible = visible => {
                closeButtonBin.remove_all_transitions();
                closeButtonBin.ease({
                    opacity: visible ? 255 : 0,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            };

            closeButtonBin.add_child(closeButton);
            closeButton.connect('clicked', () => {
                setCloseButtonVisible(false);
                window.delete(global.get_current_time());
            });
            closeButton.connect('key-focus-in', () => {
                setCloseButtonVisible(true);
            });
            closeButton.connect('key-focus-out', () => {
                if (!preview.hover)
                    setCloseButtonVisible(false);
            });
            preview.connect('notify::hover', actor => {
                setCloseButtonVisible(actor.hover);
            });
            preview.add_child(closeButtonBin);
        }

        return preview;
    }
}
