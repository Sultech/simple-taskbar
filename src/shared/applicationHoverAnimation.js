import {
    APPLICATION_CLICK_ANIMATION,
} from './applicationClickAnimation.js';

export const APP_ICON_HOVER_ANIMATION = {
    NONE: 'none',
    SIMPLE: 'simple',
    RIPPLE: 'ripple',
    MAGNIFY: 'magnify',
};

export const APP_ICON_HOVER_RENDER_SCALE = 2;

export const APP_ICON_HOVER_ANIMATION_SETTINGS = {
    duration: 'animate-appicon-hover-animation-duration',
    expansion: 'animate-appicon-hover-animation-expansion',
    rotation: 'animate-appicon-hover-animation-rotation',
    travel: 'animate-appicon-hover-animation-travel',
    zoom: 'animate-appicon-hover-animation-zoom',
    convexity: 'animate-appicon-hover-animation-convexity',
    extent: 'animate-appicon-hover-animation-extent',
};

export function hoverRenderScale(settings) {
    const hover = settings.get_string(
        'animate-appicon-hover-animation-type'
    );
    return hover === APP_ICON_HOVER_ANIMATION.NONE
        ? 1
        : APP_ICON_HOVER_RENDER_SCALE;
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
