// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

const OVERFLOW_REFLOW_ANIMATION_TIME = 160;

export class ApplicationOverflowDragController {
    constructor(taskbarController, getRecords, getStyle, getVertical) {
        this._taskbarController = taskbarController;
        this._getRecords = getRecords;
        this._getStyle = getStyle;
        this._getVertical = getVertical;
        this._contentBox = null;
    }

    setContentBox(box) {
        this._contentBox = box;
        box._delegate = {
            handleDragOver: (source, _actor, x, y, _time) =>
                this._handleDragOver(source, x, y),
            acceptDrop: (source, _actor, x, y, _time) =>
                this._acceptDrop(source, x, y),
        };
    }

    clearContentBox() {
        if (!this._contentBox)
            return;

        for (const child of this._contentBox.get_children()) {
            child.remove_all_transitions();
            child.translation_x = 0;
            child.translation_y = 0;
        }
        this._contentBox = null;
    }

    matchesVisualOrder(items) {
        if (!this._contentBox)
            return false;

        const records = this._getRecords();
        const children = this._contentBox.get_children();
        return items.length === children.length &&
            children.every((child, index) => {
                const record = records.find(entry =>
                    entry.auxiliaryItem === child
                );
                return record.sourceItem === items[index];
            });
    }

    destroy() {
        this.clearContentBox();
        this._getStyle = null;
        this._getVertical = null;
        this._getRecords = null;
        this._taskbarController = null;
    }

    _handleDragOver(source, x, y) {
        const item = source && source._taskbarItem;
        if (!item || item._taskbarIsShowDesktop ||
            !this._taskbarController.isTaskbarItemDraggable(item)) {
            return DND.DragMotionResult.NO_DROP;
        }

        const coordinate = this._getStyle() === 'taskbar' &&
            !this._getVertical() ? x : y;
        const target = this._getTarget(item, coordinate);
        if (!target)
            return DND.DragMotionResult.NO_DROP;

        if (!target.sameGroup) {
            const changed = this._taskbarController.reorderTaskbarItem(
                item,
                target.item,
                target.insertBefore
            );
            if (changed) {
                this._reorderAuxiliaryGroup(
                    item,
                    target.item,
                    target.insertBefore
                );
            }
        }
        return DND.DragMotionResult.MOVE_DROP;
    }

    _acceptDrop(source, x, y) {
        const item = source && source._taskbarItem;
        if (!item || item._taskbarIsShowDesktop ||
            !this._taskbarController.isTaskbarItemDraggable(item)) {
            return false;
        }

        const coordinate = this._getStyle() === 'taskbar' &&
            !this._getVertical() ? x : y;
        const target = this._getTarget(item, coordinate);
        if (!target)
            return false;

        if (!target.sameGroup) {
            this._taskbarController.reorderTaskbarItem(
                item,
                target.item,
                target.insertBefore
            );
            this._reorderAuxiliaryGroup(
                item,
                target.item,
                target.insertBefore
            );
        }
        return this._taskbarController.acceptTaskbarItemDrop(item, source);
    }

    _getTarget(sourceItem, coordinate) {
        const sourceGroup = this._taskbarController.getTaskbarDragGroup(
            sourceItem
        );
        const sourceIsPinned = this._taskbarController.isTaskbarItemPinned(
            sourceItem
        );
        const visualGroups = [];
        const records = this._getRecords();

        for (const auxiliaryItem of this._contentBox.get_children()) {
            const record = records.find(entry =>
                entry.auxiliaryItem === auxiliaryItem
            );
            if (!record || record.sourceItem._taskbarIsShowDesktop)
                continue;

            const groupItems = this._taskbarController.getTaskbarDragGroup(
                record.sourceItem
            );
            if (groupItems.length === 0)
                continue;

            let visualGroup = visualGroups.find(group =>
                groupItems.includes(group.records[0].sourceItem)
            );
            if (!visualGroup) {
                visualGroup = {
                    records: [],
                    start: Number.MAX_SAFE_INTEGER,
                    end: 0,
                };
                visualGroups.push(visualGroup);
            }

            visualGroup.records.push(record);
            const horizontalTaskbar = this._getStyle() === 'taskbar' &&
                !this._getVertical();
            const start = horizontalTaskbar
                ? auxiliaryItem.x
                : auxiliaryItem.y;
            const size = horizontalTaskbar
                ? auxiliaryItem.width
                : auxiliaryItem.height;
            visualGroup.start = Math.min(visualGroup.start, start);
            visualGroup.end = Math.max(visualGroup.end, start + size);
        }

        const sourceVisualGroup = visualGroups.find(group =>
            sourceGroup.includes(group.records[0].sourceItem)
        );
        if (sourceVisualGroup && coordinate >= sourceVisualGroup.start &&
            coordinate <= sourceVisualGroup.end) {
            return {sameGroup: true};
        }

        const targetGroups = visualGroups.filter(group => {
            const targetItem = group.records[0].sourceItem;
            return !sourceGroup.includes(targetItem) &&
                this._taskbarController.isTaskbarItemPinned(targetItem) ===
                    sourceIsPinned;
        });
        if (targetGroups.length === 0)
            return null;

        let targetGroup = targetGroups.find(group =>
            coordinate < group.start + (group.end - group.start) / 2
        );
        const insertBefore = targetGroup !== undefined;
        if (!targetGroup)
            targetGroup = targetGroups.at(-1);

        return {
            item: insertBefore
                ? targetGroup.records[0].sourceItem
                : targetGroup.records.at(-1).sourceItem,
            insertBefore,
        };
    }

    _reorderAuxiliaryGroup(sourceItem, targetItem, insertBefore) {
        const sourceGroup = new Set(
            this._taskbarController.getTaskbarDragGroup(sourceItem)
        );
        const targetGroup = new Set(
            this._taskbarController.getTaskbarDragGroup(targetItem)
        );
        if (sourceGroup.size === 0 || targetGroup.size === 0)
            return;

        const records = this._getRecords();
        const children = this._contentBox.get_children();
        const sourceAuxiliaryItems = children.filter(child => {
            const entry = records.find(record =>
                record.auxiliaryItem === child
            );
            return entry && sourceGroup.has(entry.sourceItem);
        });
        if (sourceAuxiliaryItems.length === 0)
            return;

        const targetAuxiliaryItems = children.filter(child => {
            const entry = records.find(record =>
                record.auxiliaryItem === child
            );
            return entry && targetGroup.has(entry.sourceItem);
        });
        if (targetAuxiliaryItems.length === 0)
            return;

        const sourceItems = new Set(sourceAuxiliaryItems);
        const remainingChildren = children.filter(child =>
            !sourceItems.has(child)
        );
        const target = insertBefore
            ? targetAuxiliaryItems[0]
            : targetAuxiliaryItems.at(-1);
        const targetIndex = remainingChildren.indexOf(target);
        const insertIndex = targetIndex + (insertBefore ? 0 : 1);
        const desiredChildren = [...remainingChildren];
        desiredChildren.splice(insertIndex, 0, ...sourceAuxiliaryItems);
        const changed = desiredChildren.some((child, index) =>
            children[index] !== child
        );
        if (!changed)
            return;

        const horizontal = this._horizontal();
        const spacing = this._contentBox.get_theme_node().get_length('spacing');
        const sourceLength = sourceAuxiliaryItems.reduce(
            (length, item) =>
                length + (horizontal ? item.width : item.height),
            spacing * sourceAuxiliaryItems.length
        );
        const visualDirection = this._visualDirection(children, horizontal);
        const sourceIndex = children.indexOf(sourceAuxiliaryItems[0]);
        const destinationIndex = desiredChildren.indexOf(sourceAuxiliaryItems[0]);
        for (let index = 0; index < desiredChildren.length; index++) {
            const child = desiredChildren[index];
            if (this._contentBox.get_child_at_index(index) !== child)
                this._contentBox.set_child_at_index(child, index);
        }
        this._animateCrossedItems(
            children,
            desiredChildren,
            sourceItems,
            sourceLength,
            destinationIndex > sourceIndex ? visualDirection : -visualDirection,
            horizontal
        );
    }

    _horizontal() {
        return this._getStyle() === 'taskbar' && !this._getVertical();
    }

    _visualDirection(children, horizontal) {
        let previousPosition = null;
        for (const child of children) {
            const position = horizontal ? child.x : child.y;
            if (previousPosition !== null && position !== previousPosition)
                return position > previousPosition ? 1 : -1;
            previousPosition = position;
        }
        return 1;
    }

    _animateCrossedItems(
        oldChildren,
        newChildren,
        skippedItems,
        movedLength,
        direction,
        horizontal
    ) {
        if (!St.Settings.get().enable_animations || movedLength <= 0)
            return;

        for (const child of oldChildren) {
            if (skippedItems.has(child) ||
                oldChildren.indexOf(child) === newChildren.indexOf(child)) {
                continue;
            }

            child.remove_all_transitions();
            if (horizontal)
                child.translation_x += direction * movedLength;
            else
                child.translation_y += direction * movedLength;
            child.ease({
                translation_x: 0,
                translation_y: 0,
                duration: OVERFLOW_REFLOW_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }
}
