// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import {panelButtonCornerRadiusKey} from '../shared/taskbarPanelModes.js';

const CORNER_RADIUS_CLASS = 'simple-taskbar-panel-button-radius';
const THEME_CORNER_RADIUS = -1;

export class PanelButtonCornerRadiusController {
    constructor(settings, boxes, getHoverInset) {
        this._settings = settings;
        this._boxes = boxes;
        this._getHoverInset = getHoverInset;
        this._actors = new Map();
        this._radiusClass = null;
    }

    enable() {
        this._settings.connectObject(
            'changed::panel-button-corner-radius', () => this.sync(),
            'changed::default-panel-button-corner-radius', () => this.sync(),
            'changed::default-gnome-panel', () => this.sync(),
            'changed::windows-xp-theme-enabled', () => this.sync(),
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
            this._setRadiusClass(actor, this._radiusClass, null);
        }
        this._actors.clear();
        this._settings = null;
        this._boxes = null;
        this._getHoverInset = null;
    }

    sync() {
        const radius = this._settings.get_int(panelButtonCornerRadiusKey(this._settings));
        const radiusClass = radius === THEME_CORNER_RADIUS || this._settings.get_boolean('windows-xp-theme-enabled')
            ? null : `${CORNER_RADIUS_CLASS}-${radius + this._getHoverInset()}`;
        const previousClass = this._radiusClass;
        this._radiusClass = radiusClass;
        if (radiusClass !== previousClass) {
            for (const actor of this._actors.keys())
                this._setRadiusClass(actor, previousClass, radiusClass);
        }
        for (const box of this._boxes)
            this._addSubtree(box);
    }

    _addSubtree(actor) {
        if (actor instanceof St.Widget && actor.has_style_class_name('panel-button') && !this._actors.has(actor)) {
            const destroyId = actor.connect('destroy', () => this._actors.delete(actor));
            this._actors.set(actor, destroyId);
            this._setRadiusClass(actor, null, this._radiusClass);
        }
        for (const child of actor.get_children())
            this._addSubtree(child);
    }

    _removeSubtree(actor) {
        const destroyId = this._actors.get(actor);
        if (destroyId) {
            actor.disconnect(destroyId);
            this._actors.delete(actor);
            this._setRadiusClass(actor, this._radiusClass, null);
        }
        for (const child of actor.get_children())
            this._removeSubtree(child);
    }

    _setRadiusClass(actor, previousClass, radiusClass) {
        const classes = actor.get_style_class_name().split(/\s+/)
            .filter(style => style && style !== previousClass && style !== CORNER_RADIUS_CLASS);
        if (radiusClass)
            classes.push(CORNER_RADIUS_CLASS, radiusClass);
        actor.set_style_class_name(classes.join(' '));
    }
}
