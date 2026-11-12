// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    NOTIFICATION_BADGE_POSITION,
    NOTIFICATION_BADGE_SETTINGS,
    NOTIFICATION_BADGE_SETTING_KEYS,
} from '../shared/notificationBadgeSettings.js';
import {
    addComboRow,
    createPreferencesDialogButton,
    PreferencesOptionsDialog,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

export function createNotificationBadgeOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Notification Badge Options'),
        NotificationBadgeOptionsDialog
    );
}

const NotificationBadgeOptionsDialog = GObject.registerClass(
class NotificationBadgeOptionsDialog extends PreferencesOptionsDialog {
    _init({settings, parent}) {
        super._init({
            settings,
            parent,
            title: _('Notification Badge Options'),
            width: 640,
            height: 420,
        });

        const {addGroup, connectSettings} = this._dialogContent;

        const sizeGroup = addGroup({
            title: _('Size'),
            description: _('Make notification badges larger or smaller than their automatic size'),
        });
        addSliderRow(
            sizeGroup,
            settings,
            {
                key: NOTIFICATION_BADGE_SETTINGS.size,
                unit: '%',
                title: _('Badge Size'),
                subtitle: _('Percentage of the automatic badge size'),
                lower: 50,
                upper: 200,
                step: 5,
            },
            connectSettings
        );

        const positionGroup = addGroup({
            title: _('Position'),
            description: _('Choose which corner of the application icon shows the badge'),
        });
        addComboRow(
            positionGroup,
            settings,
            {
                key: NOTIFICATION_BADGE_SETTINGS.position,
                title: _('Badge Position'),
                choices: [
                    {value: NOTIFICATION_BADGE_POSITION.TOP_RIGHT, label: _('Top Right')},
                    {value: NOTIFICATION_BADGE_POSITION.TOP_LEFT, label: _('Top Left')},
                    {value: NOTIFICATION_BADGE_POSITION.BOTTOM_RIGHT, label: _('Bottom Right')},
                    {value: NOTIFICATION_BADGE_POSITION.BOTTOM_LEFT, label: _('Bottom Left')},
                ],
            },
            connectSettings
        );
    }

    _resetKeys() {
        return NOTIFICATION_BADGE_SETTING_KEYS;
    }
}
);
