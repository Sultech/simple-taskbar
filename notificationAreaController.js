// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
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
        this._rightBoxActorTranslationY = new Map();
    }

    sync(actors, clock, enabled) {
        if (!enabled) {
            this._restoreClockOffset();
            this._clearContent();

            const parent = this.actor.get_parent();
            if (parent)
                parent.remove_child(this.actor);
            return;
        }

        this._applyClockOffset(clock);
        const children = [];
        for (const actor of actors.filter(actor => actor)) {
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
            if (!childSet.has(actor))
                this._content.remove_child(actor);
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
        for (const [actor, translationY] of this._rightBoxActorTranslationY) {
            if (!externalActorSet.has(actor)) {
                actor.translation_y = translationY;
                this._rightBoxActorTranslationY.delete(actor);
            }
        }
        for (const actor of externalActors) {
            if (!this._rightBoxActorTranslationY.has(actor))
                this._rightBoxActorTranslationY.set(actor, actor.translation_y);
            actor.translation_y =
                this._rightBoxActorTranslationY.get(actor) + 1;
        }
    }

    restore(parent) {
        this._restoreClockOffset();
        this._restoreRightBoxActorOffsets();
        const wrapperParent = this.actor.get_parent();
        if (wrapperParent)
            wrapperParent.remove_child(this.actor);

        for (const actor of this._content.get_children()) {
            if (actor === this._clockSpacer) {
                this._content.remove_child(actor);
                actor.destroy();
                this._clockSpacer = null;
                continue;
            }
            this._content.remove_child(actor);
            parent.add_child(actor);
        }
    }

    destroy() {
        this._restoreClockOffset();
        this._restoreRightBoxActorOffsets();
        this._clearContent();
        this.actor.destroy();
        this._content = null;
        this.actor = null;
    }

    _clearContent() {
        for (const actor of this._content.get_children()) {
            this._content.remove_child(actor);
            if (actor === this._clockSpacer) {
                actor.destroy();
                this._clockSpacer = null;
            }
        }
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

    _restoreRightBoxActorOffsets() {
        for (const [actor, translationY] of this._rightBoxActorTranslationY)
            actor.translation_y = translationY;
        this._rightBoxActorTranslationY.clear();
    }
}
