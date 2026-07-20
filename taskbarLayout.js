// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

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
        const centerOtherWidth = childrenNaturalWidth(
            centerBox,
            taskbarBin,
            panelHeight
        );
        availableWidth = panelWidth - centerOtherWidth -
            2 * (Math.max(leftWidth, rightWidth) + PANEL_ITEM_GAP);
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
