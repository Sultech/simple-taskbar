// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {RunningIndicator} from '../taskbar/runningIndicator.js';

const INDICATOR_GAP = 2;
const INDICATOR_LENGTH = 24;

const StartMenuIconStack = GObject.registerClass(
class StartMenuIconStack extends St.Widget {
    _init(icon, indicator) {
        super._init({
            x_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: false,
        });
        this._icon = icon;
        this._indicator = indicator;
        this._edge = 'bottom';
        this.add_child(icon);
        this.add_child(indicator);
    }

    setIndicatorEdge(edge) {
        if (this._edge === edge)
            return;

        this._edge = edge;
        this.queue_relayout();
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
        let x = Math.floor((width - indicatorWidth) / 2);
        let y = Math.floor((height - indicatorHeight) / 2);
        if (this._edge === 'top')
            y = -indicatorHeight - INDICATOR_GAP;
        else if (this._edge === 'left')
            x = -indicatorWidth - INDICATOR_GAP;
        else if (this._edge === 'right')
            x = width + INDICATOR_GAP;
        else
            y = height + INDICATOR_GAP;

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
            'running-indicator-position',
            'running-indicator-size',
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
        const indicator = new RunningIndicator(
            'simple-taskbar-windows-start-running-indicator'
        );
        indicator.visible = false;
        const stack = new StartMenuIconStack(icon, indicator);
        indicator._startMenuStack = stack;
        this._indicators.set(indicator, app);
        // C-side actor disposal can bypass a custom destroy() override.
        indicator.connect('destroy', () => {
            app.disconnectObject(indicator);
            this._indicators.delete(indicator);
        });
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

        const position = this._settings.get_string(
            'running-indicator-position'
        );
        indicator._startMenuStack.setIndicatorEdge(position);
        indicator.update({
            x: 0,
            y: 0,
            length: INDICATOR_LENGTH,
            cross: 0,
            inset: 0,
            thickness: this._settings.get_int('running-indicator-size'),
            position,
            style: this._settings.get_string('running-indicator-style'),
            count: windows.length,
            focused: false,
            color: this._settings.get_boolean(
                'custom-indicator-colors-enabled'
            )
                ? this._settings.get_string('unfocused-indicator-color')
                : null,
        });
    }
}
