// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    createPreferencesDialogButton,
    PreferencesOptionsDialog,
    createSwitchRow,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

const WINDOW_PREVIEW_SETTINGS = [
    'show-window-previews-timeout',
    'leave-timeout',
    'peek-mode',
    'enter-peek-mode-timeout',
    'peek-mode-opacity',
    'preview-middle-click-close',
];

export function createWindowPreviewOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Window Preview Options'),
        WindowPreviewOptionsDialog
    );
}

export const WindowPreviewOptionsDialog = GObject.registerClass(
class WindowPreviewOptionsDialog extends PreferencesOptionsDialog {
    _init({settings, parent}) {
        super._init({
            settings,
            parent,
            title: _('Window Preview Options'),
            width: 640,
            height: 500,
        });

        const {addGroup, connectSettings} = this._dialogContent;

        const timingGroup = addGroup({
            title: _('Preview Timing'),
            description: _('Control when previews open and close'),
        });
        addSliderRow(
            timingGroup,
            settings,
            {
                key: 'show-window-previews-timeout',
                unit: 'ms',
                title: _('Time Before Showing'),
                subtitle: _('Delay in milliseconds before opening a preview'),
                lower: 0,
                upper: 2000,
                step: 25,
            },
            connectSettings
        );
        addSliderRow(
            timingGroup,
            settings,
            {
                key: 'leave-timeout',
                unit: 'ms',
                title: _('Time Before Hiding'),
                subtitle: _('Delay in milliseconds before closing a preview'),
                lower: 0,
                upper: 2000,
                step: 25,
            },
            connectSettings
        );

        const interactionGroup = addGroup({
            title: _('Preview Interaction'),
        });
        interactionGroup.add(createSwitchRow(settings, {
            key: 'preview-middle-click-close',
            title: _('Middle-Click Closes the Window'),
            subtitle: _('Close a window by middle-clicking its preview'),
        }));

        const peekGroup = addGroup({
            title: _('Window Peeking'),
            description: _('Show a window above other windows while hovering its preview'),
        });
        peekGroup.add(createSwitchRow(settings, {
            key: 'peek-mode',
            title: _('Enable Window Peeking'),
            subtitle: _('Bring the hovered window to the front temporarily'),
        }));
        addSliderRow(
            peekGroup,
            settings,
            {
                key: 'enter-peek-mode-timeout',
                unit: 'ms',
                title: _('Time Before Peeking'),
                subtitle: _('Delay in milliseconds before peeking'),
                lower: 50,
                upper: 2000,
                step: 25,
            },
            connectSettings
        );
        addSliderRow(
            peekGroup,
            settings,
            {
                key: 'peek-mode-opacity',
                format: value => `${Math.round(value / 255 * 100)}%`,
                title: _('Other Window Opacity'),
                subtitle: _('Opacity of other windows while peeking'),
                lower: 0,
                upper: 255,
                step: 10,
            },
            connectSettings
        );

    }

    _resetKeys() {
        return WINDOW_PREVIEW_SETTINGS;
    }
}
);
