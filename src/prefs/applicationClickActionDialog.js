// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    CLICK_ACTION,
    normalizeLegacyMiddleClickAction,
} from '../shared/applicationClickActions.js';
import {
    addComboRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
} from './preferencesWidgets.js';

export function getApplicationClickActionChoices() {
    return [
        {
            value: CLICK_ACTION.CYCLE_MINIMIZE,
            label: _('Cycle Windows + Minimize'),
        },
        {
            value: CLICK_ACTION.CYCLE,
            label: _('Cycle Through Windows'),
        },
        {
            value: CLICK_ACTION.TOGGLE_SHOW_PREVIEW,
            label: _('Toggle Single / Preview Multiple'),
        },
        {
            value: CLICK_ACTION.TOGGLE_CYCLE,
            label: _('Toggle Single / Cycle Multiple'),
        },
        {
            value: CLICK_ACTION.TOGGLE_SPREAD,
            label: _('Spread Multiple Windows'),
        },
        {
            value: CLICK_ACTION.TOGGLE_WINDOWS,
            label: _('Toggle Windows'),
        },
        {
            value: CLICK_ACTION.RAISE_WINDOWS,
            label: _('Raise Windows'),
        },
        {
            value: CLICK_ACTION.LAUNCH,
            label: _('Launch New Instance'),
        },
    ];
}

function getClickActionOptionChoices() {
    return [
        {
            value: CLICK_ACTION.RAISE_WINDOWS,
            label: _('Raise Windows'),
        },
        {
            value: CLICK_ACTION.MINIMIZE,
            label: _('Minimize Window'),
        },
        {
            value: CLICK_ACTION.LAUNCH,
            label: _('Launch New Instance'),
        },
        {
            value: CLICK_ACTION.CYCLE,
            label: _('Cycle Through Windows'),
        },
        {
            value: CLICK_ACTION.CYCLE_MINIMIZE,
            label: _('Cycle Windows + Minimize'),
        },
        {
            value: CLICK_ACTION.TOGGLE_SHOW_PREVIEW,
            label: _('Toggle Single / Preview Multiple'),
        },
        {
            value: CLICK_ACTION.TOGGLE_CYCLE,
            label: _('Toggle Single / Cycle Multiple'),
        },
        {
            value: CLICK_ACTION.TOGGLE_SPREAD,
            label: _('Toggle Single / Spread Multiple'),
        },
        {
            value: CLICK_ACTION.QUIT,
            label: _('Quit'),
        },
    ];
}

function getMiddleClickActionChoices() {
    return getClickActionOptionChoices();
}

const CLICK_ACTION_SETTINGS = [
    'shift-click-action',
    'middle-click-action',
    'shift-middle-click-action',
];

export function createApplicationClickActionOptionsButton(settings) {
    normalizeLegacyMiddleClickAction(settings);
    return createPreferencesDialogButton(
        settings,
        _('Click Action Options'),
        ApplicationClickActionOptionsDialog
    );
}

export const ApplicationClickActionOptionsDialog = GObject.registerClass(
class ApplicationClickActionOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Click Action Options'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 420,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);
        const optionsGroup = new Adw.PreferencesGroup({
            title: _('Application Click Actions'),
            description: _('Customize actions for modifier and middle clicks'),
        });
        content.append(optionsGroup);

        addComboRow(
            optionsGroup,
            settings,
            {
                key: 'shift-click-action',
                title: _('Shift+Click Action'),
                subtitle: _('Choose what happens when Shift+Clicking an application'),
                choices: getClickActionOptionChoices(),
            },
            connectSettings
        );
        addComboRow(
            optionsGroup,
            settings,
            {
                key: 'middle-click-action',
                title: _('Middle-Click Action'),
                subtitle: _('Choose what happens when middle-clicking an application'),
                choices: getMiddleClickActionChoices(),
            },
            connectSettings
        );
        addComboRow(
            optionsGroup,
            settings,
            {
                key: 'shift-middle-click-action',
                title: _('Shift+Middle-Click Action'),
                subtitle: _('Choose what happens when Shift+Middle-Clicking an application'),
                choices: getClickActionOptionChoices(),
            },
            connectSettings
        );

    }

    _reset() {
        for (const key of CLICK_ACTION_SETTINGS)
            this._settings.reset(key);
    }
}
);
