// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    CLASSIC_HIGHLIGHT_SETTINGS,
    HIGHLIGHT_DIALOG_SETTING_KEYS,
    HIGHLIGHT_SIZE_SETTINGS,
    TASKBAR_HIGHLIGHT_STYLE,
} from '../shared/classicHighlightSettings.js';
import {
    highlightSizeLowerBound,
    highlightSizeUpperBound,
    matchHighlightSizeParity,
} from '../shared/panelSizing.js';
import {
    addColorRow,
    addSpinRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';
import {activePanelIsVertical} from './panelAxis.js';

export function createClassicHighlightOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Effect Options'),
        ClassicHighlightOptionsDialog
    );
}

export const ClassicHighlightOptionsDialog = GObject.registerClass(
class ClassicHighlightOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Effect Options'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 580,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);
        const vertical = activePanelIsVertical(settings);
        const isClassic = settings.get_string('taskbar-highlight-style') ===
            TASKBAR_HIGHLIGHT_STYLE.CLASSIC;

        const sizeGroup = new Adw.PreferencesGroup({
            title: _('Effect Size'),
            description: _(
                'Set how far the effect reaches across the panel'
            ),
        });
        content.append(sizeGroup);

        const iconSize = settings.get_int('icon-size');
        const sizeLower = highlightSizeLowerBound(iconSize);
        const storedSize = settings.get_int(HIGHLIGHT_SIZE_SETTINGS.size);
        const alignedSize = Math.max(
            sizeLower,
            matchHighlightSizeParity(storedSize, iconSize)
        );
        if (alignedSize !== storedSize)
            settings.set_int(HIGHLIGHT_SIZE_SETTINGS.size, alignedSize);
        const sizeSwitch = createSwitchRow(settings, {
            key: HIGHLIGHT_SIZE_SETTINGS.enabled,
            title: _('Custom Effect Size'),
            subtitle: _(
                'Keep the effect a fixed size instead of following the panel thickness'
            ),
        });
        sizeGroup.add(sizeSwitch);
        const sizeRow = addSpinRow(
            sizeGroup,
            settings,
            {
                key: HIGHLIGHT_SIZE_SETTINGS.size,
                title: vertical ? _('Effect Width') : _('Effect Height'),
                subtitle: _('Size across the panel in pixels'),
                lower: sizeLower,
                upper: highlightSizeUpperBound(iconSize),
                step: 2,
            },
            connectSettings
        );

        const syncSizeSensitivity = () => {
            sizeRow.sensitive = sizeSwitch.active;
        };
        sizeSwitch.connect('notify::active', syncSizeSensitivity);
        syncSizeSensitivity();

        const hoverGroup = new Adw.PreferencesGroup({
            title: _('Hover Highlight'),
            description: _('Customize the Classic hover and pressed effect'),
        });
        content.append(hoverGroup);

        const hoverSwitch = createSwitchRow(settings, {
            key: CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled,
            title: _('Highlight Hovering Application Icons'),
        });
        hoverGroup.add(hoverSwitch);
        const hoverColorRow = addColorRow(
            hoverGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.hoverColor,
                title: _('Hover Highlight Color'),
            },
            connectSettings
        );
        const pressedColorRow = addColorRow(
            hoverGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.pressedColor,
                title: _('Pressed Highlight Color'),
            },
            connectSettings
        );
        const borderRadiusRow = addSpinRow(
            hoverGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.borderRadius,
                title: _('Hover Highlight Border Radius'),
                subtitle: _('Border radius in pixels'),
                lower: 0,
                upper: 10,
            },
            connectSettings
        );

        const focusGroup = new Adw.PreferencesGroup({
            title: _('Focused Application Highlight'),
            description: _('Customize the effect for the focused application'),
        });
        content.append(focusGroup);

        const focusSwitch = createSwitchRow(settings, {
            key: CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled,
            title: _('Highlight the Focused Application'),
        });
        focusGroup.add(focusSwitch);
        const focusDominantSwitch = createSwitchRow(settings, {
            key: CLASSIC_HIGHLIGHT_SETTINGS.focusDominant,
            title: _('Use Icon Dominant Color'),
        });
        focusGroup.add(focusDominantSwitch);
        const focusColorRow = addColorRow(
            focusGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.focusColor,
                title: _('Custom Focus Highlight Color'),
            },
            connectSettings
        );
        const focusOpacityRow = addSpinRow(
            focusGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.focusOpacity,
                title: _('Focus Highlight Opacity'),
                subtitle: _('Opacity percentage'),
                lower: 5,
                upper: 100,
                step: 5,
            },
            connectSettings
        );

        const syncHoverSensitivity = () => {
            const sensitive = settings.get_boolean(
                CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled
            );
            for (const row of [hoverColorRow, pressedColorRow, borderRadiusRow])
                row.sensitive = sensitive;
        };
        connectSettings(
            settings,
            `changed::${CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled}`,
            syncHoverSensitivity
        );
        syncHoverSensitivity();

        const syncFocusSensitivity = () => {
            const enabled = settings.get_boolean(
                CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled
            );
            const dominant = settings.get_boolean(
                CLASSIC_HIGHLIGHT_SETTINGS.focusDominant
            );
            focusDominantSwitch.sensitive = enabled;
            focusColorRow.sensitive = enabled && !dominant;
            focusOpacityRow.sensitive = enabled;
        };
        connectSettings(
            settings,
            `changed::${CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled}`,
            syncFocusSensitivity
        );
        connectSettings(
            settings,
            `changed::${CLASSIC_HIGHLIGHT_SETTINGS.focusDominant}`,
            syncFocusSensitivity
        );
        syncFocusSensitivity();

        hoverGroup.sensitive = isClassic;
        focusGroup.sensitive = isClassic;
    }

    _reset() {
        for (const key of HIGHLIGHT_DIALOG_SETTING_KEYS)
            this._settings.reset(key);
    }
}
);
