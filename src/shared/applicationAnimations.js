// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    activePanelPosition,
    positionIsVertical,
} from './panelPositionUtils.js';

export const WINDOW_MINIMIZE_EFFECT = Object.freeze({
    GNOME_DEFAULT: 'gnome-default',
    MAGIC_LAMP: 'magic-lamp',
});

export const APPLICATION_CLICK_ANIMATION = Object.freeze({
    NONE: 'none',
    GNOME_ZOOM_OUT: 'gnome-zoom-out',
    BOUNCE: 'bounce',
    JUMP: 'jump',
    HEARTBEAT: 'heartbeat',
    SQUISH: 'squish',
    JELLY: 'jelly',
    SPIN: 'spin',
    SPIN_3D: 'spin_3d',
    FLIP: 'flip',
    ROLL: 'roll',
    ZOOM_FADE: 'zoom_fade',
    SQUEEZE: 'squeeze',
    GLOW: 'glow',
    DIM: 'dim',
    TADA: 'tada',
    SWING: 'swing',
    SHAKE: 'shake',
    MOVE_UP: 'move_up',
    MOVE_DOWN: 'move_down',
    MOVE_LEFT: 'move_left',
    MOVE_RIGHT: 'move_right',
    ENLARGE: 'enlarge',
    SHRINK: 'shrink',
});

export const APP_ICON_HOVER_ANIMATION = {
    NONE: 'none',
    SIMPLE: 'simple',
    RIPPLE: 'ripple',
    MAGNIFY: 'magnify',
};

export const APP_ICON_HOVER_RENDER_SCALE = 2;

export const APP_ICON_HOVER_ANIMATION_SETTINGS = {
    duration: 'animate-appicon-hover-animation-duration',
    rotation: 'animate-appicon-hover-animation-rotation',
    travel: 'animate-appicon-hover-animation-travel',
    zoom: 'animate-appicon-hover-animation-zoom',
    convexity: 'animate-appicon-hover-animation-convexity',
    extent: 'animate-appicon-hover-animation-extent',
};

export const APP_ICON_MAGNIFY_SETTING_KEYS = Object.freeze([
    'combine-app-buttons-mode',
    'dock-mode',
    'dock-position',
    'hide-app-labels',
    'panel-position',
]);

export function appIconMagnifyAllowed(settings) {
    if (settings.isDefaultPanelWindows)
        return false;
    return positionIsVertical(activePanelPosition(settings)) ||
        settings.get_string('combine-app-buttons-mode') === 'always' ||
        settings.get_boolean('hide-app-labels');
}

export function hoverRenderScale(settings) {
    const hover = settings.get_string(
        'animate-appicon-hover-animation-type'
    );
    return hover === APP_ICON_HOVER_ANIMATION.NONE
        ? 1
        : APP_ICON_HOVER_RENDER_SCALE;
}

export function applyIconRenderScale(icon, iconSize, renderScale) {
    if (renderScale === APP_ICON_HOVER_RENDER_SCALE) {
        icon.icon_size = iconSize * APP_ICON_HOVER_RENDER_SCALE;
        icon.set_size(iconSize, iconSize);
    } else {
        icon.icon_size = iconSize;
        icon.set_size(-1, -1);
    }
}

export function iconRenderScale(settings) {
    if (hoverRenderScale(settings) === APP_ICON_HOVER_RENDER_SCALE)
        return APP_ICON_HOVER_RENDER_SCALE;

    const click = settings.get_string('application-click-animation');
    if (click !== APPLICATION_CLICK_ANIMATION.NONE &&
        click !== APPLICATION_CLICK_ANIMATION.GNOME_ZOOM_OUT) {
        return APP_ICON_HOVER_RENDER_SCALE;
    }

    return 1;
}
