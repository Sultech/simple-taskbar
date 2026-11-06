// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {isDefaultPanelWithoutDock} from '../shared/panelModeProfiles.js';
import {MagicLampEffect} from './magicLampEffect.js';
import {iconScreenGeometry, setWindowIconGeometry} from './taskbarIconGeometryController.js';
import {
    WINDOW_MINIMIZE_EFFECT,
} from '../shared/windowMinimizeEffect.js';
import {activePanelPosition} from '../shared/panelPositionUtils.js';

const MAGIC_LAMP_EFFECT_NAME = 'simple-taskbar-magic-lamp';

export class WindowMinimizeEffectController {
    constructor(settings) {
        this._settings = settings;
        this._windowManager = Main.wm;
        this._shellWindowManager = global.window_manager;
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

            const target = this._getAnimationTarget(actor);
            if (!target)
                return shouldAnimate;

            if (this._settings.get_string('window-minimize-effect') === WINDOW_MINIMIZE_EFFECT.GNOME_DEFAULT) {
                setWindowIconGeometry(actor.meta_window, target.geometry);
                return shouldAnimate;
            }

            this._pendingActors.set(actor, target);
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
            this
        );
    }

    destroy() {
        this._shellWindowManager.disconnectObject(this);
        for (const actor of [...this._activeActors]) {
            const effect = actor.get_effect(MAGIC_LAMP_EFFECT_NAME);
            if (effect)
                effect.finish();
        }
        this._activeActors.clear();
        this._pendingActors.clear();
        for (const actor of global.get_window_actors())
            actor.meta_window._simpleTaskbarRestoreTarget = null;
        this._windowManager._shouldAnimateActor =
            this._originalShouldAnimateActor;
        this._shellWindowManager.completed_minimize =
            this._originalCompletedMinimize;
        this._shellWindowManager.completed_unminimize =
            this._originalCompletedUnminimize;
        this._originalShouldAnimateActor = null;
        this._originalCompletedMinimize = null;
        this._originalCompletedUnminimize = null;
        this._activeActors = null;
        this._pendingActors = null;
        this._shellWindowManager = null;
        this._windowManager = null;
        this._settings = null;
    }

    _onMinimize(actor) {
        const target = this._pendingActors.get(actor);
        if (!target)
            return;

        this._pendingActors.delete(actor);
        this._startEffect(actor, target, false);
    }

    _onUnminimize(actor) {
        const target = this._pendingActors.get(actor);
        actor.meta_window._simpleTaskbarRestoreTarget = null;
        if (!target)
            return;

        this._pendingActors.delete(actor);
        this._startEffect(actor, target, true);
    }

    _startEffect(actor, target, restore) {
        const oldEffect = actor.get_effect(MAGIC_LAMP_EFFECT_NAME);
        if (oldEffect)
            oldEffect.finish();

        actor.remove_all_transitions();
        actor.set_scale(1, 1);
        actor.set_opacity(255);
        actor.set_pivot_point(0, 0);
        if (restore)
            actor.show();

        const window = actor.meta_window;
        this._activeActors.add(actor);
        actor.add_effect_with_name(
            MAGIC_LAMP_EFFECT_NAME,
            new MagicLampEffect(
                target.geometry,
                () => restore && target.type === 'preview' ? null : this._liveIconGeometry(window, target.type),
                target.position,
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

    _getAnimationTarget(actor) {
        if (isDefaultPanelWithoutDock(this._settings)) {
            return null;
        }

        if (!St.Settings.get().enable_animations) {
            return null;
        }

        const window = actor.meta_window;
        if (!window.minimized && window._simpleTaskbarRestoreTarget)
            return {...window._simpleTaskbarRestoreTarget};

        if (window.minimized && window._simpleTaskbarMinimizePreviewTarget) {
            const target = window._simpleTaskbarMinimizePreviewTarget();
            if (target)
                return {...target, type: 'locations'};
        }

        const position = window._simpleTaskbarIconActor
            ? window._simpleTaskbarIconPosition
            : activePanelPosition(this._settings);
        const live = this._liveIconGeometry(window, 'app');
        if (live)
            return {geometry: live, position, type: 'app'};

        const [success, geometry] = window.get_icon_geometry();
        if (!success || geometry.width <= 0 || geometry.height <= 0)
            return null;

        return {
            geometry: {
                x: geometry.x,
                y: geometry.y,
                width: geometry.width,
                height: geometry.height,
            },
            position,
            type: 'app',
        };
    }

    _liveIconGeometry(window, type) {
        if (type === 'locations') {
            const getTarget = window._simpleTaskbarMinimizePreviewTarget;
            const target = getTarget ? getTarget() : null;
            return target ? target.geometry : null;
        }
        const icon = window._simpleTaskbarIconActor;
        return icon ? iconScreenGeometry(icon) : null;
    }

    _isMinimizeWindowTypes(types) {
        return types.length === 3 &&
            types[0] === Meta.WindowType.NORMAL &&
            types[1] === Meta.WindowType.MODAL_DIALOG &&
            types[2] === Meta.WindowType.DIALOG;
    }
}
