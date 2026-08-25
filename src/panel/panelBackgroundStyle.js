// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Cogl from 'gi://Cogl';

import {panelIsTop} from './panelPosition.js';
import {panelTransparencyOpacity} from '../transparencyUtils.js';

const BORDER_COLOR = '255, 255, 255';
const BORDER_OPACITY = 0.20;

function panelBackgroundColor(settings, light) {
    if (!settings.get_boolean('custom-panel-color-enabled'))
        return light ? '224, 229, 238' : '24, 24, 27';

    const [, color] = Cogl.Color.from_string(
        settings.get_string('custom-panel-color')
    );
    return `${color.red}, ${color.green}, ${color.blue}`;
}

export function panelBackgroundStyle(settings, light, borderEnabled,
    originalStyle = '') {
    const opacity = panelTransparencyOpacity(settings);
    const background = panelBackgroundColor(settings, light);
    const top = panelIsTop(settings);
    let borderStyle = 'border-top: 0; border-bottom: 0; ';
    if (borderEnabled) {
        borderStyle = top
            ? `border-top: 0; border-bottom: 1px solid ` +
                `rgba(${BORDER_COLOR}, ${BORDER_OPACITY.toFixed(3)}); `
            : `border-top: 1px solid ` +
                `rgba(${BORDER_COLOR}, ${BORDER_OPACITY.toFixed(3)}); ` +
                'border-bottom: 0; ';
    }
    const transparencyStyle =
        `background-color: rgba(${background}, ` +
        `${opacity.toFixed(2)}) !important; ` +
        borderStyle +
        'box-shadow: none;';
    const separator = originalStyle.endsWith(';') ? ' ' : '; ';
    return originalStyle
        ? `${originalStyle}${separator}${transparencyStyle}`
        : transparencyStyle;
}
