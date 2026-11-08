// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {BLUR_MY_SHELL_PANEL_STYLES} from '../shared/blurMyShellUtils.js';
import {panelIsVertical, panelPosition} from '../shared/panelPositionUtils.js';
import {PANEL_BLUR_CLASSES} from './panelBlurClasses.js';

export const BLUR_MY_SHELL_PANEL_CLASSES = new Set(BLUR_MY_SHELL_PANEL_STYLES);

const OWN_BLUR_CLASSES = new Set(PANEL_BLUR_CLASSES);
const PANEL_EDGE_CLASSES = new Set([
    'simple-taskbar-panel-top',
    'simple-taskbar-panel-bottom',
    'simple-taskbar-panel-left',
    'simple-taskbar-panel-right',
]);

export function actorStyleClasses(actor, styles) {
    return actor.get_style_class_name()
        .split(/\s+/)
        .filter(style => styles.has(style));
}

export function syncSecondaryPanelClasses(actor, settings, {
    isExcluded = () => false,
    keptClasses,
    extraClasses = [],
}) {
    const classes = Main.panel.get_style_class_name()
        .split(/\s+/)
        .filter(style => style &&
            !PANEL_EDGE_CLASSES.has(style) &&
            style !== 'simple-taskbar-panel-vertical' &&
            !BLUR_MY_SHELL_PANEL_CLASSES.has(style) &&
            !OWN_BLUR_CLASSES.has(style) &&
            !isExcluded(style));
    classes.push(...keptClasses, 'simple-taskbar-panel', 'simple-taskbar-secondary-panel', ...extraClasses);
    if (panelIsVertical(settings))
        classes.push('simple-taskbar-panel-vertical');
    classes.push(`simple-taskbar-panel-${panelPosition(settings)}`);
    actor.set_style_class_name([...new Set(classes)].join(' '));
}
