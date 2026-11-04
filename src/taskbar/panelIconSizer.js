// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {dynamicTaskbarEnabled} from '../shared/taskbarPanelModes.js';
import {
    adaptiveTaskbarIconSize,
    applyTaskbarIconSize,
    panelTaskbarIconSize,
    prepareTaskbarIconSizeChange,
} from './taskbarIconSize.js';

export class PanelIconSizer {
    constructor({
        settings,
        taskbarController,
        startButtonController,
        boxes,
        maximumIconSize,
        iconSize,
        getConfiguredIconSize,
        isAdaptive,
        prepareEveryChange = false,
        beforeApply = () => {},
        afterApply = () => {},
    }) {
        this._settings = settings;
        this._taskbarController = taskbarController;
        this._startButtonController = startButtonController;
        this._boxes = boxes;
        this._getConfiguredIconSize = getConfiguredIconSize;
        this._isAdaptive = isAdaptive;
        this._prepareEveryChange = prepareEveryChange;
        this._beforeApply = beforeApply;
        this._afterApply = afterApply;
        this.maximumIconSize = maximumIconSize;
        this.iconSize = iconSize;
    }

    destroy() {
        this._settings = null;
        this._taskbarController = null;
        this._startButtonController = null;
        this._boxes = null;
        this._getConfiguredIconSize = null;
        this._isAdaptive = null;
        this._beforeApply = null;
        this._afterApply = null;
    }

    get isShrunk() {
        return this.iconSize < this.maximumIconSize;
    }

    reset() {
        this.maximumIconSize = this._getConfiguredIconSize();
        this.iconSize = panelTaskbarIconSize(this._settings, this.maximumIconSize);
        this._apply();
    }

    syncMaximum() {
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
