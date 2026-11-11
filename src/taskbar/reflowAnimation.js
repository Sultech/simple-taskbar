// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

export const REFLOW_ANIMATION_TIME = 160;

export function reflowVisualDirection(
    children,
    vertical,
    includeChild = () => true
) {
    let previousPosition = null;
    for (const child of children) {
        if (!includeChild(child))
            continue;

        const position = vertical ? child.y : child.x;
        if (previousPosition !== null && position !== previousPosition)
            return position > previousPosition ? 1 : -1;
        previousPosition = position;
    }
    return 1;
}

export function planChildGroupMove(children, groupItems, target, insertBefore) {
    const groupSet = new Set(groupItems);
    const remainingChildren = children.filter(child => !groupSet.has(child));
    const insertIndex = remainingChildren.indexOf(target) + (insertBefore ? 0 : 1);
    const desiredChildren = [...remainingChildren];
    desiredChildren.splice(insertIndex, 0, ...groupItems);
    if (desiredChildren.every((child, index) => children[index] === child))
        return null;

    return {
        desiredChildren,
        movedForward: desiredChildren.indexOf(groupItems[0]) > children.indexOf(groupItems[0]),
    };
}

export function applyChildOrder(container, desiredChildren) {
    for (let index = 0; index < desiredChildren.length; index++) {
        const child = desiredChildren[index];
        if (container.get_child_at_index(index) !== child)
            container.set_child_at_index(child, index);
    }
}

export function animateReflowCrossedItems({
    oldChildren,
    newChildren,
    skippedItems,
    movedLength,
    direction,
    vertical,
    includeChild = () => true,
}) {
    if (!St.Settings.get().enable_animations || movedLength <= 0)
        return;

    for (const child of oldChildren) {
        if (!includeChild(child) || skippedItems.has(child) ||
            oldChildren.indexOf(child) === newChildren.indexOf(child)) {
            continue;
        }

        child.remove_all_transitions();
        if (vertical)
            child.translation_y += direction * movedLength;
        else
            child.translation_x += direction * movedLength;
        child.ease({
            translation_x: 0,
            translation_y: 0,
            duration: REFLOW_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }
}
