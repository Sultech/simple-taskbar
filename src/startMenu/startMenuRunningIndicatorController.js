// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

const SINGLE_WINDOW_WIDTH = 8;
const MULTIPLE_WINDOW_WIDTH = 18;
const INDICATOR_GAP = 2;

const StartMenuRunningIndicator = GObject.registerClass(
class StartMenuRunningIndicator extends St.Widget {
    _init(onDestroy) {
        super._init({
            style_class: 'simple-taskbar-windows-start-running-indicator',
            visible: false,
        });
        this.connect('destroy', () => onDestroy(this));
    }
});

const StartMenuIconStack = GObject.registerClass(
class StartMenuIconStack extends St.Widget {
    _init(icon, indicator) {
        super._init({
            x_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: false,
        });
        this._icon = icon;
        this._indicator = indicator;
        this.add_child(icon);
        this.add_child(indicator);
    }

    vfunc_get_preferred_width(forHeight) {
        return this._icon.get_preferred_width(forHeight);
    }

    vfunc_get_preferred_height(forWidth) {
        return this._icon.get_preferred_height(forWidth);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const width = box.x2 - box.x1;
        const height = box.y2 - box.y1;
        const iconBox = new Clutter.ActorBox({
            x1: 0,
            y1: 0,
            x2: width,
            y2: height,
        });
        this._icon.allocate_align_fill(
            iconBox,
            0.5,
            0.5,
            false,
            false
        );

        if (!this._indicator.visible)
            return;

        const [, indicatorWidth] =
            this._indicator.get_preferred_width(-1);
        const [, indicatorHeight] =
            this._indicator.get_preferred_height(indicatorWidth);
        const x = Math.floor((width - indicatorWidth) / 2);
        const y = height + INDICATOR_GAP;
        this._indicator.allocate(new Clutter.ActorBox({
            x1: x,
            y1: y,
            x2: x + indicatorWidth,
            y2: y + indicatorHeight,
        }));
    }
});

export class StartMenuRunningIndicatorController {
    constructor(settings, getInterestingWindows) {
        this._settings = settings;
        this._getInterestingWindows = getInterestingWindows;
        this._signalHolder = new TransientSignalHolder();
        this._indicators = new Map();

        for (const key of [
            'start-menu-running-indicators',
            'running-indicator-style',
            'custom-indicator-colors-enabled',
            'unfocused-indicator-color',
            'windows-xp-theme-enabled',
            'isolate-workspaces',
            'isolate-monitors',
        ]) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this.sync(),
                this._signalHolder
            );
        }
        global.window_manager.connectObject(
            'switch-workspace', () => this.sync(),
            this._signalHolder
        );
        global.display.connectObject(
            'window-entered-monitor', () => this.sync(),
            'window-left-monitor', () => this.sync(),
            this._signalHolder
        );
    }

    createIconStack(app, icon) {
        const indicator = new StartMenuRunningIndicator(actor => {
            app.disconnectObject(actor);
            this._indicators.delete(actor);
        });
        const stack = new StartMenuIconStack(icon, indicator);
        this._indicators.set(indicator, app);
        app.connectObject(
            'windows-changed', () => this._syncIndicator(indicator, app),
            'notify::state', () => this._syncIndicator(indicator, app),
            indicator
        );
        this._syncIndicator(indicator, app);
        return stack;
    }

    sync() {
        for (const [indicator, app] of this._indicators)
            this._syncIndicator(indicator, app);
    }

    destroy() {
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._indicators.clear();
        this._indicators = null;
        this._getInterestingWindows = null;
        this._settings = null;
    }

    _syncIndicator(indicator, app) {
        const enabled = this._settings.get_boolean(
            'start-menu-running-indicators'
        ) && !this._settings.get_boolean('windows-xp-theme-enabled');
        const windows = this._getInterestingWindows(app);
        const running = app.state === Shell.AppState.RUNNING &&
            windows.length > 0;
        indicator.visible = enabled && running;
        if (!indicator.visible)
            return;

        indicator.set_width(
            windows.length > 1
                ? MULTIPLE_WINDOW_WIDTH
                : SINGLE_WINDOW_WIDTH
        );
        const rounded = this._settings.get_string(
            'running-indicator-style'
        ) === 'rounded';
        indicator.set_style_class_name(
            'simple-taskbar-windows-start-running-indicator' +
            (rounded ? ' rounded' : '')
        );
        const color = this._settings.get_boolean(
            'custom-indicator-colors-enabled'
        )
            ? this._settings.get_string('unfocused-indicator-color')
            : null;
        indicator.set_style(
            color ? `background-color: ${color};` : null
        );
    }
}
