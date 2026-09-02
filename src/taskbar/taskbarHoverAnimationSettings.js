// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    APP_ICON_HOVER_ANIMATION,
    APP_ICON_HOVER_ANIMATION_SETTINGS,
} from '../shared/applicationHoverAnimation.js';

const ICON_RESOLUTION_SCALE = 2;

export class TaskbarHoverAnimationSettings {
    constructor({settings, getIconSize}) {
        this._settings = settings;
        this._getIconSize = getIconSize;
        this._profileCache = new Map();
        this._animationTypeCache = null;
        this._panelPositionCache = null;
    }

    getAnimationType() {
        if (this._animationTypeCache === null) {
            this._animationTypeCache =
                this._settings.get_boolean('animate-appicon-hover')
                    ? this._settings.get_string(
                        'animate-appicon-hover-animation-type'
                    )
                    : '';
        }

        return this._animationTypeCache;
    }

    getAnimationProfile(type) {
        let profile = this._profileCache.get(type);
        if (profile)
            return profile;

        profile = {};
        for (const [property, key] of Object.entries(
            APP_ICON_HOVER_ANIMATION_SETTINGS
        )) {
            const values = this._settings.get_value(key).deepUnpack();
            profile[property] = values[type];
        }
        this._profileCache.set(type, profile);
        return profile;
    }

    getPanelPosition() {
        this._panelPositionCache ??=
            this._settings.get_string('panel-position');
        return this._panelPositionCache;
    }

    getExpansionDuration() {
        return this.getAnimationProfile(
            APP_ICON_HOVER_ANIMATION.MAGNIFY
        ).expansion;
    }

    syncIconResolution(item) {
        const iconSize = this._getIconSize();
        const icon = item._taskbarIcon;
        if (this._settings.get_boolean('animate-appicon-hover')) {
            icon.icon_size = iconSize * ICON_RESOLUTION_SCALE;
            icon.set_size(iconSize, iconSize);
        } else {
            icon.icon_size = iconSize;
            icon.set_size(-1, -1);
        }
    }

    invalidate() {
        this._profileCache.clear();
        this._animationTypeCache = null;
        this._panelPositionCache = null;
    }

    destroy() {
        this._profileCache = null;
        this._animationTypeCache = null;
        this._panelPositionCache = null;
        this._getIconSize = null;
        this._settings = null;
    }
}
