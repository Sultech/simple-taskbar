// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Cogl from 'gi://Cogl';

import {panelPosition} from './panelPosition.js';
import {panelTransparencyOpacity} from '../transparencyUtils.js';

const DARK_BORDER_COLOR = '255, 255, 255';
const LIGHT_BORDER_COLOR = '0, 0, 0';
const BORDER_OPACITY = 0.20;

function panelBackgroundColor(settings, light) {
    if (!settings.get_boolean('custom-panel-color-enabled'))
        return light ? '224, 229, 238' : '24, 24, 27';

    const [, color] = Cogl.Color.from_string(
        settings.get_string('custom-panel-color')
    );
    return `${color.red}, ${color.green}, ${color.blue}`;
}

export function panelBorderStyle(settings, light, borderEnabled,
    fullBorder = false, important = false) {
    const position = panelPosition(settings);
    const borderColor = light
        ? LIGHT_BORDER_COLOR
        : DARK_BORDER_COLOR;
    const priority = important ? ' !important' : '';
    let borderStyle =
        `border-top: 0${priority}; ` +
        `border-bottom: 0${priority}; ` +
        `border-left: 0${priority}; ` +
        `border-right: 0${priority}; `;
    if (borderEnabled && fullBorder) {
        borderStyle += 'border: 1px solid ' +
            `rgba(${borderColor}, ${BORDER_OPACITY.toFixed(3)})` +
            `${priority}; `;
    } else if (borderEnabled) {
        const borderEdge = {
            top: 'bottom',
            bottom: 'top',
            left: 'right',
            right: 'left',
        }[position];
        borderStyle += `border-${borderEdge}: 1px solid ` +
            `rgba(${borderColor}, ${BORDER_OPACITY.toFixed(3)})` +
            `${priority}; `;
    }
    return borderStyle;
}

export function panelBackgroundStyle(settings, light, borderEnabled,
    originalStyle = '', fullBorder = false) {
    const opacity = panelTransparencyOpacity(settings);
    const background = panelBackgroundColor(settings, light);
    const borderStyle = panelBorderStyle(
        settings,
        light,
        borderEnabled,
        fullBorder
    );
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
