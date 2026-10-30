// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MIN_PANEL_HEIGHT} from '../shared/panelSizing.js';
import {appendStyle} from '../shared/styleUtils.js';
import {panelEdgeSides, panelIsVertical} from './panelPosition.js';
import {
    dynamicTaskbarEnabled,
    panelButtonCornerRadiusKey,
    panelButtonPaddingKey,
} from '../shared/taskbarPanelModes.js';

const AUTOMATIC_PADDING = -1;
const AUTOMATIC_FALLBACK_PADDING = 3;
const STATUS_ICON_CLASS = 'system-status-icon';
const SHOW_DESKTOP_CLASS = 'simple-taskbar-show-desktop';
const SELF_SIZED_BUTTON_CLASS = 'simple-taskbar-start';
const DEFAULT_BUTTON_PADDING_CLASS =
    'simple-taskbar-default-panel-button-padding';
const HOVER_INSET_CLASS_PREFIX =
    'simple-taskbar-panel-button-hover-inset-';
const CORNER_RADIUS_CLASS = 'simple-taskbar-panel-button-radius';
const THEME_CORNER_RADIUS = -1;
const JUST_PERFECTION_BUTTON_PADDING_PREFIX =
    'just-perfection-api-panel-button-padding-size';
const ICON_HORIZONTAL_PADDING_STYLE =
    'padding-left: 0; padding-right: 0;';
const REGULAR_PANEL_HEIGHT = 49;
const MINIMUM_HOVER_INSET = 3;
const REGULAR_HOVER_INSET = 6;

export function syncPanelSidePadding(boxes, startButtonController, vertical, padding, applyPadding) {
    const [startBox, , endBox] = boxes;
    const [startSide, endSide] = panelEdgeSides(startBox, vertical);
    const visibleChildren = box => box.get_children().filter(child => child.visible);
    const startItem = visibleChildren(startBox)[0];
    const endItem = visibleChildren(endBox).at(-1);
    const startButton = startButtonController.panelActor;
    const startButtonAtStart = startItem === startButton;
    const startButtonAtEnd = endItem === startButton;
    startButtonController.setEdgePadding(startButtonAtStart ? startSide : startButtonAtEnd ? endSide : null, padding);
    applyPadding(startBox, startSide, startItem, startButtonAtStart ? 0 : padding);
    applyPadding(endBox, endSide, endItem, startButtonAtEnd ? 0 : padding);
}

export class PanelButtonPaddingController {
    constructor(
        settings,
        panelActor,
        panelBoxes,
        getQuickSettingsIndicators,
        getPanelHeight,
        getPanelEdgeGap,
        startButtonController
    ) {
        this._settings = settings;
        this._panelActor = panelActor;
        this._panelBoxes = panelBoxes;
        this._getQuickSettingsIndicators = getQuickSettingsIndicators;
        this._getPanelHeight = getPanelHeight;
        this._getPanelEdgeGap = getPanelEdgeGap;
        this._startButtonController = startButtonController;
        this._styledActors = new Map();
        this._hoverInsetClass = null;
        this._hoverInset = MINIMUM_HOVER_INSET;
        this._cornerRadiusClass = null;
        this._appliedVertical = null;
        this._edgeBoxStyles = new Map();
        this._edgeShiftedActors = new Map();
    }

    enable() {
        this._settings.connectObject(
            'changed::panel-button-padding', () => this.sync(),
            'changed::taskbar-dynamic-panel-button-padding', () => this.sync(),
            'changed::panel-button-corner-radius', () => this._syncCornerRadius(),
            'changed::default-panel-button-corner-radius', () => this._syncCornerRadius(),
            'changed::default-gnome-panel', () => this._syncCornerRadius(),
            'changed::taskbar-side-padding', () => this.syncEdgePadding(),
            'changed::windows-xp-theme-enabled', () => {
                this._restoreAll();
                this.sync();
                this._syncCornerRadius();
            },
            this
        );
        Main.layoutManager.uiGroup.connectObject(
            'notify::style-class', () => this.sync(),
            this
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
                this
            );
        }
        this._syncHoverInset();
        this.sync();
    }

    sync() {
        const automatic =
            this._settings.get_int(panelButtonPaddingKey(this._settings)) ===
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
        this.syncEdgePadding();
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
        this._settings.disconnectObject(this);
        Main.layoutManager.uiGroup.disconnectObject(this);
        for (const box of this._panelBoxes)
            box.disconnectObject(this);

        this._panelActor.remove_style_class_name(
            DEFAULT_BUTTON_PADDING_CLASS
        );
        if (this._hoverInsetClass) {
            this._panelActor.remove_style_class_name(
                this._hoverInsetClass
            );
            this._hoverInsetClass = null;
        }
        if (this._cornerRadiusClass) {
            this._panelActor.remove_style_class_name(CORNER_RADIUS_CLASS);
            this._panelActor.remove_style_class_name(this._cornerRadiusClass);
            this._cornerRadiusClass = null;
        }
        this._restoreAll();
        for (const [box, style] of this._edgeBoxStyles)
            box.set_style(style);
        this._edgeBoxStyles.clear();
        for (const box of [...this._edgeShiftedActors.keys()])
            this._shiftEdgeActor(box, null);

        this._panelBoxes = null;
        this._panelActor = null;
        this._getQuickSettingsIndicators = null;
        this._getPanelHeight = null;
        this._getPanelEdgeGap = null;
        this._startButtonController = null;
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
        const panelHeight = this._getPanelHeight();
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
        this._hoverInset = inset;
        this._syncCornerRadius();
        const hoverInsetClass = `${HOVER_INSET_CLASS_PREFIX}${inset}`;
        if (hoverInsetClass === this._hoverInsetClass &&
            this._panelActor.has_style_class_name(hoverInsetClass))
            return;

        if (this._hoverInsetClass) {
            this._panelActor.remove_style_class_name(
                this._hoverInsetClass
            );
        }
        this._hoverInsetClass = hoverInsetClass;
        this._panelActor.add_style_class_name(this._hoverInsetClass);
    }

    _syncCornerRadius() {
        const radius = this._settings.get_int(panelButtonCornerRadiusKey(this._settings));
        const cornerRadiusClass = radius === THEME_CORNER_RADIUS ||
            this._settings.get_boolean('windows-xp-theme-enabled')
            ? null
            : `${CORNER_RADIUS_CLASS}-${radius + this._hoverInset}`;
        if (cornerRadiusClass === this._cornerRadiusClass)
            return;

        if (this._cornerRadiusClass)
            this._panelActor.remove_style_class_name(this._cornerRadiusClass);
        this._cornerRadiusClass = cornerRadiusClass;
        if (cornerRadiusClass) {
            this._panelActor.add_style_class_name(CORNER_RADIUS_CLASS);
            this._panelActor.add_style_class_name(cornerRadiusClass);
        } else {
            this._panelActor.remove_style_class_name(CORNER_RADIUS_CLASS);
        }
    }

    effectivePadding() {
        const configured = this._settings.get_int(panelButtonPaddingKey(this._settings));
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
            } else if (this._padsClockLabel(vertical) && this._isClockLabel(actor)) {
                this._applyToActor(actor, padding, vertical);
            } else if (actor.has_style_class_name(STATUS_ICON_CLASS) &&
                !this._isPaddingTarget(actor, vertical)) {
                this._normalizeIconSpacing(actor, vertical);
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

        return child === this._getQuickSettingsIndicators()
            ? null
            : child;
    }

    _isClockLabel(actor) {
        const parent = actor.get_parent();
        return actor.has_style_class_name('clock') &&
            parent instanceof St.Widget &&
            parent.has_style_class_name('clock-display-box');
    }

    _padsClockLabel(vertical) {
        return !vertical && !this._settings.get_boolean('windows-xp-theme-enabled');
    }

    _paddingStyle(actor, padding, vertical) {
        if (vertical)
            return `padding-top: ${padding}px; padding-bottom: ${padding}px;`;
        if (!this._padsClockLabel(vertical))
            return `-natural-hpadding: ${padding}px; -minimum-hpadding: ${padding}px;`;
        if (actor.has_style_class_name('clock-display'))
            return '-natural-hpadding: 0; -minimum-hpadding: 0;';
        if (this._isClockLabel(actor))
            return `padding-left: ${padding}px; padding-right: ${padding}px;`;
        return `-natural-hpadding: ${padding}px; -minimum-hpadding: ${padding}px;`;
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

    _normalizeIconSpacing(actor, vertical) {
        const currentStyle = actor.get_style() ?? '';
        const state = this._styledActors.get(actor);
        if (state && currentStyle === state.appliedStyle)
            return;

        const stripped = this._styleWithoutMargin(currentStyle);
        const appliedStyle = vertical
            ? stripped
            : appendStyle(stripped, ICON_HORIZONTAL_PADDING_STYLE);
        if (!state) {
            this._styledActors.set(actor, {
                originalStyle: currentStyle,
                appliedStyle,
                ...this._trackActor(
                    actor,
                    () => this._normalizeIconSpacing(
                        actor,
                        panelIsVertical(this._settings)
                    )
                ),
            });
        } else {
            state.originalStyle = currentStyle;
            state.appliedStyle = appliedStyle;
        }

        if (appliedStyle === currentStyle)
            return;

        actor.set_style(appliedStyle === '' ? null : appliedStyle);
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

    syncPanelHeight() {
        this._syncHoverInset();
        this.syncEdgePadding();
    }

    syncEdgePadding() {
        const sidePadding = dynamicTaskbarEnabled(this._settings) || this._getPanelEdgeGap() > 0
            ? this._settings.get_int('taskbar-side-padding') : 0;
        syncPanelSidePadding(this._panelBoxes, this._startButtonController, panelIsVertical(this._settings), sidePadding,
            (box, side, item, padding) => this._setEdgePadding(box, side, item, padding));
    }

    _setEdgePadding(box, side, edgeItem, sidePadding) {
        if (!this._edgeBoxStyles.has(box))
            this._edgeBoxStyles.set(box, box.get_style());
        const clockAtEdge = Boolean(edgeItem) &&
            !this._settings.get_boolean('windows-xp-theme-enabled') &&
            this._hasEdgeClass(edgeItem, 'clock-display');
        const showDesktopAtEdge = Boolean(edgeItem) &&
            this._hasEdgeClass(edgeItem, SHOW_DESKTOP_CLASS);
        this._shiftEdgeActor(box, showDesktopAtEdge ? edgeItem : null, side, sidePadding);
        const style = appendStyle(
            this._edgeBoxStyles.get(box) ?? '',
            `padding-${side}: ${(clockAtEdge ? this._hoverInset : 0) + sidePadding}px;`
        );
        if (box.get_style() !== style)
            box.set_style(style);
    }

    _shiftEdgeActor(box, actor, side, offset) {
        const state = this._edgeShiftedActors.get(box);
        if (state && state.actor !== actor) {
            state.actor.disconnectObject(this);
            state.actor.translation_x = 0;
            state.actor.translation_y = 0;
            this._edgeShiftedActors.delete(box);
        }
        if (!actor)
            return;

        if (state && state.actor === actor && state.side === side && state.offset === offset)
            return;

        if (!state || state.actor !== actor)
            actor.connectObject('destroy', () => this._edgeShiftedActors.delete(box), this);
        this._edgeShiftedActors.set(box, {actor, side, offset});
        const shift = side === 'right' || side === 'bottom' ? offset : -offset;
        actor.translation_x = side === 'left' || side === 'right' ? shift : 0;
        actor.translation_y = side === 'top' || side === 'bottom' ? shift : 0;
    }

    _hasEdgeClass(actor, styleClass) {
        return [actor, actor.get_first_child()].some(candidate =>
            candidate instanceof St.Widget &&
            candidate.has_style_class_name(styleClass));
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

        state.appliedStyle = appendStyle(
            state.originalStyle,
            this._paddingStyle(actor, padding, vertical)
        );
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
