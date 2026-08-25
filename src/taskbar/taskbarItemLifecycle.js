// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';

export function animateTaskbarItemIn(item, animate) {
    item.show(animate);
}

export function animateTaskbarItemOutAndDestroy(item) {
    if (!item.get_stage()) {
        item.destroy();
        return;
    }

    item.reactive = false;
    item.animateOutAndDestroy();
}

export function animatePinnedLaunch(item) {
    const icon = item._taskbarIcon;
    if (icon.get_stage() && icon.has_allocation())
        IconGrid.zoomOutActor(icon);
}

export function placeTaskbarItemAtIndex(
    actor,
    item,
    index,
    excludedItem,
    excludedItems = []
) {
    const children = actor.get_children();
    const activeChildren = children.filter(child =>
        child !== item &&
        child !== excludedItem &&
        !excludedItems.includes(child) &&
        !child.animatingOut
    );
    const currentActiveChildren = children.filter(child =>
        child !== excludedItem &&
        !excludedItems.includes(child) &&
        !child.animatingOut
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
        actor.set_child_at_index(item, actorIndex);
    else
        actor.insert_child_at_index(item, actorIndex);
}
