// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    CLICK_ACTION,
    normalizeLegacyMiddleClickAction,
} from '../shared/interactionActions.js';
import {
    addComboRow,
    createPreferencesDialogButton,
    PreferencesOptionsDialog,
} from './preferencesWidgets.js';

function clickActionLabels() {
    return {
        [CLICK_ACTION.CYCLE_MINIMIZE]: _('Cycle Windows + Minimize'),
        [CLICK_ACTION.CYCLE]: _('Cycle Through Windows'),
        [CLICK_ACTION.TOGGLE_SHOW_PREVIEW]: _('Toggle Single / Preview Multiple'),
        [CLICK_ACTION.TOGGLE_CYCLE]: _('Toggle Single / Cycle Multiple'),
        [CLICK_ACTION.TOGGLE_SPREAD]: _('Toggle Single / Spread Multiple'),
        [CLICK_ACTION.TOGGLE_WINDOWS]: _('Toggle Windows'),
        [CLICK_ACTION.RAISE_WINDOWS]: _('Raise Windows'),
        [CLICK_ACTION.LAUNCH]: _('Launch New Instance'),
        [CLICK_ACTION.MINIMIZE]: _('Minimize Window'),
        [CLICK_ACTION.QUIT]: _('Quit'),
    };
}

function clickActionChoices(actions) {
    const labels = clickActionLabels();
    return actions.map(value => ({value, label: labels[value]}));
}

export function getApplicationClickActionChoices() {
    return clickActionChoices([
        CLICK_ACTION.CYCLE_MINIMIZE,
        CLICK_ACTION.CYCLE,
        CLICK_ACTION.TOGGLE_SHOW_PREVIEW,
        CLICK_ACTION.TOGGLE_CYCLE,
        CLICK_ACTION.TOGGLE_SPREAD,
        CLICK_ACTION.TOGGLE_WINDOWS,
        CLICK_ACTION.RAISE_WINDOWS,
        CLICK_ACTION.LAUNCH,
    ]);
}

function getClickActionOptionChoices() {
    return clickActionChoices([
        CLICK_ACTION.RAISE_WINDOWS,
        CLICK_ACTION.MINIMIZE,
        CLICK_ACTION.LAUNCH,
        CLICK_ACTION.CYCLE,
        CLICK_ACTION.CYCLE_MINIMIZE,
        CLICK_ACTION.TOGGLE_SHOW_PREVIEW,
        CLICK_ACTION.TOGGLE_CYCLE,
        CLICK_ACTION.TOGGLE_SPREAD,
        CLICK_ACTION.QUIT,
    ]);
}

function clickActionRows() {
    return [
        {
            key: 'shift-click-action',
            title: _('Shift+Click Action'),
            subtitle: _('Choose what happens when Shift+Clicking an application'),
        },
        {
            key: 'ctrl-click-action',
            title: _('Ctrl+Click Action'),
            subtitle: _('Choose what happens when Ctrl+Clicking an application'),
        },
        {
            key: 'middle-click-action',
            title: _('Middle-Click Action'),
            subtitle: _('Choose what happens when middle-clicking an application'),
        },
        {
            key: 'shift-middle-click-action',
            title: _('Shift+Middle-Click Action'),
            subtitle: _('Choose what happens when Shift+Middle-Clicking an application'),
        },
    ];
}

export function createApplicationClickActionOptionsButton(settings) {
    normalizeLegacyMiddleClickAction(settings);
    return createPreferencesDialogButton(
        settings,
        _('Click Action Options'),
        ApplicationClickActionOptionsDialog
    );
}

export const ApplicationClickActionOptionsDialog = GObject.registerClass(
class ApplicationClickActionOptionsDialog extends PreferencesOptionsDialog {
    _init({settings, parent}) {
        super._init({
            settings,
            parent,
            title: _('Click Action Options'),
            width: 640,
            height: 420,
        });

        const {addGroup, connectSettings} = this._dialogContent;
        const optionsGroup = addGroup({
            title: _('Application Click Actions'),
            description: _('Customize actions for modifier and middle clicks'),
        });

        for (const row of clickActionRows()) {
            addComboRow(
                optionsGroup,
                settings,
                {...row, choices: getClickActionOptionChoices()},
                connectSettings
            );
        }
    }

    _resetKeys() {
        return clickActionRows().map(row => row.key);
    }
}
);
