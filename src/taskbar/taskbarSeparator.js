// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {pinnedSeparatorLength} from './taskbarLengthModel.js';
import {placeTaskbarItemAtIndex} from './taskbarItemLifecycle.js';

export const TASKBAR_SEPARATOR_EXTENT = 13;
export const TASKBAR_SEPARATOR_LINE_SIZE = 1;

const SEPARATOR_ANIMATION_TIME = 150;

export function createTaskbarSeparator() {
    const separator = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        reactive: false,
        clip_to_allocation: true,
    });
    const line = new St.Widget({
        style_class: 'simple-taskbar-separator',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        reactive: false,
    });
    separator.add_child(line);
    separator._targetVisible = false;
    return {separator, line};
}

export function separatorTargetLength(separator) {
    return separator._targetVisible ? TASKBAR_SEPARATOR_EXTENT : 0;
}

export function resetSeparatorToTarget(separator, vertical) {
    separator.remove_all_transitions();
    separator[vertical ? 'height' : 'width'] =
        separator._targetVisible ? TASKBAR_SEPARATOR_EXTENT : 0;
    separator.opacity = separator._targetVisible ? 255 : 0;
    separator.visible = separator._targetVisible;
}

export function syncSeparatorVisibility(
    separator,
    vertical,
    visible,
    animate = true
) {
    if (visible === separator._targetVisible)
        return false;

    separator._targetVisible = visible;
    const mainProperty = vertical ? 'height' : 'width';
    const animateChange = animate && separator.get_stage() !== null;
    if (visible) {
        separator.show();
        if (!animateSeparatorIn(separator, vertical, animateChange)) {
            separator[mainProperty] = TASKBAR_SEPARATOR_EXTENT;
            separator.opacity = 255;
        }
        return true;
    }

    const finish = () => {
        if (!separator._targetVisible)
            separator.hide();
    };
    if (!animateSeparatorOut(separator, vertical, finish, animateChange)) {
        separator[mainProperty] = 0;
        separator.opacity = 0;
        separator.hide();
    }
    return true;
}

export function syncSeparatorGeometry(
    separator,
    line,
    vertical,
    iconSize,
    parityOffset
) {
    if (vertical) {
        separator.set_width(iconSize);
        line.set_size(iconSize, TASKBAR_SEPARATOR_LINE_SIZE);
        line.translation_x = parityOffset;
    } else {
        separator.set_height(iconSize);
        line.set_size(TASKBAR_SEPARATOR_LINE_SIZE, iconSize);
        line.translation_x = 0;
    }
}

export function animateSeparatorIn(separator, vertical, animate = true) {
    const property = vertical ? 'height' : 'width';
    const reversing = separator.get_transition(property) !== null;
    separator.remove_all_transitions();
    if (!animate || !St.Settings.get().enable_animations)
        return false;

    if (!reversing) {
        separator[property] = 0;
        separator.opacity = 0;
    }
    separator.ease({
        [property]: TASKBAR_SEPARATOR_EXTENT,
        opacity: 255,
        duration: SEPARATOR_ANIMATION_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    });
    return true;
}

export function animateSeparatorOut(
    separator,
    vertical,
    onStopped,
    animate = true
) {
    const property = vertical ? 'height' : 'width';
    separator.remove_all_transitions();
    if (!animate || !St.Settings.get().enable_animations)
        return false;

    separator.ease({
        [property]: 0,
        opacity: 0,
        duration: SEPARATOR_ANIMATION_TIME,
        mode: Clutter.AnimationMode.EASE_IN_CUBIC,
        onStopped: finished => {
            if (finished)
                onStopped();
        },
    });
    return true;
}

export class TaskbarPinnedSeparator {
    constructor({settings, taskbarActor, getIconSize, getParityOffset, getShowDesktopItem}) {
        this._settings = settings;
        this._taskbarActor = taskbarActor;
        this._getIconSize = getIconSize;
        this._getParityOffset = getParityOffset;
        this._getShowDesktopItem = getShowDesktopItem;
        this.actor = null;
        this._line = null;
    }

    get length() {
        return this.actor ? TASKBAR_SEPARATOR_EXTENT : 0;
    }

    target(items) {
        if (!this.actor)
            return null;

        return items.find(item => item._taskbarApp &&
            !item._taskbarIsLauncher &&
            !item._taskbarIsPinnedPrimary) ?? null;
    }

    destroy() {
        this.clear();
        this._settings = null;
        this._taskbarActor = null;
        this._getIconSize = null;
        this._getParityOffset = null;
        this._getShowDesktopItem = null;
    }

    sync(entries, animate) {
        if (pinnedSeparatorLength(
            entries,
            this._settings.get_boolean('show-pinned-app-separator'),
            TASKBAR_SEPARATOR_EXTENT
        ) === 0) {
            this.clear(true);
            return;
        }

        let created = false;
        if (!this.actor) {
            const {separator, line} = createTaskbarSeparator();
            this.actor = separator;
            this._line = line;
            this.actor._taskbarIsPinnedSeparator = true;
            this._taskbarActor.add_child(this.actor);
            created = true;
        }

        this.syncGeometry();
        if (!created) {
            this.actor.remove_all_transitions();
            this.actor.opacity = 255;
        }
        const separatorIndex = entries.findIndex(entry =>
            !entry.isLauncher && !entry.isPinnedPrimary
        );
        placeTaskbarItemAtIndex(
            this._taskbarActor,
            this.actor,
            separatorIndex,
            this._getShowDesktopItem()
        );
        if (created && animate)
            animateSeparatorIn(
                this.actor,
                panelIsVertical(this._settings)
            );
    }

    syncGeometry() {
        if (!this.actor)
            return;

        const vertical = panelIsVertical(this._settings);
        syncSeparatorGeometry(
            this.actor,
            this._line,
            vertical,
            this._getIconSize(),
            this._getParityOffset()
        );
        this.actor[
            vertical ? 'height' : 'width'
        ] = TASKBAR_SEPARATOR_EXTENT;
    }

    clear(animate = false) {
        if (!this.actor)
            return;

        const separator = this.actor;
        this.actor = null;
        this._line = null;
        separator.animatingOut = true;
        if (animateSeparatorOut(
            separator,
            panelIsVertical(this._settings),
            () => separator.destroy(),
            animate && separator.get_stage()
        ))
            return;

        separator.destroy();
    }
}
