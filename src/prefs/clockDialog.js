// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addToggleChoiceRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';
import {clockStyleKey} from '../shared/taskbarPanelModes.js';

export function createClockOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Clock Options'),
        ClockOptionsDialog
    );
}

export const ClockOptionsDialog = GObject.registerClass(
class ClockOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Clock'),
            transient_for: parent,
            modal: true,
            default_width: 560,
            default_height: 620,
        });

        this._settings = settings;
        this._styleKey = clockStyleKey(settings);
        const desktopSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        const {content, connectSettings} =
            createPreferencesDialogContent(this);

        const gnomeGroup = new Adw.PreferencesGroup({
            title: _('GNOME Clock'),
            description: _('These GNOME settings also change the clock on the lock screen'),
        });
        content.append(gnomeGroup);
        gnomeGroup.add(createSwitchRow(desktopSettings, {
            key: 'clock-show-date',
            title: _('Show Date'),
        }));
        gnomeGroup.add(createSwitchRow(desktopSettings, {
            key: 'clock-show-weekday',
            title: _('Show Weekday'),
        }));
        gnomeGroup.add(createSwitchRow(desktopSettings, {
            key: 'clock-show-seconds',
            title: _('Show Seconds'),
        }));
        addToggleChoiceRow(
            gnomeGroup,
            desktopSettings,
            {
                key: 'clock-format',
                title: _('Time Format'),
                choices: [
                    {value: '24h', label: _('24-hour')},
                    {value: '12h', label: _('12-hour')},
                ],
            },
            connectSettings
        );

        const styleGroup = new Adw.PreferencesGroup({
            title: _('Clock Style'),
            description: _('Choose how the taskbar shows the time and date'),
        });
        content.append(styleGroup);
        addToggleChoiceRow(
            styleGroup,
            settings,
            {
                key: this._styleKey,
                title: _('Style'),
                subtitle: _('Windows uses a lighter font and stacks the time above the date or weekday when the taskbar has room'),
                choices: [
                    {value: 'gnome', label: _('GNOME')},
                    {value: 'windows', label: _('Windows')},
                ],
            },
            connectSettings
        );
        const dateOrderRow = addToggleChoiceRow(
            styleGroup,
            settings,
            {
                key: 'clock-date-order',
                title: _('Date Order'),
                subtitle: _('Order of the day, month and year in the Windows-style clock'),
                choices: [
                    {value: 'day-month-year', label: _('DD/MM/YYYY')},
                    {value: 'month-day-year', label: _('MM/DD/YYYY')},
                    {value: 'year-month-day', label: _('YYYY/MM/DD')},
                ],
            },
            connectSettings
        );
        const syncDateOrder = () => {
            dateOrderRow.sensitive =
                settings.get_string(this._styleKey) === 'windows' &&
                desktopSettings.get_boolean('clock-show-date');
        };
        connectSettings(settings, `changed::${this._styleKey}`, syncDateOrder);
        connectSettings(desktopSettings, 'changed::clock-show-date', syncDateOrder);
        syncDateOrder();
    }

    _reset() {
        for (const key of [this._styleKey, 'clock-date-order'])
            this._settings.reset(key);
    }
}
);
