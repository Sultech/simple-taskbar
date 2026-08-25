// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {panelPosition} from '../panel/panelPosition.js';

const JUST_PERFECTION_UUID = 'just-perfection-desktop@just-perfection';

export class NotificationBannerController {
    constructor(settings) {
        this._settings = settings;
        this._signalHolder = new TransientSignalHolder();
        this._repairId = 0;
        this._applied = false;
        this._messageTray = null;
        this._bannerBin = null;
        this._originalAlignmentX = null;
        this._originalAlignmentY = null;
        this._originalHideNotification = null;
    }

    enable() {
        this._messageTray = Main.messageTray;
        this._bannerBin = this._messageTray._bannerBin;

        this._originalAlignmentX = this._messageTray.bannerAlignment;
        this._originalAlignmentY = this._bannerBin.get_y_align();
        this._originalHideNotification =
            this._messageTray._hideNotification;

        this._settings.connectObject(
            'changed::notification-banner-bottom-end', () => this._sync(),
            'changed::clock-position', () => this._sync(),
            this._signalHolder
        );
        this._bannerBin.connectObject(
            'notify::x-align', () => this._queueRepair(),
            'notify::y-align', () => this._queueRepair(),
            this._signalHolder
        );
        Main.extensionManager.connectObject(
            'extension-state-changed',
            (_manager, extension) => {
                if (extension.uuid === JUST_PERFECTION_UUID)
                    this._queueRepair();
            },
            this._signalHolder
        );
        this._sync();
    }

    destroy() {
        if (this._repairId) {
            GLib.Source.remove(this._repairId);
            this._repairId = 0;
        }
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._restore();

        this._originalHideNotification = null;
        this._originalAlignmentY = null;
        this._originalAlignmentX = null;
        this._bannerBin = null;
        this._messageTray = null;
        this._settings = null;
    }

    _sync() {
        if (!this._settings.get_boolean(
            'notification-banner-bottom-end'
        )) {
            this._restore();
            return;
        }

        const position = panelPosition(this._settings);
        const clockAlignment = this._getClockAlignment();
        if (position === 'left' || position === 'right') {
            this._messageTray.bannerAlignment = position === 'left'
                ? Clutter.ActorAlign.START
                : Clutter.ActorAlign.END;
            this._bannerBin.set_y_align(clockAlignment);
            this._messageTray._hideNotification =
                this._createEdgeHideNotification(
                    'x',
                    position === 'left' ? -1 : 1
                );
        } else {
            this._messageTray.bannerAlignment = clockAlignment;
            this._bannerBin.set_y_align(
                position === 'top'
                    ? Clutter.ActorAlign.START
                    : Clutter.ActorAlign.END
            );
            this._messageTray._hideNotification = position === 'top'
                ? this._originalHideNotification
                : this._createEdgeHideNotification('y', 1);
        }
        this._applied = true;
    }

    _getClockAlignment() {
        switch (this._settings.get_string('clock-position')) {
        case 'left':
            return Clutter.ActorAlign.START;
        case 'center':
            return Clutter.ActorAlign.CENTER;
        default:
            return Clutter.ActorAlign.END;
        }
    }

    _restore() {
        if (!this._applied)
            return;

        this._messageTray.bannerAlignment = this._originalAlignmentX;
        this._bannerBin.set_y_align(this._originalAlignmentY);
        this._messageTray._hideNotification =
            this._originalHideNotification;
        this._applied = false;
    }

    _queueRepair() {
        if (!this._settings.get_boolean(
            'notification-banner-bottom-end'
        ) || this._repairId)
            return;

        this._repairId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._repairId = 0;
                this._sync();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _createEdgeHideNotification(property, direction) {
        return function (animate) {
            this._notificationFocusGrabber.ungrabFocus();
            this._banner.disconnectObject(this);
            this._resetNotificationLeftTimeout();
            this._bannerBin.remove_all_transitions();

            const duration = animate ? MessageTray.ANIMATION_TIME : 0;
            this._notificationState = MessageTray.State.HIDING;
            this._bannerBin.ease({
                opacity: 0,
                duration,
                mode: Clutter.AnimationMode.EASE,
            });
            const offset = direction * (property === 'x'
                ? this._bannerBin.width
                : this._bannerBin.height);
            const params = {
                duration,
                mode: Clutter.AnimationMode.EASE,
                onStopped: () => {
                    if (property === 'x')
                        this._bannerBin.x = 0;
                    this._notificationState = MessageTray.State.HIDDEN;
                    this._hideNotificationCompleted();
                    this._updateState();
                },
            };
            params[property] = offset;
            this._bannerBin.ease(params);
        };
    }
}
