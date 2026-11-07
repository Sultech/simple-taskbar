// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PREVIEW_PEEK_DURATION = 250;

export class WindowPeekController {
    constructor(settings, hasPreview) {
        this._settings = settings;
        this._hasPreview = hasPreview;
        this._peekTimeoutId = 0;
        this._peekedWindow = null;
        this._peekedWindowStack = null;
        this._peekWindows = new Set();
        settings.connectObject('changed::peek-mode', () => {
            this.cancel();
            if (!settings.get_boolean('peek-mode'))
                this.restore();
        }, this);
    }

    destroy() {
        this.cancel();
        this._settings.disconnectObject(this);
        this.restore();
        this._peekWindows = null;
        this._settings = null;
        this._hasPreview = null;
    }

    cancel() {
        if (this._peekTimeoutId)
            GLib.Source.remove(this._peekTimeoutId);
        this._peekTimeoutId = 0;
    }

    schedule(window, preview) {
        this.cancel();
        if (!this._settings.get_boolean('peek-mode'))
            return;
        if (this._peekedWindow === window)
            return;

        this._peekTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            this._settings.get_int('enter-peek-mode-timeout'),
            () => {
                this._peekTimeoutId = 0;
                if (preview.hover)
                    this._peekWindow(window);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _peekWindow(window) {
        if (!this._hasPreview())
            return;

        if (this._peekedWindow === window)
            return;

        const currentWorkspace =
            global.workspace_manager.get_active_workspace();

        if (Main.sessionMode.hasWorkspaces &&
            window.get_workspace() !== currentWorkspace)
            return;

        this._restorePeekedWindowStack();
        this._peekedWindow = window;
        this._focusMetaWindow(
            this._settings.get_int('peek-mode-opacity'),
            window
        );
    }

    _focusMetaWindow(dimOpacity, window, ignoreFocus = false) {
        const isAppSpread = !Main.sessionMode.hasWorkspaces;
        const currentWorkspace =
            global.workspace_manager.get_active_workspace();
        const windows = ignoreFocus
            ? this._peekWindows
            : isAppSpread
                ? global.get_window_actors().map(actor => actor.meta_window)
                : currentWorkspace.list_windows();

        for (const metaWindow of windows) {
            const windowActor = metaWindow.get_compositor_private();
            const isFocused = !ignoreFocus && metaWindow === window;
            if (!windowActor)
                continue;

            if (!ignoreFocus)
                this._peekWindows.add(metaWindow);

            if (isFocused) {
                const parent = windowActor.get_parent();
                this._peekedWindowStack = {
                    parent,
                    index: parent.get_children().indexOf(windowActor),
                };
                parent.set_child_above_sibling(windowActor, null);
            }

            if (isFocused && metaWindow.minimized)
                windowActor.show();

            this._animateWindowOpacity(
                metaWindow,
                windowActor,
                isFocused ? 255 : dimOpacity,
                ignoreFocus
            );
        }
    }

    _animateWindowOpacity(metaWindow, windowActor, opacity, restore = false) {
        if (metaWindow.minimized && !restore)
            return;

        const visible = opacity > 0;
        const visual = windowActor.get_first_child() || windowActor;
        const initialOpacity = visual.opacity;
        let targetOpacity = opacity;

        if (!windowActor.visible && visible) {
            if (!restore) {
                visual.opacity = 0;
                targetOpacity = Math.min(initialOpacity, targetOpacity);
            }
            if (!restore ||
                metaWindow.located_on_workspace(
                    global.workspace_manager.get_active_workspace()
                ) && metaWindow.showing_on_its_workspace()) {
                windowActor.visible = visible;
            }
        }

        const options = {
            opacity: targetOpacity,
            duration: PREVIEW_PEEK_DURATION,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        };
        if (!visible) {
            options.onComplete = () => {
                windowActor.visible = visible;
                visual.opacity = initialOpacity;
            };
        }

        visual.ease(options);
    }

    _restorePeekedWindowStack() {
        if (!this._peekedWindow)
            return;

        const windowActor = this._peekedWindow.get_compositor_private();
        if (windowActor && this._peekedWindowStack) {
            windowActor.get_parent().set_child_at_index(
                windowActor,
                this._peekedWindowStack.index
            );
            if (this._peekedWindow.minimized)
                windowActor.hide();
        }
        this._peekedWindowStack = null;
    }

    restore() {
        if (!this._peekedWindow)
            return;

        this._restorePeekedWindowStack();
        this._focusMetaWindow(255, this._peekedWindow, true);
        this._peekWindows.clear();
        this._peekedWindow = null;
    }
}
