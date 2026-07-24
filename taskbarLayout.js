// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

const PANEL_ITEM_GAP = 8;

function naturalWidth(actor, height) {
    if (!actor?.visible)
        return 0;

    const [, width] = actor.get_preferred_width(height);
    return width;
}

function childrenNaturalWidth(box, excludedActor, height) {
    return box.get_children().reduce((width, actor) => {
        if (actor === excludedActor)
            return width;

        return width + naturalWidth(actor, height);
    }, 0);
}

function taskbarContentWidth(taskbarActor, height, spacing) {
    const children = taskbarActor.get_children();
    const childrenWidth = children.reduce((width, actor) =>
        width + naturalWidth(actor.child ?? actor, height), 0);
    return childrenWidth + Math.max(0, children.length - 1) * spacing;
}

export function allocateAdaptivePanel(
    panel,
    box,
    leftBox,
    centerBox,
    rightBox,
    centerOffset = 0
) {
    panel.set_allocation(box);

    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;
    const [, leftNaturalWidth] = leftBox.get_preferred_width(-1);
    const [, centerNaturalWidth] = centerBox.get_preferred_width(-1);
    const [, rightNaturalWidth] = rightBox.get_preferred_width(-1);
    const rtl =
        panel.get_text_direction() === Clutter.TextDirection.RTL;
    const physicalLeftWidth = rtl
        ? rightNaturalWidth
        : leftNaturalWidth;
    const physicalRightWidth = rtl
        ? leftNaturalWidth
        : rightNaturalWidth;
    const centeredX = (width - centerNaturalWidth + centerOffset) / 2;
    const minimumCenterX = physicalLeftWidth + PANEL_ITEM_GAP;
    const maximumCenterX = width - physicalRightWidth -
        PANEL_ITEM_GAP - centerNaturalWidth;
    const centerX = Math.clamp(
        centeredX,
        minimumCenterX,
        Math.max(minimumCenterX, maximumCenterX)
    );
    const childBox = new Clutter.ActorBox();
    childBox.y1 = 0;
    childBox.y2 = height;

    if (rtl) {
        childBox.x1 = Math.max(width - leftNaturalWidth, 0);
        childBox.x2 = width;
    } else {
        childBox.x1 = 0;
        childBox.x2 = Math.min(leftNaturalWidth, width);
    }
    leftBox.allocate(childBox);

    childBox.x1 = Math.round(centerX);
    childBox.x2 = childBox.x1 + centerNaturalWidth;
    centerBox.allocate(childBox);

    if (rtl) {
        childBox.x1 = 0;
        childBox.x2 = Math.min(rightNaturalWidth, width);
    } else {
        childBox.x1 = Math.max(width - rightNaturalWidth, 0);
        childBox.x2 = width;
    }
    rightBox.allocate(childBox);
}

export function constrainTaskbarWidth({
    taskbarBin,
    taskbarActor,
    leftBox,
    centerBox,
    rightBox,
    panelWidth,
    panelHeight,
    spacing,
    centered,
}) {
    if (!taskbarBin?.visible || !taskbarActor || !leftBox || !centerBox ||
        !rightBox || panelWidth <= 0)
        return;

    const taskbarNaturalWidth = taskbarContentWidth(
        taskbarActor,
        panelHeight,
        spacing
    );
    let availableWidth;
    if (centered) {
        const leftWidth = childrenNaturalWidth(
            leftBox,
            taskbarBin,
            panelHeight
        );
        const rightWidth = childrenNaturalWidth(
            rightBox,
            taskbarBin,
            panelHeight
        );
        const rtl =
            leftBox.get_text_direction() === Clutter.TextDirection.RTL;
        const physicalLeftWidth = rtl ? rightWidth : leftWidth;
        const physicalRightWidth = rtl ? leftWidth : rightWidth;
        const centerOtherWidth = childrenNaturalWidth(
            centerBox,
            taskbarBin,
            panelHeight
        );
        availableWidth = panelWidth - centerOtherWidth -
            physicalLeftWidth - physicalRightWidth - 2 * PANEL_ITEM_GAP;
    } else {
        const leftOtherWidth = childrenNaturalWidth(
            leftBox,
            taskbarBin,
            panelHeight
        );
        const centerWidth = childrenNaturalWidth(
            centerBox,
            taskbarBin,
            panelHeight
        );
        const rightWidth = childrenNaturalWidth(
            rightBox,
            taskbarBin,
            panelHeight
        );
        let protectedStart = panelWidth - rightWidth - PANEL_ITEM_GAP;

        if (centerWidth > 0) {
            protectedStart = Math.min(
                protectedStart,
                (panelWidth - centerWidth) / 2 - PANEL_ITEM_GAP
            );
        }
        availableWidth = protectedStart - leftOtherWidth;
    }

    const viewportWidth = Math.max(1, Math.floor(availableWidth));
    if (taskbarNaturalWidth <= 0) {
        taskbarActor.set_width(-1);
        taskbarBin.set_width(-1);
        return viewportWidth;
    }

    taskbarActor.set_width(Math.ceil(taskbarNaturalWidth));
    taskbarBin.set_width(Math.min(
        Math.ceil(taskbarNaturalWidth),
        viewportWidth
    ));
    return viewportWidth;
}
