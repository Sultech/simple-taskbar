// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {panelIsVertical} from '../panel/panelPosition.js';
import {getScrollDelta} from '../scrollUtils.js';

const TASKBAR_CONTENT_CLASS =
    'simple-taskbar-application-overflow-taskbar-content';
export const TASKBAR_SCROLLBAR_CLASS =
    'simple-taskbar-application-overflow-taskbar-scrollbar';
const OVERFLOW_CONTENT_ANIMATION_TIME = 140;
const OVERFLOW_ITEM_CLOSE_ANIMATION_TIME = 200;

export class ApplicationOverflowPopupController {
    constructor({
        settings,
        menu,
        section,
        itemController,
        dragController,
        getItemSizes,
        close,
        syncGeometry,
    }) {
        this._settings = settings;
        this._menu = menu;
        this._section = section;
        this._itemController = itemController;
        this._dragController = dragController;
        this._getItemSizes = getItemSizes;
        this._close = close;
        this._syncGeometry = syncGeometry;
        this._overflowItems = [];
        this._style = null;
        this._layoutSignature = null;
        this._pendingOverflowTransition = null;
    }

    get overflowItems() {
        return this._overflowItems;
    }

    get style() {
        return this._style;
    }

    resetStyle() {
        this._style = null;
    }

    setOverflowItems(items) {
        const style = this._settings.get_string(
            'application-overflow-style'
        );
        const panelHeight = this._settings.get_int('panel-height');
        const layoutSignature =
            `${this._getItemSizes(items).join(':')}:${panelHeight}`;
        const matchesCurrent = style === this._style &&
            layoutSignature === this._layoutSignature &&
            items.length === this._overflowItems.length &&
            items.every((item, index) => item === this._overflowItems[index]);
        const sameMembership = style === this._style &&
            items.length === this._overflowItems.length &&
            items.every(item => this._overflowItems.includes(item));
        const reordered = sameMembership && items.some((item, index) =>
            item !== this._overflowItems[index]
        );
        const matchesPending = this._pendingOverflowTransition &&
            style === this._pendingOverflowTransition.style &&
            layoutSignature ===
                this._pendingOverflowTransition.layoutSignature &&
            items.length === this._pendingOverflowTransition.items.length &&
            items.every((item, index) =>
                item === this._pendingOverflowTransition.items[index]);
        if (matchesPending)
            return;
        if (reordered) {
            if (this._dragController.matchesVisualOrder(items)) {
                this._overflowItems = items;
                this._layoutSignature = layoutSignature;
            } else {
                this._applyOverflowItems(items, style, layoutSignature);
            }
            return;
        }

        const content = this._section.actor.get_child_at_index(0);
        if (matchesCurrent) {
            if (this._pendingOverflowTransition && content) {
                content.remove_all_transitions();
                content.scale_x = 1;
                content.scale_y = 1;
                content.opacity = 255;
                this._pendingOverflowTransition = null;
            }
            return;
        }

        if (this._menu.isOpen && content &&
            St.Settings.get().enable_animations) {
            this._animateOverflowContentChange(
                items,
                style,
                layoutSignature,
                content
            );
            return;
        }

        this._applyOverflowItems(items, style, layoutSignature);
    }

    clear() {
        this._close();
        if (this._overflowItems.length > 0)
            this.setOverflowItems([]);
    }

    destroy() {
        this._pendingOverflowTransition = null;
        const content = this._section.actor.get_child_at_index(0);
        if (content)
            content.remove_all_transitions();
        for (const {auxiliaryItem} of this._itemController.records)
            auxiliaryItem.remove_all_transitions();

        this._syncGeometry = null;
        this._close = null;
        this._getItemSizes = null;
        this._dragController = null;
        this._itemController = null;
        this._section = null;
        this._menu = null;
        this._overflowItems = null;
        this._style = null;
        this._layoutSignature = null;
        this._settings = null;
    }

    _animateOverflowContentChange(items, style, layoutSignature, content) {
        this._pendingOverflowTransition = {
            items: [...items],
            style,
            layoutSignature,
        };
        const closingItems = style === 'taskbar'
            ? new Set(this._overflowItems.filter(item =>
                item.animatingOut && !items.includes(item)))
            : new Set();
        if (closingItems.size > 0) {
            const closingRecords = this._itemController.records.filter(
                ({sourceItem}) => closingItems.has(sourceItem)
            );
            let animationsRemaining = closingRecords.length;
            for (const {auxiliaryItem} of closingRecords) {
                auxiliaryItem.remove_all_transitions();
                auxiliaryItem.ease({
                    opacity: 0,
                    duration: OVERFLOW_ITEM_CLOSE_ANIMATION_TIME,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onStopped: finished => {
                        if (!finished)
                            return;

                        animationsRemaining--;
                        if (animationsRemaining > 0)
                            return;

                        const pending = this._pendingOverflowTransition;
                        if (!pending)
                            return;
                        this._pendingOverflowTransition = null;
                        this._applyOverflowItems(
                            pending.items,
                            pending.style,
                            pending.layoutSignature
                        );
                    },
                });
            }
            return;
        }
        content.remove_all_transitions();
        content.set_pivot_point(0.5, 0.5);
        content.ease({
            scale_x: 0.96,
            scale_y: 0.96,
            opacity: 0,
            duration: OVERFLOW_CONTENT_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: finished => {
                if (!finished)
                    return;

                const pending = this._pendingOverflowTransition;
                if (!pending)
                    return;
                this._pendingOverflowTransition = null;
                this._applyOverflowItems(
                    pending.items,
                    pending.style,
                    pending.layoutSignature
                );
                const newContent =
                    this._section.actor.get_child_at_index(0);
                if (!newContent || !this._menu.isOpen)
                    return;
                newContent.set_pivot_point(0.5, 0.5);
                newContent.scale_x = 0.96;
                newContent.scale_y = 0.96;
                newContent.opacity = 0;
                newContent.ease({
                    scale_x: 1,
                    scale_y: 1,
                    opacity: 255,
                    duration: OVERFLOW_CONTENT_ANIMATION_TIME,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            },
        });
    }

    _applyOverflowItems(items, style, layoutSignature) {
        this._pendingOverflowTransition = null;
        this._clearPopupItems();
        this._overflowItems = items;
        this._style = style;
        this._layoutSignature = layoutSignature;
        if (items.length === 0) {
            this._close();
            return;
        }

        if (style === 'taskbar')
            this._buildTaskbarFlyout(items);
        else
            this._buildApplicationList(items);
        this._syncGeometry();
    }

    _buildTaskbarFlyout(items) {
        this._menu.box.add_style_class_name(TASKBAR_CONTENT_CLASS);
        const box = new St.BoxLayout({
            style_class: 'simple-taskbar-application-overflow-taskbar',
            orientation: panelIsVertical(this._settings)
                ? Clutter.Orientation.VERTICAL
                : Clutter.Orientation.HORIZONTAL,
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
            const adjustment = panelIsVertical(this._settings)
                ? scrollView.vadjustment
                : scrollView.hadjustment;
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
}
