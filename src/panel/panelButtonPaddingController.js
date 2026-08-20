// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {MIN_PANEL_HEIGHT} from '../shared/panelSizing.js';
import {appendStyle} from '../shared/styleUtils.js';
import {panelIsVertical} from './panelPosition.js';

const AUTOMATIC_PADDING = -1;
const AUTOMATIC_FALLBACK_PADDING = 3;
const STATUS_ICON_CLASS = 'system-status-icon';
const SHOW_DESKTOP_CLASS = 'simple-taskbar-show-desktop';
const SELF_SIZED_BUTTON_CLASS = 'simple-taskbar-start';
const INDICATORS_BOX_CLASS = 'panel-status-indicators-box';
const DEFAULT_BUTTON_PADDING_CLASS =
    'simple-taskbar-default-panel-button-padding';
const HOVER_INSET_CLASS_PREFIX =
    'simple-taskbar-panel-button-hover-inset-';
const JUST_PERFECTION_BUTTON_PADDING_PREFIX =
    'just-perfection-api-panel-button-padding-size';
const REGULAR_PANEL_HEIGHT = 49;
const MINIMUM_HOVER_INSET = 3;
const REGULAR_HOVER_INSET = 6;

export class PanelButtonPaddingController {
    constructor(settings, panelActor, panelBoxes) {
        this._settings = settings;
        this._panelActor = panelActor;
        this._panelBoxes = panelBoxes;
        this._signalHolder = new TransientSignalHolder();
        this._styledActors = new Map();
        this._hoverInsetClass = null;
        this._appliedVertical = null;
    }

    enable() {
        this._settings.connectObject(
            'changed::panel-button-padding', () => this.sync(),
            'changed::panel-height', () => this._syncHoverInset(),
            'changed::panel-position', () => {
                this._syncHoverInset();
                this.sync();
            },
            this._signalHolder
        );
        Main.layoutManager.uiGroup.connectObject(
            'notify::style-class', () => this.sync(),
            this._signalHolder
        );
        for (const box of this._panelBoxes) {
            box.connectObject(
                'child-added', (_box, actor) => {
                    const padding = this.effectivePadding();
                    if (padding !== null) {
                        this._applyToSubtree(
                            actor,
                            padding,
                            panelIsVertical(this._settings)
                        );
                    }
                },
                'child-removed', (_box, actor) => this._restoreSubtree(actor),
                this._signalHolder
            );
        }
        this._syncHoverInset();
        this.sync();
    }

    sync() {
        const automatic =
            this._settings.get_int('panel-button-padding') ===
            AUTOMATIC_PADDING;
        const padding = this.effectivePadding();
        const vertical = panelIsVertical(this._settings);
        if (this._appliedVertical !== null &&
            this._appliedVertical !== vertical)
            this._restoreAll();
        this._appliedVertical = vertical;
        this._panelActor.remove_style_class_name(
            DEFAULT_BUTTON_PADDING_CLASS
        );
        if (padding === null) {
            this._restoreAll();
            return;
        }

        if (automatic && !vertical) {
            this._panelActor.add_style_class_name(
                DEFAULT_BUTTON_PADDING_CLASS
            );
        }
        for (const box of this._panelBoxes)
            this._applyToSubtree(box, padding, vertical);
    }

    destroy() {
        this._signalHolder.destroy();
        this._signalHolder = null;

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
        const heightRange = REGULAR_PANEL_HEIGHT - MIN_PANEL_HEIGHT;
        const clampedHeight = Math.clamp(
            panelHeight,
            MIN_PANEL_HEIGHT,
            REGULAR_PANEL_HEIGHT
        );
        const progress =
            (clampedHeight - MIN_PANEL_HEIGHT) / heightRange;
        const insetRange = REGULAR_HOVER_INSET - MINIMUM_HOVER_INSET;
        const inset = Math.round(
            MINIMUM_HOVER_INSET + progress * insetRange
        );
        this._hoverInsetClass = `${HOVER_INSET_CLASS_PREFIX}${inset}`;
        this._panelActor.add_style_class_name(this._hoverInsetClass);
    }

    effectivePadding() {
        const configured = this._settings.get_int('panel-button-padding');
        if (configured !== AUTOMATIC_PADDING)
            return configured;
        if (this._externalPaddingIsActive())
            return null;
        return AUTOMATIC_FALLBACK_PADDING;
    }

    _applyToSubtree(actor, padding, vertical) {
        if (actor instanceof St.Widget) {
            if (actor.has_style_class_name(SHOW_DESKTOP_CLASS)) {
                this._restoreActor(actor);
            } else if (actor.has_style_class_name('panel-button')) {
                const target = this._paddingTarget(actor, vertical);
                if (target === null)
                    this._restoreButton(actor);
                else
                    this._applyToActor(target, padding, vertical);
            } else if (actor.has_style_class_name(STATUS_ICON_CLASS) &&
                !this._isPaddingTarget(actor, vertical)) {
                this._clearIconMargin(actor);
            }
        }

        for (const child of actor.get_children())
            this._applyToSubtree(child, padding, vertical);
    }

    _paddingTarget(actor, vertical) {
        if (vertical && actor.has_style_class_name(SELF_SIZED_BUTTON_CLASS))
            return null;
        if (!vertical)
            return actor;

        const child = actor.get_first_child();
        if (!child)
            return actor;

        return child.has_style_class_name(INDICATORS_BOX_CLASS)
            ? null
            : child;
    }

    _isPaddingTarget(actor, vertical) {
        const parent = actor.get_parent();
        return parent instanceof St.Widget &&
            parent.has_style_class_name('panel-button') &&
            this._paddingTarget(parent, vertical) === actor;
    }

    _restoreButton(actor) {
        this._restoreActor(actor);
        const child = actor.get_first_child();
        if (child)
            this._restoreActor(child);
    }

    _styleWithoutMargin(style) {
        return style
            .split(';')
            .filter(declaration => {
                const property = declaration.split(':')[0].trim();
                return property !== '' && property !== 'margin' &&
                    property !== 'margin-left' &&
                    property !== 'margin-right';
            })
            .map(declaration => `${declaration.trim()};`)
            .join(' ');
    }

    _clearIconMargin(actor) {
        const currentStyle = actor.get_style() ?? '';
        const state = this._styledActors.get(actor);
        if (state && currentStyle === state.appliedStyle)
            return;

        const stripped = this._styleWithoutMargin(currentStyle);
        if (!state) {
            this._styledActors.set(actor, {
                originalStyle: currentStyle,
                appliedStyle: stripped,
                ...this._trackActor(
                    actor,
                    () => this._clearIconMargin(actor)
                ),
            });
        } else {
            state.originalStyle = currentStyle;
            state.appliedStyle = stripped;
        }

        if (stripped === currentStyle)
            return;

        actor.set_style(stripped === '' ? null : stripped);
        actor.queue_relayout();
    }

    _trackActor(actor, onStyleChanged) {
        return {
            styleNotifyId: actor.connect(
                'notify::style',
                onStyleChanged
            ),
            destroyId: actor.connect(
                'destroy',
                () => this._styledActors.delete(actor)
            ),
        };
    }

    _reapplyToActor(actor) {
        const padding = this.effectivePadding();
        if (padding !== null) {
            this._applyToActor(
                actor,
                padding,
                panelIsVertical(this._settings)
            );
        }
    }

    _applyToActor(actor, padding, vertical) {
        let state = this._styledActors.get(actor);
        const currentStyle = actor.get_style() ?? '';
        if (!state) {
            state = {
                originalStyle: currentStyle,
                appliedStyle: null,
                appliedPadding: null,
                ...this._trackActor(
                    actor,
                    () => this._reapplyToActor(actor)
                ),
            };
        } else if (currentStyle === state.appliedStyle &&
            padding === state.appliedPadding &&
            vertical === state.appliedVertical) {
            return;
        } else if (currentStyle !== state.appliedStyle) {
            state.originalStyle = currentStyle;
        }
        state.appliedPadding = padding;
        state.appliedVertical = vertical;

        const paddingStyle = vertical
            ? `padding-top: ${padding}px; padding-bottom: ${padding}px;`
            : `-natural-hpadding: ${padding}px; ` +
                `-minimum-hpadding: ${padding}px;`;
        state.appliedStyle = appendStyle(state.originalStyle, paddingStyle);
        this._styledActors.set(actor, state);
        actor.set_style(state.appliedStyle);
        actor.queue_relayout();
    }

    _restoreSubtree(actor) {
        this._restoreActor(actor);
        for (const child of actor.get_children())
            this._restoreSubtree(child);
    }

    _restoreActor(actor) {
        const state = this._styledActors.get(actor);
        if (!state)
            return;

        actor.disconnect(state.styleNotifyId);
        actor.disconnect(state.destroyId);
        if ((actor.get_style() ?? '') === state.appliedStyle) {
            actor.set_style(state.originalStyle === ''
                ? null
                : state.originalStyle);
            actor.queue_relayout();
        }
        this._styledActors.delete(actor);
    }

    _restoreAll() {
        for (const actor of [...this._styledActors.keys()])
            this._restoreActor(actor);
        this._appliedVertical = null;
    }
}
