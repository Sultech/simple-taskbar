// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {dynamicTaskbarEnabled} from '../shared/panelModeSettings.js';
import {defaultPanelWindowMaxIconSize} from '../shared/panelSizing.js';

export function panelTaskbarIconSize(settings, configuredIconSize) {
    if (!settings.get_boolean('default-gnome-panel'))
        return configuredIconSize;

    return Math.min(configuredIconSize, defaultPanelWindowMaxIconSize(settings));
}

export function panelIconSizeIsAdaptive(settings, taskbarController) {
    return !taskbarController.isRebuilding() &&
        !settings.get_boolean('default-gnome-panel') &&
        !settings.get_boolean('windows-xp-theme-enabled');
}

export function adaptiveTaskbarIconSize({
    settings,
    taskbarController,
    startButtonController,
    availableLength,
    maximumIconSize,
    iconSize,
}) {
    const minimum = Math.min(
        settings.get_int('dock-min-icon-size'),
        maximumIconSize
    );
    return taskbarController.getIconSizeForLength(
        availableLength,
        maximumIconSize,
        minimum,
        startButtonController.actor.visible ? iconSize : null
    );
}

export function applyTaskbarIconSize({
    settings,
    taskbarController,
    startButtonController,
    iconSize,
}) {
    taskbarController.setIconSize(iconSize);
    startButtonController.applyAppearance(
        iconSize,
        settings.get_int('start-button-padding')
    );
}

export function prepareTaskbarIconSizeChange(taskbarController, startButtonController) {
    startButtonController.preparePositionAnimation();
    taskbarController.finishItemShowAnimations();
}

export class PanelIconSizer {
    constructor({
        settings,
        taskbarController,
        startButtonController,
        overflowController,
        boxes,
        maximumIconSize,
        iconSize,
        getConfiguredIconSize,
        isAdaptive,
        prepareEveryChange = false,
        beforeApply = () => {},
        afterApply = () => {},
        syncVerticalItems,
        syncPanelHeight = () => {},
    }) {
        this._settings = settings;
        this._taskbarController = taskbarController;
        this._startButtonController = startButtonController;
        this._overflowController = overflowController;
        this._boxes = boxes;
        this._getConfiguredIconSize = getConfiguredIconSize;
        this._isAdaptive = isAdaptive;
        this._prepareEveryChange = prepareEveryChange;
        this._beforeApply = beforeApply;
        this._afterApply = afterApply;
        this._syncVerticalItems = syncVerticalItems;
        this._syncPanelHeight = syncPanelHeight;
        this.maximumIconSize = maximumIconSize;
        this.iconSize = iconSize;
    }

    destroy() {
        this._settings = null;
        this._taskbarController = null;
        this._startButtonController = null;
        this._overflowController = null;
        this._boxes = null;
        this._getConfiguredIconSize = null;
        this._isAdaptive = null;
        this._beforeApply = null;
        this._afterApply = null;
        this._syncVerticalItems = null;
        this._syncPanelHeight = null;
    }

    get isShrunk() {
        return this.iconSize < this.maximumIconSize;
    }

    reset() {
        this.maximumIconSize = this._getConfiguredIconSize();
        this.iconSize = panelTaskbarIconSize(this._settings, this.maximumIconSize);
        this._apply();
        this._syncVerticalItems();
        this._overflowController.sync();
        this._syncPanelHeight(false);
    }

    syncMaximum() {
        const applied = this._applyMaximum();
        this._overflowController.sync();
        if (applied)
            this._syncPanelHeight(false);
        this._syncVerticalItems();
        return applied;
    }

    fit(availableLength) {
        this._taskbarController.setAvailableWidth(availableLength);
        if (!this.solve(availableLength))
            return false;

        this._syncVerticalItems();
        this._overflowController.syncIconSizeChange();
        this._syncPanelHeight(true);
        return true;
    }

    _applyMaximum() {
        this.maximumIconSize = this._getConfiguredIconSize();
        if (this.iconSize <= this.maximumIconSize && this._isAdaptive())
            return false;

        this.iconSize = panelTaskbarIconSize(this._settings, this.maximumIconSize);
        this._apply();
        return true;
    }

    solve(availableLength) {
        if (!this._isAdaptive())
            return false;

        const iconSize = adaptiveTaskbarIconSize({
            settings: this._settings,
            taskbarController: this._taskbarController,
            startButtonController: this._startButtonController,
            availableLength,
            maximumIconSize: this.maximumIconSize,
            iconSize: this.iconSize,
        });
        if (iconSize === this.iconSize)
            return false;

        if (this._prepareEveryChange || dynamicTaskbarEnabled(this._settings))
            prepareTaskbarIconSizeChange(this._taskbarController, this._startButtonController);
        this.iconSize = iconSize;
        this._apply();
        return true;
    }

    _apply() {
        this._beforeApply(this.iconSize);
        applyTaskbarIconSize({
            settings: this._settings,
            taskbarController: this._taskbarController,
            startButtonController: this._startButtonController,
            iconSize: this.iconSize,
        });
        this._afterApply(this.iconSize);
        this._startButtonController.panelActor.queue_relayout();
        for (const box of this._boxes)
            box.queue_relayout();
    }
}
