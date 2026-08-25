// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

const PANEL_ITEM_GAP = 8;

function naturalWidth(actor, height) {
    if (!actor.visible)
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

function allocatePanelBoxes(
    panel,
    box,
    leftBox,
    centerBox,
    rightBox,
    resolveCenterX
) {
    panel.set_allocation(box);

    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;
    const [, leftNaturalWidth] = leftBox.get_preferred_width(height);
    const [, centerNaturalWidth] = centerBox.get_preferred_width(height);
    const [, rightNaturalWidth] = rightBox.get_preferred_width(height);
    const rtl =
        panel.get_text_direction() === Clutter.TextDirection.RTL;
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

    childBox.x1 = resolveCenterX(
        width,
        centerNaturalWidth,
        leftNaturalWidth,
        rightNaturalWidth,
        rtl
    );
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

export function allocateAdaptivePanel(
    panel,
    box,
    leftBox,
    centerBox,
    rightBox,
    centerOffset = 0
) {
    allocatePanelBoxes(
        panel,
        box,
        leftBox,
        centerBox,
        rightBox,
        (
            width,
            centerNaturalWidth,
            leftNaturalWidth,
            rightNaturalWidth,
            rtl
        ) => {
            const physicalLeftWidth = rtl
                ? rightNaturalWidth
                : leftNaturalWidth;
            const physicalRightWidth = rtl
                ? leftNaturalWidth
                : rightNaturalWidth;
            const centeredX =
                (width - centerNaturalWidth + centerOffset) / 2;
            const minimumCenterX = physicalLeftWidth + PANEL_ITEM_GAP;
            const maximumCenterX = width - physicalRightWidth -
                PANEL_ITEM_GAP - centerNaturalWidth;
            const centerX = Math.clamp(
                centeredX,
                minimumCenterX,
                Math.max(minimumCenterX, maximumCenterX)
            );
            return Math.round(centerX);
        }
    );
}

export function allocateExpandedSidePanel(
    panel,
    box,
    leftBox,
    centerBox,
    rightBox,
    centerOffset = 0
) {
    allocatePanelBoxes(
        panel,
        box,
        leftBox,
        centerBox,
        rightBox,
        (width, centerNaturalWidth) => Math.ceil(
            (width - centerNaturalWidth + centerOffset) / 2
        )
    );
}

export function constrainTaskbarWidth({
    taskbarBin,
    leftBox,
    centerBox,
    rightBox,
    panelWidth,
    panelHeight,
    centered,
}) {
    if (!taskbarBin.visible || !leftBox || !centerBox ||
        !rightBox || panelWidth <= 0)
        return;

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
    taskbarBin.setMaximumWidth(viewportWidth);
    return viewportWidth;
}
