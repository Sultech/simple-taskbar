// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {MagicLampEffect} from './magicLampEffect.js';
import {
    WINDOW_MINIMIZE_EFFECT,
} from '../shared/windowMinimizeEffect.js';

const MAGIC_LAMP_EFFECT_NAME = 'simple-taskbar-magic-lamp';

export class WindowMinimizeEffectController {
    constructor(settings) {
        this._settings = settings;
        this._windowManager = Main.wm;
        this._shellWindowManager = global.window_manager;
        this._signalHolder = new TransientSignalHolder();
        this._pendingActors = new Map();
        this._activeActors = new Set();
        this._originalShouldAnimateActor = null;
        this._originalCompletedMinimize = null;
        this._originalCompletedUnminimize = null;
    }

    enable() {
        this._originalShouldAnimateActor =
            this._windowManager._shouldAnimateActor;
        this._originalCompletedMinimize =
            this._shellWindowManager.completed_minimize;
        this._originalCompletedUnminimize =
            this._shellWindowManager.completed_unminimize;

        this._windowManager._shouldAnimateActor = (actor, types) => {
            const shouldAnimate = this._originalShouldAnimateActor.call(
                this._windowManager,
                actor,
                types
            );
            if (!shouldAnimate || !this._isMinimizeWindowTypes(types))
                return shouldAnimate;

            const iconGeometry = this._getIconGeometry(actor);
            if (!iconGeometry)
                return shouldAnimate;

            this._pendingActors.set(actor, iconGeometry);
            return false;
        };
        this._shellWindowManager.completed_minimize = actor => {
            if (this._pendingActors.has(actor))
                return;

            this._originalCompletedMinimize.call(
                this._shellWindowManager,
                actor
            );
        };
        this._shellWindowManager.completed_unminimize = actor => {
            if (this._pendingActors.has(actor))
                return;

            this._originalCompletedUnminimize.call(
                this._shellWindowManager,
                actor
            );
        };

        this._shellWindowManager.connectObject(
            'minimize', (_shellwm, actor) => this._onMinimize(actor),
            'unminimize', (_shellwm, actor) => this._onUnminimize(actor),
            this._signalHolder
        );
    }

    destroy() {
        this._signalHolder.destroy();
        for (const actor of [...this._activeActors]) {
            const effect = actor.get_effect(MAGIC_LAMP_EFFECT_NAME);
            if (effect)
                effect.cancel();
        }
        this._activeActors.clear();
        this._pendingActors.clear();
        this._windowManager._shouldAnimateActor =
            this._originalShouldAnimateActor;
        this._shellWindowManager.completed_minimize =
            this._originalCompletedMinimize;
        this._shellWindowManager.completed_unminimize =
            this._originalCompletedUnminimize;
        this._originalShouldAnimateActor = null;
        this._originalCompletedMinimize = null;
        this._originalCompletedUnminimize = null;
        this._signalHolder = null;
        this._activeActors = null;
        this._pendingActors = null;
        this._shellWindowManager = null;
        this._windowManager = null;
        this._settings = null;
    }

    _onMinimize(actor) {
        const iconGeometry = this._pendingActors.get(actor);
        if (!iconGeometry)
            return;

        this._pendingActors.delete(actor);
        this._startEffect(actor, iconGeometry, false);
    }

    _onUnminimize(actor) {
        const iconGeometry = this._pendingActors.get(actor);
        if (!iconGeometry)
            return;

        this._pendingActors.delete(actor);
        this._startEffect(actor, iconGeometry, true);
    }

    _startEffect(actor, iconGeometry, restore) {
        const oldEffect = actor.get_effect(MAGIC_LAMP_EFFECT_NAME);
        if (oldEffect)
            oldEffect.cancel();

        actor.remove_all_transitions();
        actor.set_scale(1, 1);
        actor.set_opacity(255);
        actor.set_pivot_point(0, 0);
        if (restore)
            actor.show();

        this._activeActors.add(actor);
        actor.add_effect_with_name(
            MAGIC_LAMP_EFFECT_NAME,
            new MagicLampEffect(
                iconGeometry,
                this._settings.get_string('panel-position'),
                restore,
                effectActor => this._onEffectDone(effectActor, restore)
            )
        );
    }

    _onEffectDone(actor, restore) {
        this._activeActors.delete(actor);
        actor.remove_all_transitions();
        actor.set_scale(1, 1);
        actor.set_opacity(255);
        actor.set_pivot_point(0, 0);
        if (restore) {
            actor.show();
            this._originalCompletedUnminimize.call(
                this._shellWindowManager,
                actor
            );
        } else {
            actor.hide();
            this._originalCompletedMinimize.call(
                this._shellWindowManager,
                actor
            );
        }
    }

    _getIconGeometry(actor) {
        if (this._settings.get_string('window-minimize-effect') !==
            WINDOW_MINIMIZE_EFFECT.MAGIC_LAMP ||
            !St.Settings.get().enable_animations) {
            return null;
        }

        const [success, geometry] = actor.meta_window.get_icon_geometry();
        if (!success || geometry.width <= 0 || geometry.height <= 0)
            return null;

        return {
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
        };
    }

    _isMinimizeWindowTypes(types) {
        return types.length === 3 &&
            types[0] === Meta.WindowType.NORMAL &&
            types[1] === Meta.WindowType.MODAL_DIALOG &&
            types[2] === Meta.WindowType.DIALOG;
    }
}
