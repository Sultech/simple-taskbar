// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import {TaskbarItemContainer} from './taskbarItemContainer.js';

const WINDOWS_XP_PINNED_TO_RUNNING_GAP = 6;
const WINDOWS_XP_SHOW_DESKTOP_WIDTH = 30;

export class TaskbarShowDesktopController {
    constructor({
        settings,
        taskbarActor,
        cancelDrag,
        dragIsEnabled,
        finishDrag,
        getPanelHeight,
        getPreserveItemWidths,
        notifyModeChanged,
        queueRedisplay,
        replaceButton,
        startDrag,
    }) {
        this._settings = settings;
        this._taskbarActor = taskbarActor;
        this._cancelDrag = cancelDrag;
        this._dragIsEnabled = dragIsEnabled;
        this._finishDrag = finishDrag;
        this._getPanelHeight = getPanelHeight;
        this._getPreserveItemWidths = getPreserveItemWidths;
        this._notifyModeChanged = notifyModeChanged;
        this._queueRedisplay = queueRedisplay;
        this._replaceButton = replaceButton;
        this._startDrag = startDrag;
        this._button = null;
        this._item = null;
        this._slot = null;
        this._draggable = null;
        this._dragBeginId = 0;
        this._dragEndId = 0;
    }

    get item() {
        return this._item;
    }

    setButton(button, replaceButton) {
        this._button = button;
        this._replaceButton = replaceButton;
        this.sync();
    }

    enable() {
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => this.sync(),
            'changed::show-desktop-button-visible',
            () => this.sync(),
            'changed::default-gnome-panel',
            () => this.sync(),
            'changed::windows-xp-show-desktop-position',
            () => this._queueRedisplay(),
            this
        );
        this.sync();
    }

    sync() {
        const hadItem = this._item !== null;
        const shouldShow =
            this._button !== null &&
            this._settings.get_boolean('windows-xp-theme-enabled') &&
            this._settings.get_boolean('show-desktop-button-visible') &&
            !this._settings.get_boolean('default-gnome-panel');
        if (shouldShow && !this._item)
            this._createItem();
        else if (!shouldShow && this._item)
            this._removeItem(true);

        if (!this._item) {
            if (hadItem) {
                this._queueRedisplay();
                this._notifyModeChanged();
            }
            return;
        }

        this.updateGeometry();
        this.syncDraggable();
        this.place();
        if (!hadItem) {
            this._queueRedisplay();
            this._notifyModeChanged();
        }
    }

    syncDraggable() {
        const enabled = this._item !== null &&
            this._dragIsEnabled(this._item);
        if (enabled && !this._draggable) {
            const button = this._button;
            const item = this._item;
            button._delegate = {
                _taskbarItem: item,
                getDragActor: () => new Clutter.Clone({source: button}),
                getDragActorSource: () => button,
            };
            const draggable = DND.makeDraggable(button, {
                timeoutThreshold: 200,
            });
            this._draggable = draggable;
            this._dragBeginId = draggable.connect(
                'drag-begin',
                () => this._startDrag(item)
            );
            this._dragEndId = draggable.connect(
                'drag-end',
                () => this._finishDrag(item)
            );
            return;
        }

        if (enabled || !this._draggable)
            return;

        this._removeItem(true);
        this._createItem();
        this.place();
    }

    setPreserveItemWidths(preserve) {
        if (this._item)
            this._item.setPreserveNaturalWidth(preserve);
    }

    updateGeometry(trailing = false, runningGap = false) {
        if (!this._item)
            return;

        const panelHeight = this._getPanelHeight();
        const spacing = this._settings.get_int('icon-spacing');
        const slotWidth = WINDOWS_XP_SHOW_DESKTOP_WIDTH + spacing +
            (runningGap ? WINDOWS_XP_PINNED_TO_RUNNING_GAP : 0) +
            (trailing && spacing < 0 ? -spacing : 0);
        this._item.set_height(panelHeight);
        this._slot.set_size(slotWidth, panelHeight);
        this._button.set_size(WINDOWS_XP_SHOW_DESKTOP_WIDTH, panelHeight);
    }

    place() {
        if (!this._item ||
            this._item.get_parent() !== this._taskbarActor) {
            return;
        }

        const children = this._taskbarActor.get_children();
        const pinnedItems = children.filter(child =>
            child !== this._item &&
            child._taskbarIsLauncher &&
            !child.animatingOut
        );
        const position = Math.clamp(
            this._settings.get_int('windows-xp-show-desktop-position'),
            0,
            pinnedItems.length
        );
        const stationaryChildren = children.filter(child =>
            child !== this._item
        );
        const target = pinnedItems[position];
        const targetIndex = target
            ? stationaryChildren.indexOf(target)
            : pinnedItems.length > 0
                ? stationaryChildren.indexOf(
                    pinnedItems[pinnedItems.length - 1]
                ) + 1
                : 0;
        if (children.indexOf(this._item) !== targetIndex)
            this._taskbarActor.set_child_at_index(this._item, targetIndex);
    }

    savePosition() {
        if (!this._item)
            return;

        const children = this._taskbarActor.get_children();
        const itemIndex = children.indexOf(this._item);
        const position = children.slice(0, itemIndex)
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

    handleDragOver(item, x) {
        const children = this._taskbarActor.get_children();
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
            this._taskbarActor.set_child_at_index(item, targetIndex);
        return DND.DragMotionResult.MOVE_DROP;
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._removeItem();
        this._startDrag = null;
        this._cancelDrag = null;
        this._replaceButton = null;
        this._queueRedisplay = null;
        this._notifyModeChanged = null;
        this._getPreserveItemWidths = null;
        this._getPanelHeight = null;
        this._finishDrag = null;
        this._dragIsEnabled = null;
        this._taskbarActor = null;
        this._settings = null;
    }

    _createItem() {
        const item = new TaskbarItemContainer();
        item.setPreserveNaturalWidth(this._getPreserveItemWidths());
        item.add_style_class_name('simple-taskbar-show-desktop-item');
        item.reactive = true;
        item.y_align = Clutter.ActorAlign.FILL;
        item.set_height(this._getPanelHeight());

        const slot = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: WINDOWS_XP_SHOW_DESKTOP_WIDTH,
            height: this._getPanelHeight(),
            clip_to_allocation: false,
        });
        const parent = this._button.get_parent();
        if (parent)
            parent.remove_child(this._button);
        this._button.set_size(
            WINDOWS_XP_SHOW_DESKTOP_WIDTH,
            this._getPanelHeight()
        );
        slot.add_child(this._button);
        item.setChild(slot);
        item._taskbarIsShowDesktop = true;
        item._taskbarButton = this._button;
        item._taskbarSlot = slot;
        this._button._delegate = {_taskbarItem: item};
        this._item = item;
        this._slot = slot;
        this._taskbarActor.add_child(item);
        item.show(false);
    }

    _removeItem(replaceButton = false) {
        if (!this._item)
            return;

        const hadDraggable = this._draggable !== null;
        this._destroyDraggable();
        const item = this._item;
        const slot = this._slot;
        const button = this._button;
        if (button.get_parent() === slot)
            slot.remove_child(button);
        if (item.get_parent() === this._taskbarActor)
            this._taskbarActor.remove_child(item);
        if (slot.get_parent() === item)
            item.remove_child(slot);
        item.child = null;
        slot.destroy();
        item.destroy();
        button.set_size(-1, -1);
        button._delegate = null;
        this._item = null;
        this._slot = null;
        if (replaceButton && hadDraggable)
            this._button = this._replaceButton(button);
    }

    _destroyDraggable() {
        if (!this._draggable)
            return;

        this._draggable.disconnect(this._dragBeginId);
        this._draggable.disconnect(this._dragEndId);
        this._button._delegate = null;
        this._draggable = null;
        this._dragBeginId = 0;
        this._dragEndId = 0;
        this._cancelDrag();
    }
}
