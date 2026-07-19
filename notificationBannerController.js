// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {panelIsTop} from './panelPosition.js';

const JUST_PERFECTION_UUID = 'just-perfection-desktop@just-perfection';

export class NotificationBannerController {
    constructor(settings) {
        this._settings = settings;
        this._signals = [];
        this._repairId = 0;
        this._applied = false;
        this._messageTray = null;
        this._bannerBin = null;
        this._originalAlignmentX = null;
        this._originalAlignmentY = null;
        this._originalHideNotification = null;
        this._bottomHideNotification = null;
    }

    enable() {
        this._messageTray = Main.messageTray;
        this._bannerBin = this._messageTray?._bannerBin;
        if (!this._bannerBin ||
            typeof this._messageTray._hideNotification !== 'function') {
            throw new Error('GNOME Shell 50 notification banner is unavailable');
        }

        this._originalAlignmentX = this._messageTray.bannerAlignment;
        this._originalAlignmentY = this._bannerBin.get_y_align();
        this._originalHideNotification =
            this._messageTray._hideNotification;
        this._bottomHideNotification = this._createBottomHideNotification();

        this._connect(
            this._settings,
            'changed::notification-banner-bottom-end',
            () => this._sync()
        );
        this._connect(
            this._settings,
            'changed::clock-position',
            () => this._sync()
        );
        this._connect(
            this._settings,
            'changed::panel-position',
            () => this._sync()
        );
        this._connect(this._bannerBin, 'notify::x-align', () => {
            this._queueRepair();
        });
        this._connect(this._bannerBin, 'notify::y-align', () => {
            this._queueRepair();
        });
        this._connect(
            Main.extensionManager,
            'extension-state-changed',
            (_manager, extension) => {
                if (extension?.uuid === JUST_PERFECTION_UUID)
                    this._queueRepair();
            }
        );
        this._sync();
    }

    destroy() {
        if (this._repairId) {
            GLib.Source.remove(this._repairId);
            this._repairId = 0;
        }
        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];
        this._restore();

        this._bottomHideNotification = null;
        this._originalHideNotification = null;
        this._originalAlignmentY = null;
        this._originalAlignmentX = null;
        this._bannerBin = null;
        this._messageTray = null;
        this._settings = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _sync() {
        if (!this._settings?.get_boolean(
            'notification-banner-bottom-end'
        )) {
            this._restore();
            return;
        }

        const top = panelIsTop(this._settings);
        this._messageTray.bannerAlignment = this._getClockAlignment();
        this._bannerBin.set_y_align(
            top ? Clutter.ActorAlign.START : Clutter.ActorAlign.END
        );
        this._messageTray._hideNotification = top
            ? this._originalHideNotification
            : this._bottomHideNotification;
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
        if (!this._applied || !this._messageTray || !this._bannerBin)
            return;

        this._messageTray.bannerAlignment = this._originalAlignmentX;
        this._bannerBin.set_y_align(this._originalAlignmentY);
        this._messageTray._hideNotification =
            this._originalHideNotification;
        this._applied = false;
    }

    _queueRepair() {
        if (!this._settings?.get_boolean(
            'notification-banner-bottom-end'
        ) || this._repairId)
            return;

        this._repairId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._repairId = 0;
                if (this._settings)
                    this._sync();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _createBottomHideNotification() {
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
            this._bannerBin.ease({
                y: this._bannerBin.height,
                duration,
                mode: Clutter.AnimationMode.EASE,
                onStopped: () => {
                    this._notificationState = MessageTray.State.HIDDEN;
                    this._hideNotificationCompleted();
                    this._updateState();
                },
            });
        };
    }
}
