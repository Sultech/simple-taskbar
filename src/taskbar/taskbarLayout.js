// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

export const PANEL_ITEM_GAP = 8;

export function panelContentLength(boxes, crossSize, vertical) {
    const contentLength = boxes.reduce((length, box) => {
        box.queue_relayout();
        return length + (vertical
            ? box.get_preferred_height(crossSize)[1]
            : box.get_preferred_width(crossSize)[1]);
    }, 0);
    return contentLength + PANEL_ITEM_GAP * 2;
}

function naturalLength(actor, crossSize, vertical) {
    if (!actor.visible)
        return 0;

    return vertical
        ? actor.get_preferred_height(crossSize)[1]
        : actor.get_preferred_width(crossSize)[1];
}

function childrenNaturalLength(box, excludedActor, crossSize, vertical) {
    return box.get_children().reduce((length, actor) => {
        if (actor === excludedActor)
            return length;

        return length + naturalLength(actor, crossSize, vertical);
    }, 0);
}

function allocatePanelBoxes(
    panel,
    box,
    leftBox,
    centerBox,
    rightBox,
    resolveCenter,
    vertical,
    contentStart = 0,
    contentLength = null
) {
    panel.set_allocation(box);

    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;
    const crossSize = vertical ? width : height;
    const length = contentLength ?? (vertical ? height : width);
    const leftNatural = naturalLength(leftBox, crossSize, vertical);
    const centerNatural = naturalLength(centerBox, crossSize, vertical);
    const rightNatural = naturalLength(rightBox, crossSize, vertical);
    const rtl = !vertical &&
        panel.get_text_direction() === Clutter.TextDirection.RTL;
    const allocateChild = (actor, start, extent) => {
        const childBox = new Clutter.ActorBox();
        if (vertical) {
            childBox.x1 = 0;
            childBox.x2 = width;
            childBox.y1 = contentStart + start;
            childBox.y2 = childBox.y1 + extent;
        } else {
            childBox.y1 = 0;
            childBox.y2 = height;
            childBox.x1 = contentStart + start;
            childBox.x2 = childBox.x1 + extent;
        }
        actor.allocate(childBox);
    };
    allocateChild(leftBox, rtl ? Math.max(length - leftNatural, 0) : 0,
        Math.min(leftNatural, length));
    allocateChild(centerBox,
        resolveCenter(length, centerNatural, leftNatural, rightNatural, rtl),
        centerNatural);
    allocateChild(rightBox, rtl ? 0 : Math.max(length - rightNatural, 0),
        Math.min(rightNatural, length));
}

export function allocateDynamicPanel(panel, box, leftBox, centerBox, rightBox,
    contentStart, contentLength, vertical) {
    allocateAdaptivePanel(panel, box, leftBox, centerBox, rightBox,
        0, vertical, false, contentStart, contentLength);
}

export function allocateAdaptivePanel(
    panel,
    box,
    leftBox,
    centerBox,
    rightBox,
    centerOffset = 0,
    vertical = false,
    preserveStart = false,
    contentStart = 0,
    contentLength = null
) {
    allocatePanelBoxes(
        panel,
        box,
        leftBox,
        centerBox,
        rightBox,
        (
            length,
            centerNatural,
            leftNatural,
            rightNatural,
            rtl
        ) => {
            const physicalStart = rtl ? rightNatural : leftNatural;
            const physicalEnd = rtl ? leftNatural : rightNatural;
            if (preserveStart)
                return physicalStart + PANEL_ITEM_GAP;

            const centered = (length - centerNatural + centerOffset) / 2;
            const minimum = physicalStart + PANEL_ITEM_GAP;
            const maximum = length - physicalEnd - PANEL_ITEM_GAP -
                centerNatural;
            return Math.round(Math.clamp(
                centered,
                minimum,
                Math.max(minimum, maximum)
            ));
        },
        vertical,
        contentStart,
        contentLength
    );
}

export function allocateExpandedSidePanel(
    panel,
    box,
    leftBox,
    centerBox,
    rightBox,
    centerOffset = 0,
    vertical = false
) {
    allocatePanelBoxes(
        panel,
        box,
        leftBox,
        centerBox,
        rightBox,
        (length, centerNatural) => Math.ceil(
            (length - centerNatural + centerOffset) / 2
        ),
        vertical
    );
}

export function constrainTaskbarSize({
    taskbarBin,
    leftBox,
    centerBox,
    rightBox,
    panelLength,
    panelThickness,
    centered,
    vertical,
}) {
    if (!taskbarBin.visible || !leftBox || !centerBox ||
        !rightBox || panelLength <= 0) {
        return;
    }

    let availableLength;
    if (centered) {
        const leftLength = childrenNaturalLength(
            leftBox,
            taskbarBin,
            panelThickness,
            vertical
        );
        const rightLength = childrenNaturalLength(
            rightBox,
            taskbarBin,
            panelThickness,
            vertical
        );
        const rtl = !vertical &&
            leftBox.get_text_direction() === Clutter.TextDirection.RTL;
        const physicalStart = rtl ? rightLength : leftLength;
        const physicalEnd = rtl ? leftLength : rightLength;
        const centerOtherLength = childrenNaturalLength(
            centerBox,
            taskbarBin,
            panelThickness,
            vertical
        );
        availableLength = panelLength - centerOtherLength -
            physicalStart - physicalEnd - 2 * PANEL_ITEM_GAP;
    } else {
        const leftOtherLength = childrenNaturalLength(
            leftBox,
            taskbarBin,
            panelThickness,
            vertical
        );
        const centerLength = childrenNaturalLength(
            centerBox,
            taskbarBin,
            panelThickness,
            vertical
        );
        const rightLength = childrenNaturalLength(
            rightBox,
            taskbarBin,
            panelThickness,
            vertical
        );
        let protectedStart = panelLength - rightLength - PANEL_ITEM_GAP;

        if (centerLength > 0) {
            protectedStart = Math.min(
                protectedStart,
                (panelLength - centerLength) / 2 - PANEL_ITEM_GAP
            );
        }
        availableLength = protectedStart - leftOtherLength;
    }

    const viewportLength = Math.max(1, Math.floor(availableLength));
    taskbarBin.setMaximumSize(viewportLength, vertical);
    return viewportLength;
}
