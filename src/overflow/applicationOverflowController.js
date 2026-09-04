// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {
    panelArrowSide,
    panelIsVertical,
    syncPanelMenuPosition,
} from '../panel/panelPosition.js';
import {MaximumSizeClamp} from '../taskbar/maximumSizeClamp.js';
import {
    createTaskbarSeparator,
    resetSeparatorToTarget,
    separatorTargetLength,
    syncSeparatorGeometry,
    syncSeparatorVisibility,
} from '../taskbar/taskbarSeparator.js';
import {REFLOW_ANIMATION_TIME} from '../taskbar/reflowAnimation.js';
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
import {
    ApplicationOverflowPopupController,
    TASKBAR_SCROLLBAR_CLASS,
} from './applicationOverflowPopupController.js';
import {closePopupMenu} from '../shared/popupMenuUtils.js';

const POPUP_MARGIN = 32;
const OVERFLOW_BUTTON_ANIMATION_TIME = 150;

const ApplicationOverflowContainer = GObject.registerClass(
class ApplicationOverflowContainer extends St.BoxLayout {
    _init(onMaximumSizeChanged) {
        super._init({
            style_class: 'simple-taskbar-application-overflow-container',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        this._clamp = new MaximumSizeClamp();
        this._onMaximumSizeChanged = onMaximumSizeChanged;
    }

    setMaximumSize(size, vertical) {
        if (!this._clamp.set(size, vertical))
            return;

        this._onMaximumSizeChanged(this._clamp.size);
        this.queue_relayout();
    }

    vfunc_get_preferred_width(forHeight) {
        const [, naturalWidth] =
            super.vfunc_get_preferred_width(forHeight);
        return [0, this._clamp.width(naturalWidth)];
    }

    vfunc_get_preferred_height(forWidth) {
        const [, naturalHeight] =
            super.vfunc_get_preferred_height(forWidth);
        return [0, this._clamp.height(naturalHeight)];
    }

    destroy() {
        this._onMaximumSizeChanged = null;
        super.destroy();
    }
});

export class ApplicationOverflowController {
    constructor({settings, taskbarController, previewController, viewport}) {
        this._settings = settings;
        this._taskbarController = taskbarController;
        this._previewController = previewController;
        this._viewport = viewport;
        this._locationActor = taskbarController.getLocationActor();
        const {
            separator: locationSeparator,
            line: locationSeparatorLine,
        } = createTaskbarSeparator();
        this._locationSeparator = locationSeparator;
        this._locationSeparator.visible = false;
        this._locationSeparatorVertical = null;
        this._locationSeparatorLine = locationSeparatorLine;
        this._signalHolder = new TransientSignalHolder();
        this._grab = null;
        this._menu = null;
        this._section = null;
        this._button = null;
        this._icon = null;
        this._overflowButtonTargetVisible = false;
        this._buttonSize = 0;
        this._buttonSizeAnimating = false;
        this._spacer = new St.Widget({visible: false});
        this._maximumSize = Number.MAX_SAFE_INTEGER;
        this._iconSizeSyncPending = false;
        this._syncId = 0;
        this._dragEndListener = () => this._onTaskbarDragEnd();
        this._dragEndListenerRegistered = false;
        this._dragSyncPending = false;
        this._itemController = null;
        this._dragController = null;
        this._popupController = null;
        this._buttonController = null;
        this._themeController = null;

        this.actor = new ApplicationOverflowContainer(size => {
            this._maximumSize = size;
            this._queueSync();
        });
        this.actor.connectObject(
            'notify::parent', () => this._queueSync(),
            this._signalHolder
        );
        this._createButton();
        this.actor.add_child(this._viewport);
        this.actor.add_child(this._locationSeparator);
        this.actor.add_child(this._locationActor);
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
            () => this._popupController.style,
            () => panelIsVertical(this._settings)
        );
        this._popupController = new ApplicationOverflowPopupController({
            settings: this._settings,
            menu: this._menu,
            section: this._section,
            itemController: this._itemController,
            dragController: this._dragController,
            getItemSizes: items => this._getItemSizes(items),
            close: () => this.close(),
            syncGeometry: () => this._syncPopupGeometry(),
        });
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
            () => this._popupController.style
        );

        this._menu.connectObject('open-state-changed', (_menu, open) => {
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
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::application-overflow-enabled',
            () => this._sync(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::application-overflow-style',
            () => {
                this._popupController.resetStyle();
                this._queueSync();
            },
            this._signalHolder
        );
        this._settings.connectObject('changed::icon-spacing', () => {
            this._queueSync();
        }, this._signalHolder);
        this._settings.connectObject('changed::panel-button-padding', () => {
            this._queueSync();
        }, this._signalHolder);
        this._settings.connectObject('changed::transparency-enabled', () => {
            this._themeController.sync();
        }, this._signalHolder);
        this._settings.connectObject('changed::transparency-level', () => {
            this._themeController.sync();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::panel-theme-follow-system',
            () => this._themeController.sync(),
            'changed::panel-theme',
            () => this._themeController.sync(),
            this._signalHolder
        );
        St.ThemeContext.get_for_stage(global.stage).connectObject(
            'changed', () => this._themeController.sync(),
            this._signalHolder
        );
        St.Settings.get().connectObject(
            'notify::color-scheme', () => this._themeController.sync(),
            this._signalHolder
        );
        this._settings.connectObject('changed::default-gnome-panel', () => {
            this._sync();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::show-location-separator',
            () => this._queueSync(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => this._sync(),
            this._signalHolder
        );
        this._button.connectObject(
            'notify::hover',
            () => this._buttonController.sync(),
            this._signalHolder
        );
        this._button.connectObject(
            'notify::pseudo-class',
            () => this._buttonController.sync(),
            this._signalHolder
        );
        this._button.connectObject(
            'key-focus-in',
            () => this._buttonController.sync(),
            this._signalHolder
        );
        this._button.connectObject(
            'key-focus-out',
            () => this._buttonController.sync(),
            this._signalHolder
        );
        for (const item of this._taskbarController.getOrderedApplicationItems())
            this._connectTaskbarItem(item);
        this._taskbarController.actor.connectObject('child-added',
            (_actor, item) => {
                this._connectTaskbarItem(item);
                this._queueSync();
            }, this._signalHolder);
        this._taskbarController.actor.connectObject('child-removed', () => {
            this._queueSync();
        }, this._signalHolder);
        this._taskbarController.actor.connectObject(
            'notify::allocation',
            () => this._queueSync(),
            this._signalHolder
        );
        for (const item of this._taskbarController.getLocationItems())
            this._connectTaskbarItem(item);
        this._locationActor.connectObject(
            'child-added',
            (_actor, item) => {
                this._connectTaskbarItem(item);
                this._queueSync();
            },
            'child-removed',
            () => this._queueSync(),
            'notify::allocation',
            () => this._queueSync(),
            this._signalHolder
        );
        this._locationSeparator.connectObject(
            'notify::width',
            () => this._queueSync(),
            'notify::height',
            () => this._queueSync(),
            this._signalHolder
        );
        this._viewport.connectObject('notify::allocation', () => {
            this._queueSync();
        }, this._signalHolder);
        this._viewport.hadjustment.connectObject('notify::value', () => {
            if (this._settings.get_boolean('application-overflow-enabled') &&
                this._viewport.hadjustment.get_value() !== 0) {
                this._viewport.hadjustment.set_value(0);
            }
        }, this._signalHolder);
        this._viewport.vadjustment.connectObject('notify::value', () => {
            if (this._settings.get_boolean('application-overflow-enabled') &&
                this._viewport.vadjustment.get_value() !== 0) {
                this._viewport.vadjustment.set_value(0);
            }
        }, this._signalHolder);
        Main.panel.connectObject('notify::style-class', () => {
            this._themeController.sync();
        }, this._signalHolder);
        Main.overview.connectObject('showing', () => this.close(), this._signalHolder);
        global.stage.connectObject('captured-event', (_stage, event) =>
            this._onCapturedEvent(event), this._signalHolder);

        this._syncPanelPosition();
        this._sync();
    }

    get menuIsOpen() {
        return this._menu.isOpen;
    }

    close() {
        this._previewController.hide();
        closePopupMenu(this._menu, false);
    }

    closeWithAnimation() {
        this._previewController.hide();
        closePopupMenu(this._menu);
    }

    clearOverflow() {
        this._clearOverflow();
    }

    sync() {
        this._queueSync();
    }

    syncIconSizeChange() {
        this._iconSizeSyncPending = true;
        this._queueSync();
    }

    destroy() {
        if (this._syncId) {
            global.compositor.get_laters().remove(this._syncId);
            this._syncId = 0;
        }
        if (this._dragEndListenerRegistered) {
            this._taskbarController.removeDragEndListener(
                this._dragEndListener
            );
            this._dragEndListenerRegistered = false;
        }
        this._signalHolder.destroy();
        this._signalHolder = null;
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }

        this._popupController.destroy();
        this._popupController = null;
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
        this.actor.remove_child(this._locationSeparator);
        this.actor.remove_child(this._locationActor);
        this._locationSeparator.destroy();
        this.actor.destroy();
        this.actor = null;
        this._button = null;
        this._icon = null;
        this._spacer = null;
        this._viewport = null;
        this._locationSeparator = null;
        this._locationSeparatorLine = null;
        this._locationSeparatorVertical = null;
        this._locationActor = null;
        this._taskbarController = null;
        this._previewController = null;
        this._buttonSize = 0;
        this._buttonSizeAnimating = false;
        this._iconSizeSyncPending = false;
        this._settings = null;
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
                closePopupMenu(menu, false);
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

        this._syncId = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW,
            () => {
                this._syncId = 0;
                this._sync();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _sync() {
        if (this._taskbarController.isDragging) {
            this._dragSyncPending = true;
            return;
        }

        if (!this.actor.get_stage())
            return;

        this._dragSyncPending = false;
        const iconSizeSyncPending = this._iconSizeSyncPending;
        this._iconSizeSyncPending = false;
        this._buttonController.sync();
        const enabled = this._settings.get_boolean(
            'application-overflow-enabled'
        ) && !this._settings.get_boolean('default-gnome-panel');
        this._viewport.enable_mouse_scrolling = !enabled;
        if (!enabled) {
            this._showAllItems();
            return;
        }

        const vertical = panelIsVertical(this._settings);
        const collapseStartSize = vertical
            ? this._viewport.height
            : this._viewport.width;
        const panelHeight = this._settings.get_int('panel-height');
        const items = this._taskbarController.getOrderedApplicationItems();
        const previousVisibleCount = Math.max(
            0,
            items.length - this._popupController.overflowItems.length
        );
        const locationItems = this._taskbarController.getLocationItems();
        this._syncLocationSeparator(
            this._shouldShowLocationSeparator(items, locationItems),
            vertical
        );
        const locationSeparatorSize = this._locationSeparatorSize();
        const adjustment = vertical
            ? this._viewport.vadjustment
            : this._viewport.hadjustment;
        adjustment.set_value(0);
        const itemSizes = this._getItemSizes(items);
        const locationSize = this._getLocationSize(locationItems);
        const separatorTarget = this._taskbarController.getPinnedSeparatorTarget(
            items
        );
        const separatorIndex = separatorTarget
            ? items.indexOf(separatorTarget)
            : -1;
        const separatorSize = this._taskbarController.getPinnedSeparatorLength();
        const taskbarSize = itemSizes.reduce((sum, size) => sum + size, 0) +
            locationSize +
            locationSeparatorSize +
            (separatorIndex >= 0 ? separatorSize : 0);
        if (items.length === 0 || taskbarSize <= this._maximumSize) {
            this._showAllItems(
                iconSizeSyncPending ? previousVisibleCount : null
            );
            return;
        }

        const buttonAppeared = this._syncOverflowButton(true);
        const buttonSize = this._overflowButtonSize(vertical, panelHeight);
        const availableSize = Math.max(
            1,
            this._maximumSize - buttonSize - locationSize -
                locationSeparatorSize
        );
        let visibleCount = 0;
        let visibleSize = 0;
        for (let index = visibleCount; index < items.length; index++) {
            const separatorBefore = index === separatorIndex
                ? separatorSize
                : 0;
            if (visibleSize + separatorBefore + itemSizes[index] >
                availableSize) {
                break;
            }

            visibleSize += separatorBefore + itemSizes[index];
            visibleCount++;
        }

        this._taskbarController.setPreserveItemWidths(true);
        const revealStartSize = iconSizeSyncPending &&
            visibleCount > previousVisibleCount
            ? this._visibleSizeForCount(
                itemSizes,
                previousVisibleCount,
                separatorIndex,
                separatorSize
            )
            : null;
        const collapse = buttonAppeared && collapseStartSize > visibleSize;
        this._setViewportSize(
            Math.max(1, visibleSize),
            vertical,
            revealStartSize ?? (collapse ? collapseStartSize : null),
            Math.max(1, visibleSize)
        );
        this._setSpacerSize(
            Math.max(0, availableSize - visibleSize),
            vertical,
            collapse ? 0 : null
        );
        this._popupController.setOverflowItems(items.slice(visibleCount));
        this._themeController.sync();
    }

    _shouldShowLocationSeparator(items, locationItems) {
        return this._settings.get_boolean('show-location-separator') &&
            items.length > 0 &&
            locationItems.some(item => !item.animatingOut);
    }

    _locationSeparatorSize() {
        return separatorTargetLength(this._locationSeparator);
    }

    _syncLocationSeparator(visible, vertical) {
        const orientationChanged =
            this._locationSeparatorVertical !== vertical;
        this._locationSeparatorVertical = vertical;
        syncSeparatorGeometry(
            this._locationSeparator,
            this._locationSeparatorLine,
            vertical,
            this._taskbarController.getIconSize()
        );
        if (orientationChanged)
            resetSeparatorToTarget(this._locationSeparator, vertical);

        syncSeparatorVisibility(this._locationSeparator, vertical, visible);
    }

    _syncOverflowButton(visible) {
        if (visible === this._overflowButtonTargetVisible)
            return false;

        const vertical = panelIsVertical(this._settings);
        const panelHeight = this._settings.get_int('panel-height');
        const mainProperty = vertical ? 'height' : 'width';
        const animate = St.Settings.get().enable_animations;
        this._overflowButtonTargetVisible = visible;
        this._button.remove_all_transitions();
        this._button.set_pivot_point(0.5, 0.5);
        if (visible) {
            this._button[mainProperty] = -1;
            const buttonSize = this._overflowButtonSize(vertical, panelHeight);
            if (!animate) {
                this._button.scale_x = 1;
                this._button.scale_y = 1;
                this._button.opacity = 255;
                this._button.show();
                return true;
            }

            this._buttonSizeAnimating = true;
            this._button[mainProperty] = 0;
            this._button.scale_x = 0.72;
            this._button.scale_y = 0.72;
            this._button.opacity = 0;
            this._button.show();
            this._button.ease({
                scale_x: 1,
                scale_y: 1,
                duration: OVERFLOW_BUTTON_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            });
            this._button.ease({
                opacity: 255,
                duration: OVERFLOW_BUTTON_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._button.ease({
                [mainProperty]: buttonSize,
                duration: REFLOW_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onStopped: finished => {
                    this._buttonSizeAnimating = false;
                    if (finished && this._overflowButtonTargetVisible)
                        this._button[mainProperty] = -1;
                },
            });
            return true;
        }

        if (!this._button.visible)
            return false;
        if (!animate) {
            this._button.hide();
            this._button[mainProperty] = -1;
            this._button.scale_x = 1;
            this._button.scale_y = 1;
            this._button.opacity = 255;
            return true;
        }

        this._buttonSizeAnimating = true;
        this._button[mainProperty] = vertical
            ? this._button.height
            : this._button.width;
        this._button.ease({
            scale_x: 0.72,
            scale_y: 0.72,
            opacity: 0,
            duration: OVERFLOW_BUTTON_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });
        this._button.ease({
            [mainProperty]: 0,
            duration: REFLOW_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onStopped: finished => {
                this._buttonSizeAnimating = false;
                if (!finished || this._overflowButtonTargetVisible)
                    return;
                this._button.hide();
                this._button[mainProperty] = -1;
                this._button.scale_x = 1;
                this._button.scale_y = 1;
                this._button.opacity = 255;
            },
        });
        return true;
    }

    _overflowButtonSize(vertical, panelHeight) {
        if (this._buttonSizeAnimating)
            return this._buttonSize;

        this._button.ensure_style();
        this._buttonSize = vertical
            ? this._button.get_preferred_height(panelHeight)[1]
            : this._button.get_preferred_width(panelHeight)[1];
        return this._buttonSize;
    }

    _onTaskbarDragEnd() {
        if (this._dragSyncPending)
            this._dragSyncPending = false;
        this._queueSync();
    }

    _showAllItems(previousVisibleCount = null) {
        this._taskbarController.setPreserveItemWidths(false);
        this._spacer.hide();
        const vertical = panelIsVertical(this._settings);
        const releasedViewportSize = vertical
            ? this._viewport.height
            : this._viewport.width;
        const items = this._taskbarController.getOrderedApplicationItems();
        const locationItems = this._taskbarController.getLocationItems();
        const reveal = previousVisibleCount !== null &&
            previousVisibleCount < items.length;
        const buttonReleasedSpace = this._syncOverflowButton(false);
        this._syncLocationSeparator(
            this._shouldShowLocationSeparator(items, locationItems),
            vertical
        );
        const itemSizes = this._getItemSizes(items);
        const locationSize = this._getLocationSize(locationItems);
        const locationSeparatorSize = this._locationSeparatorSize();
        const maximumSize = Math.max(
            1,
            this._maximumSize - locationSize - locationSeparatorSize
        );
        const separatorTarget =
            this._taskbarController.getPinnedSeparatorTarget(items);
        const separatorIndex = separatorTarget
            ? items.indexOf(separatorTarget)
            : -1;
        const separatorSize =
            this._taskbarController.getPinnedSeparatorLength();
        const targetSize = this._visibleSizeForCount(
            itemSizes,
            items.length,
            separatorIndex,
            separatorSize
        );
        const revealStartSize = reveal
            ? this._visibleSizeForCount(
                itemSizes,
                previousVisibleCount,
                separatorIndex,
                separatorSize
            )
            : (buttonReleasedSpace ? releasedViewportSize : null);
        this._setViewportSize(
            maximumSize,
            vertical,
            revealStartSize,
            Math.min(maximumSize, targetSize)
        );
        this._clearOverflow();
    }

    _visibleSizeForCount(itemSizes, count, separatorIndex, separatorSize) {
        let size = 0;
        for (let index = 0; index < count; index++) {
            if (index === separatorIndex)
                size += separatorSize;
            size += itemSizes[index];
        }
        return size;
    }

    _getItemSizes(items) {
        return items.map(item =>
            this._taskbarController.getItemLength(item)
        );
    }

    _getLocationSize(locationItems) {
        return locationItems.reduce((size, item) => item.animatingOut
            ? size
            : size + this._taskbarController.getItemLength(item), 0);
    }

    _setViewportSize(maximumSize, vertical, startSize, targetSize) {
        this._viewport.setMaximumSize(maximumSize, vertical);
        if (startSize === null || startSize === targetSize ||
            !St.Settings.get().enable_animations) {
            return;
        }

        const property = vertical ? 'height' : 'width';
        this._viewport.remove_transition(property);
        this._viewport[property] = Math.max(1, startSize);
        this._viewport.ease({
            [property]: Math.max(1, targetSize),
            duration: REFLOW_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onStopped: finished => {
                if (finished)
                    this._viewport[property] = -1;
            },
        });
    }

    _setSpacerSize(size, vertical, startSize) {
        const property = vertical ? 'height' : 'width';
        this._spacer[vertical ? 'width' : 'height'] = -1;
        this._spacer.show();
        if (startSize === null) {
            if (!this._spacer.get_transition(property))
                this._spacer[property] = size;
            return;
        }

        this._spacer.remove_transition(property);
        if (startSize === size || !St.Settings.get().enable_animations) {
            this._spacer[property] = size;
            return;
        }

        this._spacer[property] = startSize;
        this._spacer.ease({
            [property]: size,
            duration: REFLOW_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    _clearOverflow() {
        this._popupController.clear();
    }

    _syncPopupGeometry() {
        const monitor = Main.layoutManager.findMonitorForActor(this.actor);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(
            monitor.index
        );
        const scrollView = this._section.actor.get_child_at_index(0);
        if (this._popupController.style === 'taskbar') {
            const vertical = panelIsVertical(this._settings);
            const maximumSize = Math.max(
                1,
                (vertical ? workArea.height : workArea.width) - POPUP_MARGIN
            );
            const contentSize = this._getItemSizes(
                this._popupController.overflowItems
            ).reduce((size, itemSize) => size + itemSize, 0);
            const hasScrollbar = contentSize > maximumSize;
            if (hasScrollbar) {
                this._menu.box.add_style_class_name(
                    TASKBAR_SCROLLBAR_CLASS
                );
            } else {
                this._menu.box.remove_style_class_name(
                    TASKBAR_SCROLLBAR_CLASS
                );
            }
            scrollView.set_policy(
                !vertical && hasScrollbar
                    ? St.PolicyType.ALWAYS
                    : St.PolicyType.NEVER,
                vertical && hasScrollbar
                    ? St.PolicyType.ALWAYS
                    : St.PolicyType.NEVER
            );
            scrollView.set_style(vertical
                ? `max-height: ${maximumSize}px;`
                : `max-width: ${maximumSize}px;`);
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
        const vertical = panelIsVertical(this._settings);
        this.actor.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        this.actor.x_align = vertical
            ? Clutter.ActorAlign.FILL
            : Clutter.ActorAlign.START;
        this.actor.y_align = vertical
            ? Clutter.ActorAlign.START
            : Clutter.ActorAlign.FILL;
        this._viewport.x_expand = vertical;
        this._viewport.y_expand = !vertical;
        this._locationActor.x_expand = vertical;
        this._locationActor.y_expand = !vertical;
        syncPanelMenuPosition(this._menu, this._settings);
        this._queueSync();
    }
}
