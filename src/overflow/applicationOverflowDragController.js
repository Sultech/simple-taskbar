// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import {
    animateReflowCrossedItems,
    applyChildOrder,
    planChildGroupMove,
    reflowVisualDirection,
} from '../taskbar/reflowAnimation.js';

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
        const auxiliaryItemsIn = group => children.filter(child => {
            const entry = records.find(record =>
                record.auxiliaryItem === child
            );
            return entry && group.has(entry.sourceItem);
        });
        const sourceAuxiliaryItems = auxiliaryItemsIn(sourceGroup);
        if (sourceAuxiliaryItems.length === 0)
            return;

        const targetAuxiliaryItems = auxiliaryItemsIn(targetGroup);
        if (targetAuxiliaryItems.length === 0)
            return;

        const target = insertBefore
            ? targetAuxiliaryItems[0]
            : targetAuxiliaryItems.at(-1);
        const move = planChildGroupMove(children, sourceAuxiliaryItems, target, insertBefore);
        if (!move)
            return;

        const horizontal = this._horizontal();
        const spacing = this._contentBox.get_theme_node().get_length('spacing');
        const sourceLength = sourceAuxiliaryItems.reduce(
            (length, item) =>
                length + (horizontal ? item.width : item.height),
            spacing * sourceAuxiliaryItems.length
        );
        const visualDirection = reflowVisualDirection(children, !horizontal);
        applyChildOrder(this._contentBox, move.desiredChildren);
        animateReflowCrossedItems({
            oldChildren: children,
            newChildren: move.desiredChildren,
            skippedItems: new Set(sourceAuxiliaryItems),
            movedLength: sourceLength,
            direction: move.movedForward
                ? visualDirection
                : -visualDirection,
            vertical: !horizontal,
        });
    }

    _horizontal() {
        return this._getStyle() === 'taskbar' && !this._getVertical();
    }
}
