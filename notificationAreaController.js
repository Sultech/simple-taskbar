// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

const XP_PANEL_HEIGHT = 30;
const TRAY_CLOCK_SPACING = 8;

export class NotificationAreaController {
    constructor() {
        this.actor = new St.Widget({
            style_class: 'simple-taskbar-xp-notification-area',
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
            x_expand: false,
            height: XP_PANEL_HEIGHT,
            y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
        });
        this._content = new St.BoxLayout({
            style_class: 'simple-taskbar-xp-notification-area-content',
            orientation: Clutter.Orientation.HORIZONTAL,
            reactive: false,
            x_expand: false,
            translation_y: 2,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._content);
        this._clockSpacer = null;
        this._clockLabel = null;
        this._clockLabelTranslationY = null;
        this._actorOrigins = new Map();
        this._rightBoxActorTranslationY = new Map();
        this._rightBoxHoverStates = new Map();
    }

    sync(actors, clock, enabled) {
        if (!enabled) {
            this._restoreContent();
            return;
        }

        const selectedActors = actors.filter(actor => actor);
        for (const actor of selectedActors)
            this._captureActorOrigin(actor);

        this._applyClockOffset(clock);
        const children = [];
        for (const actor of selectedActors) {
            if (actor === clock) {
                if (!this._clockSpacer) {
                    this._clockSpacer = new St.Widget({
                        width: TRAY_CLOCK_SPACING,
                        height: 1,
                        reactive: false,
                    });
                }
                children.push(this._clockSpacer);
            }
            children.push(actor);
        }
        const childSet = new Set(children);
        for (const actor of this._content.get_children()) {
            if (childSet.has(actor))
                continue;

            this._content.remove_child(actor);
            if (actor === this._clockSpacer) {
                actor.destroy();
                this._clockSpacer = null;
            } else {
                this._restoreActor(actor);
            }
        }

        for (let index = 0; index < children.length; index++) {
            const actor = children[index];
            const parent = actor.get_parent();
            if (parent && parent !== this._content)
                parent.remove_child(actor);

            if (this._content.get_child_at_index(index) === actor)
                continue;

            if (actor.get_parent() === this._content)
                this._content.set_child_at_index(actor, index);
            else
                this._content.insert_child_at_index(actor, index);
        }
    }

    syncRightBoxActors(rightBox, managedActors, enabled) {
        if (!enabled) {
            this._restoreRightBoxActorOffsets();
            return;
        }

        const externalActors = rightBox.get_children().filter(actor =>
            actor !== this.actor && !managedActors.has(actor)
        );
        const externalActorSet = new Set(externalActors);
        for (const [actor, entry] of this._rightBoxActorTranslationY) {
            if (!externalActorSet.has(actor)) {
                actor.disconnect(entry.destroyId);
                actor.translation_y = entry.translationY;
                this._rightBoxActorTranslationY.delete(actor);
            }
        }
        for (const actor of externalActors) {
            if (!this._rightBoxActorTranslationY.has(actor)) {
                const entry = {
                    translationY: actor.translation_y,
                    destroyId: 0,
                };
                entry.destroyId = actor.connect('destroy', () => {
                    this._rightBoxActorTranslationY.delete(actor);
                });
                this._rightBoxActorTranslationY.set(actor, entry);
            }
            actor.translation_y =
                this._rightBoxActorTranslationY.get(actor).translationY + 1;
        }
        this._syncRightBoxHoverStates(
            externalActors
                .map(actor => this._getRightBoxPanelButton(actor))
                .filter(button => button)
        );
    }

    destroy() {
        this._restoreRightBoxActorOffsets();
        this._restoreContent();
        this.actor.destroy();
        this._content = null;
        this.actor = null;
    }

    _captureActorOrigin(actor) {
        if (this._actorOrigins.has(actor))
            return;

        const parent = actor.get_parent();
        this._actorOrigins.set(actor, {
            parent,
            index: parent ? parent.get_children().indexOf(actor) : -1,
        });
    }

    _restoreActor(actor) {
        const origin = this._actorOrigins.get(actor);
        if (origin.parent)
            origin.parent.insert_child_at_index(
                actor,
                Math.min(origin.index, origin.parent.get_n_children())
            );
        this._actorOrigins.delete(actor);
    }

    _restoreContent() {
        this._restoreClockOffset();
        const wrapperParent = this.actor.get_parent();
        if (wrapperParent)
            wrapperParent.remove_child(this.actor);

        const actors = this._content.get_children()
            .filter(actor => actor !== this._clockSpacer);
        for (const actor of actors)
            this._content.remove_child(actor);

        if (this._clockSpacer) {
            this._content.remove_child(this._clockSpacer);
            this._clockSpacer.destroy();
            this._clockSpacer = null;
        }

        const actorsByParent = new Map();
        for (const actor of actors) {
            const origin = this._actorOrigins.get(actor);
            if (!origin.parent)
                continue;

            const parentActors = actorsByParent.get(origin.parent) ?? [];
            parentActors.push({actor, index: origin.index});
            actorsByParent.set(origin.parent, parentActors);
        }
        for (const [parent, parentActors] of actorsByParent) {
            parentActors.sort((a, b) => a.index - b.index);
            for (const {actor, index} of parentActors) {
                parent.insert_child_at_index(
                    actor,
                    Math.min(index, parent.get_n_children())
                );
            }
        }
        this._actorOrigins.clear();
    }

    _applyClockOffset(clock) {
        const clockLabel = clock.get_first_child().label_actor;
        if (clockLabel !== this._clockLabel) {
            this._restoreClockOffset();
            this._clockLabel = clockLabel;
            this._clockLabelTranslationY = clockLabel.translation_y;
        }
        this._clockLabel.translation_y = this._clockLabelTranslationY - 1;
    }

    _restoreClockOffset() {
        if (!this._clockLabel)
            return;

        this._clockLabel.translation_y = this._clockLabelTranslationY;
        this._clockLabel = null;
        this._clockLabelTranslationY = null;
    }

    _getRightBoxPanelButton(actor) {
        if (actor.has_style_class_name('panel-button'))
            return actor;

        const child = actor.get_first_child();
        if (child && child.has_style_class_name('panel-button'))
            return child;

        return null;
    }

    _syncRightBoxHoverStates(buttons) {
        const buttonSet = new Set(buttons);
        for (const button of this._rightBoxHoverStates.keys()) {
            if (!buttonSet.has(button))
                this._removeRightBoxHoverState(button);
        }
        for (const button of buttons) {
            if (!this._rightBoxHoverStates.has(button))
                this._addRightBoxHoverState(button);
            this._syncRightBoxHoverState(button);
        }
    }

    _addRightBoxHoverState(button) {
        const state = {
            compensated: false,
            restoreTimeoutId: 0,
            translationY: button.translation_y,
            childTranslations: new Map(),
        };
        state.hoverId = button.connect(
            'notify::hover',
            () => this._syncRightBoxHoverState(button)
        );
        state.pseudoClassId = button.connect(
            'notify::pseudo-class',
            () => this._syncRightBoxHoverState(button)
        );
        state.focusInId = button.connect(
            'key-focus-in',
            () => this._syncRightBoxHoverState(button)
        );
        state.focusOutId = button.connect(
            'key-focus-out',
            () => this._syncRightBoxHoverState(button)
        );
        state.destroyId = button.connect(
            'destroy',
            () => {
                this._cancelRightBoxHoverRestore(state);
                this._rightBoxHoverStates.delete(button);
            }
        );
        this._rightBoxHoverStates.set(button, state);
    }

    _removeRightBoxHoverState(button) {
        const state = this._rightBoxHoverStates.get(button);
        if (!state)
            return;

        this._restoreRightBoxHoverState(button, state);
        button.disconnect(state.hoverId);
        button.disconnect(state.pseudoClassId);
        button.disconnect(state.focusInId);
        button.disconnect(state.focusOutId);
        button.disconnect(state.destroyId);
        this._rightBoxHoverStates.delete(button);
    }

    _isRightBoxPanelButtonActive(button) {
        return button.has_style_pseudo_class('active') ||
            button.has_style_pseudo_class('checked');
    }

    _isRightBoxPanelButtonResting(button) {
        return !button.hover && !button.has_key_focus() &&
            !this._isRightBoxPanelButtonActive(button);
    }

    _isRightBoxPanelButtonAlwaysCompensated(button) {
        return button.has_style_class_name('screen-recording-indicator') ||
            button.has_style_class_name('screen-sharing-indicator');
    }

    _cancelRightBoxHoverRestore(state) {
        if (!state.restoreTimeoutId)
            return;

        GLib.source_remove(state.restoreTimeoutId);
        state.restoreTimeoutId = 0;
    }

    _scheduleRightBoxHoverRestore(button, state) {
        if (state.restoreTimeoutId)
            return;

        const duration = button.mapped && St.Settings.get().enable_animations
            ? button.get_theme_node().get_transition_duration()
            : 0;
        if (duration === 0) {
            this._restoreRightBoxHoverState(button, state);
            return;
        }

        state.restoreTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            duration,
            () => {
                state.restoreTimeoutId = 0;
                if (this._isRightBoxPanelButtonResting(button))
                    this._restoreRightBoxHoverState(button, state);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _syncRightBoxHoverState(button) {
        const state = this._rightBoxHoverStates.get(button);
        if (!state)
            return;

        const alwaysCompensated =
            this._isRightBoxPanelButtonAlwaysCompensated(button);
        if (!alwaysCompensated &&
            this._isRightBoxPanelButtonResting(button)) {
            if (state.compensated)
                this._scheduleRightBoxHoverRestore(button, state);
            return;
        }

        this._cancelRightBoxHoverRestore(state);
        button.translation_y = state.translationY + 1;
        const children = button.get_children();
        const childSet = new Set(children);
        for (const [child, translationY] of state.childTranslations) {
            if (!childSet.has(child)) {
                child.translation_y = translationY;
                state.childTranslations.delete(child);
            }
        }
        for (const child of children) {
            if (!state.childTranslations.has(child))
                state.childTranslations.set(child, child.translation_y);
            child.translation_y =
                state.childTranslations.get(child) - 1;
        }
        state.compensated = true;
    }

    _restoreRightBoxHoverState(button, state) {
        this._cancelRightBoxHoverRestore(state);
        button.translation_y = state.translationY;
        for (const [child, translationY] of state.childTranslations)
            child.translation_y = translationY;
        state.childTranslations.clear();
        state.compensated = false;
    }

    _restoreRightBoxHoverStates() {
        for (const button of [...this._rightBoxHoverStates.keys()])
            this._removeRightBoxHoverState(button);
    }

    _restoreRightBoxActorOffsets() {
        this._restoreRightBoxHoverStates();
        for (const [actor, entry] of this._rightBoxActorTranslationY) {
            actor.disconnect(entry.destroyId);
            actor.translation_y = entry.translationY;
        }
        this._rightBoxActorTranslationY.clear();
    }
}
