// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const AUTOMATIC_PADDING = -1;
const DEFAULT_BUTTON_PADDING_CLASS =
    'simple-taskbar-default-panel-button-padding';
const HOVER_INSET_CLASS_PREFIX =
    'simple-taskbar-panel-button-hover-inset-';
const JUST_PERFECTION_BUTTON_PADDING_PREFIX =
    'just-perfection-api-panel-button-padding-size';
const MINIMUM_PANEL_HEIGHT = 32;
const REGULAR_PANEL_HEIGHT = 49;
const MINIMUM_HOVER_INSET = 3;
const REGULAR_HOVER_INSET = 6;

export class PanelButtonPaddingController {
    constructor(settings, panelActor, panelBoxes) {
        this._settings = settings;
        this._panelActor = panelActor;
        this._panelBoxes = panelBoxes;
        this._signals = [];
        this._styledActors = new Map();
        this._hoverInsetClass = null;
    }

    enable() {
        this._connect(
            this._settings,
            'changed::panel-button-padding',
            () => this.sync()
        );
        this._connect(
            this._settings,
            'changed::panel-height',
            () => this._syncHoverInset()
        );
        this._connect(
            Main.layoutManager.uiGroup,
            'notify::style-class',
            () => this.sync()
        );
        for (const box of this._panelBoxes) {
            this._connect(box, 'child-added', (_box, actor) => {
                const padding =
                    this._settings.get_int('panel-button-padding');
                if (padding !== AUTOMATIC_PADDING)
                    this._applyToSubtree(actor, padding);
            });
            this._connect(box, 'child-removed', (_box, actor) => {
                this._restoreSubtree(actor);
            });
        }
        this._syncHoverInset();
        this.sync();
    }

    sync() {
        const padding = this._settings.get_int('panel-button-padding');
        this._panelActor.remove_style_class_name(
            DEFAULT_BUTTON_PADDING_CLASS
        );
        if (padding === AUTOMATIC_PADDING) {
            this._restoreAll();
            if (!this._externalPaddingIsActive()) {
                this._panelActor.add_style_class_name(
                    DEFAULT_BUTTON_PADDING_CLASS
                );
            }
            return;
        }

        for (const box of this._panelBoxes)
            this._applyToSubtree(box, padding);
    }

    destroy() {
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];

        this._panelActor.remove_style_class_name(
            DEFAULT_BUTTON_PADDING_CLASS
        );
        if (this._hoverInsetClass) {
            this._panelActor.remove_style_class_name(
                this._hoverInsetClass
            );
            this._hoverInsetClass = null;
        }
        this._restoreAll();
        this._panelBoxes = null;
        this._panelActor = null;
        this._settings = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _externalPaddingIsActive() {
        const styleClasses =
            Main.layoutManager.uiGroup.get_style_class_name() ?? '';
        return styleClasses.split(/\s+/).some(style =>
            style.startsWith(JUST_PERFECTION_BUTTON_PADDING_PREFIX)
        );
    }

    _syncHoverInset() {
        if (this._hoverInsetClass) {
            this._panelActor.remove_style_class_name(
                this._hoverInsetClass
            );
        }

        const panelHeight = this._settings.get_int('panel-height');
        const heightRange = REGULAR_PANEL_HEIGHT - MINIMUM_PANEL_HEIGHT;
        const clampedHeight = Math.clamp(
            panelHeight,
            MINIMUM_PANEL_HEIGHT,
            REGULAR_PANEL_HEIGHT
        );
        const progress =
            (clampedHeight - MINIMUM_PANEL_HEIGHT) / heightRange;
        const insetRange = REGULAR_HOVER_INSET - MINIMUM_HOVER_INSET;
        const inset = Math.round(
            MINIMUM_HOVER_INSET + progress * insetRange
        );
        this._hoverInsetClass = `${HOVER_INSET_CLASS_PREFIX}${inset}`;
        this._panelActor.add_style_class_name(this._hoverInsetClass);
    }

    _applyToSubtree(actor, padding) {
        if (actor instanceof St.Widget &&
            actor.has_style_class_name('panel-button')) {
            this._applyToActor(actor, padding);
        }

        for (const child of actor.get_children())
            this._applyToSubtree(child, padding);
    }

    _applyToActor(actor, padding) {
        let originalStyle = this._styledActors.get(actor);
        if (originalStyle === undefined) {
            originalStyle = actor.get_style() ?? '';
            this._styledActors.set(actor, originalStyle);
        }

        const separator = originalStyle &&
            !originalStyle.trimEnd().endsWith(';')
            ? '; '
            : ' ';
        actor.set_style(
            `${originalStyle}${separator}` +
            `-natural-hpadding: ${padding}px; ` +
            `-minimum-hpadding: ${padding}px;`
        );
        actor.queue_relayout();
    }

    _restoreSubtree(actor) {
        this._restoreActor(actor);
        for (const child of actor.get_children())
            this._restoreSubtree(child);
    }

    _restoreActor(actor) {
        const originalStyle = this._styledActors.get(actor);
        if (originalStyle === undefined)
            return;

        actor.set_style(originalStyle);
        actor.queue_relayout();
        this._styledActors.delete(actor);
    }

    _restoreAll() {
        for (const actor of [...this._styledActors.keys()])
            this._restoreActor(actor);
    }
}
