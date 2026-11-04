// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import {panelButtonCornerRadiusKey, panelButtonsFollowAppHighlightKey} from '../shared/taskbarPanelModes.js';

const CORNER_RADIUS_CLASS = 'simple-taskbar-panel-button-radius';
const THEME_CORNER_RADIUS = -1;
const HIGHLIGHT_EXCLUDED_CLASSES = [
    'simple-taskbar-start',
    'simple-taskbar-show-desktop',
    'screen-recording-indicator',
    'screen-sharing-indicator',
];

const PANEL_BUTTON_HIGHLIGHT_CLASS = 'simple-taskbar-panel-button-highlight';
const PANEL_BUTTON_HIGHLIGHT_CLOCK_CLASS = 'simple-taskbar-panel-button-highlight-clock';

function panelButtonsFollowAppHighlight(settings) {
    return settings.get_boolean(panelButtonsFollowAppHighlightKey(settings)) &&
        !settings.get_boolean('windows-xp-theme-enabled');
}

export class PanelButtonCornerRadiusController {
    constructor(settings, boxes, getHoverInset, onHighlightChanged, followAppHighlight = panelButtonsFollowAppHighlight) {
        this._settings = settings;
        this._boxes = boxes;
        this._getHoverInset = getHoverInset;
        this._onHighlightChanged = onHighlightChanged;
        this._followAppHighlightEnabled = followAppHighlight;
        this._actors = new Map();
        this._radiusClass = null;
        this._followAppHighlight = false;
    }

    enable() {
        this._settings.connectObject(
            'changed::panel-button-corner-radius', () => this.sync(),
            'changed::default-panel-button-corner-radius', () => this.sync(),
            'changed::default-gnome-panel', () => this.sync(),
            'changed::windows-xp-theme-enabled', () => this.sync(),
            'changed::panel-buttons-follow-app-highlight', () => this.sync(),
            'changed::default-panel-buttons-follow-app-highlight', () => this.sync(),
            this
        );
        for (const box of this._boxes) {
            box.connectObject(
                'child-added', (_box, actor) => this._addSubtree(actor),
                'child-removed', (_box, actor) => this._removeSubtree(actor),
                this
            );
        }
        this.sync();
    }

    destroy() {
        this._settings.disconnectObject(this);
        for (const box of this._boxes)
            box.disconnectObject(this);
        for (const [actor, destroyId] of this._actors) {
            actor.disconnect(destroyId);
            this._syncClasses(actor, false);
        }
        this._actors.clear();
        this._settings = null;
        this._boxes = null;
        this._getHoverInset = null;
        this._onHighlightChanged = null;
        this._followAppHighlightEnabled = null;
    }

    sync() {
        const radius = this._settings.get_int(panelButtonCornerRadiusKey(this._settings));
        const radiusClass = radius === THEME_CORNER_RADIUS || this._settings.get_boolean('windows-xp-theme-enabled')
            ? null : `${CORNER_RADIUS_CLASS}-${radius + this._getHoverInset()}`;
        const followAppHighlight = this._followAppHighlightEnabled(this._settings);
        if (radiusClass !== this._radiusClass || followAppHighlight !== this._followAppHighlight) {
            this._radiusClass = radiusClass;
            this._followAppHighlight = followAppHighlight;
            for (const actor of this._actors.keys())
                this._syncClasses(actor, true);
        }
        for (const box of this._boxes)
            this._addSubtree(box);
    }

    _addSubtree(actor) {
        if (actor instanceof St.Widget && actor.has_style_class_name('panel-button') && !this._actors.has(actor)) {
            const destroyId = actor.connect('destroy', () => {
                this._actors.delete(actor);
                this._onHighlightChanged(actor, false);
            });
            this._actors.set(actor, destroyId);
            this._syncClasses(actor, true);
        }
        for (const child of actor.get_children())
            this._addSubtree(child);
    }

    _removeSubtree(actor) {
        const destroyId = this._actors.get(actor);
        if (destroyId) {
            actor.disconnect(destroyId);
            this._actors.delete(actor);
            this._syncClasses(actor, false);
        }
        for (const child of actor.get_children())
            this._removeSubtree(child);
    }

    _highlightClass(actor) {
        if (!this._followAppHighlight ||
            HIGHLIGHT_EXCLUDED_CLASSES.some(styleClass => actor.has_style_class_name(styleClass)))
            return null;

        return actor.has_style_class_name('clock-display')
            ? PANEL_BUTTON_HIGHLIGHT_CLOCK_CLASS
            : PANEL_BUTTON_HIGHLIGHT_CLASS;
    }

    _syncClasses(actor, applied) {
        const classes = actor.get_style_class_name().split(/\s+/)
            .filter(style => style && !style.startsWith(CORNER_RADIUS_CLASS) &&
                style !== PANEL_BUTTON_HIGHLIGHT_CLASS && style !== PANEL_BUTTON_HIGHLIGHT_CLOCK_CLASS);
        if (applied && this._radiusClass)
            classes.push(CORNER_RADIUS_CLASS, this._radiusClass);
        const highlightClass = applied ? this._highlightClass(actor) : null;
        if (highlightClass)
            classes.push(highlightClass);
        actor.set_style_class_name(classes.join(' '));
        this._onHighlightChanged(actor, Boolean(highlightClass));
    }
}
