// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {TaskbarLocation} from './taskbarLocation.js';
import {applyIconRenderScale} from '../shared/applicationHoverAnimation.js';
import {setWindowRestoreTarget} from './taskbarIconGeometryController.js';

const MinimizedWindowThumbnail = GObject.registerClass(
class MinimizedWindowThumbnail extends St.Widget {
    _init(window, app, iconSize) {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            width: iconSize,
            height: iconSize,
            clip_to_allocation: false,
        });
        this._preview = null;
        this._windowLayers = null;
        const appIconSize = Math.max(1, Math.round(iconSize * 0.4));
        const appIcon = app.create_icon_texture(appIconSize);
        appIcon.x_align = Clutter.ActorAlign.END;
        appIcon.y_align = Clutter.ActorAlign.END;
        appIcon.x_expand = true;
        appIcon.y_expand = true;
        this.add_child(appIcon);
        this._appIcon = appIcon;
        const source = window.get_compositor_private();
        if (!source)
            return;

        const [width, height] = source.get_size();
        if (width <= 0 || height <= 0)
            return;

        this._sourceWidth = width;
        this._sourceHeight = height;
        const preview = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        const windowLayers = new Clutter.Actor({
            layout_manager: new Clutter.FixedLayout(),
            width,
            height,
            child_transform: source.child_transform,
        });
        for (const child of source.get_children()) {
            if (!child.visible)
                continue;

            windowLayers.add_child(new Clutter.Clone({
                source: child,
                x: child.x,
                y: child.y,
                width: child.width,
                height: child.height,
            }));
        }
        preview.add_child(windowLayers);
        this.insert_child_below(preview, appIcon);
        this._preview = preview;
        this._windowLayers = windowLayers;
        this.setIconSize(iconSize, 1);
    }

    setIconSize(iconSize, renderScale) {
        this.set_size(iconSize, iconSize);
        const appIconSize = Math.max(1, Math.round(iconSize * 0.4));
        applyIconRenderScale(this._appIcon, appIconSize, renderScale);
        if (!this._preview)
            return;

        const scale = iconSize / Math.max(this._sourceWidth, this._sourceHeight);
        this._preview.set_size(
            Math.max(1, Math.round(this._sourceWidth * scale)),
            Math.max(1, Math.round(this._sourceHeight * scale))
        );
        this._windowLayers.set_scale(scale, scale);
    }

    destroy() {
        this._preview = null;
        this._windowLayers = null;
        this._appIcon = null;
        super.destroy();
    }
});

export const MinimizedWindowLocation = GObject.registerClass(
class MinimizedWindowLocation extends TaskbarLocation {
    _init(window, app) {
        super._init({
            id: `location:minimized:${window.get_stable_sequence()}`,
            name: window.get_title() || _('Untitled Window'),
            type: 'window',
        });
        this._window = window;
        this._app = app;
        this._simpleTaskbarMinimizedWindow = true;
        this.restoreSource = null;
        this._titleSignalId = window.connect('notify::title', () => {
            this.name = window.get_title() || _('Untitled Window');
            this.emit('changed');
        });
    }

    create_icon_texture(iconSize) {
        return new MinimizedWindowThumbnail(this._window, this._app, iconSize);
    }

    get window() {
        return this._window;
    }

    open() {
        const icon = this._window._simpleTaskbarPreviewActor;
        if (icon)
            setWindowRestoreTarget(this._window, icon, this._window._simpleTaskbarPreviewPosition, 'preview');
        Main.activateWindow(this._window);
        Main.overview.hide();
    }

    destroy() {
        this._window.disconnect(this._titleSignalId);
        this._titleSignalId = 0;
        this._window = null;
        this._app = null;
        this.restoreSource = null;
        super.destroy();
    }
});
