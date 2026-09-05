// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    APP_ICON_HOVER_ANIMATION,
    APP_ICON_HOVER_ANIMATION_SETTINGS,
    APP_ICON_HOVER_RENDER_SCALE,
    hoverRenderScale,
    iconRenderScale,
} from '../shared/applicationHoverAnimation.js';

export class TaskbarHoverAnimationSettings {
    constructor({settings, getIconSize}) {
        this._settings = settings;
        this._getIconSize = getIconSize;
        this._profileCache = new Map();
        this._animationTypeCache = null;
        this._panelPositionCache = null;
        this._renderScaleCache = null;
        this._hoverRenderScaleCache = null;
    }

    getAnimationType() {
        if (this._animationTypeCache === null) {
            const type = this._settings.get_string(
                'animate-appicon-hover-animation-type'
            );
            this._animationTypeCache = type === APP_ICON_HOVER_ANIMATION.NONE
                ? ''
                : type;
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
            profile[property] = values[type] ??
                this._settings.get_default_value(key).deepUnpack()[type];
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

    getRenderScale() {
        this._renderScaleCache ??= iconRenderScale(this._settings);
        return this._renderScaleCache;
    }

    getHoverRenderScale() {
        this._hoverRenderScaleCache ??= hoverRenderScale(this._settings);
        return this._hoverRenderScaleCache;
    }

    syncIconResolution(item) {
        const iconSize = this._getIconSize();
        const icon = item._taskbarIcon;
        const renderScale = this.getRenderScale();
        if (renderScale === APP_ICON_HOVER_RENDER_SCALE) {
            icon.icon_size = iconSize * APP_ICON_HOVER_RENDER_SCALE;
            icon.set_size(iconSize, iconSize);
        } else {
            icon.icon_size = iconSize;
            icon.set_size(-1, -1);
        }
        item._taskbarIndicator.setRenderScale(this.getHoverRenderScale());
    }

    invalidate() {
        this._profileCache.clear();
        this._animationTypeCache = null;
        this._panelPositionCache = null;
        this._renderScaleCache = null;
        this._hoverRenderScaleCache = null;
    }

    destroy() {
        this._profileCache = null;
        this._animationTypeCache = null;
        this._panelPositionCache = null;
        this._renderScaleCache = null;
        this._hoverRenderScaleCache = null;
        this._getIconSize = null;
        this._settings = null;
    }
}
