// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    CLASSIC_HIGHLIGHT_SETTINGS,
    HIGHLIGHT_DIALOG_SETTING_KEYS,
    HIGHLIGHT_LENGTH_SETTINGS,
    HIGHLIGHT_SIZE_SETTINGS,
    TASKBAR_HIGHLIGHT_STYLE,
} from '../shared/classicHighlightSettings.js';
import {
    highlightLengthLowerBound,
    highlightLengthUpperBound,
    highlightSizeLowerBound,
    highlightSizeUpperBound,
    matchHighlightSizeParity,
    taskbarAppLabelsVisible,
} from '../shared/panelSizing.js';
import {
    addColorRow,
    addSpinRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
    createSwitchRow,
} from './preferencesWidgets.js';

function addHighlightExtentRows(group, settings, connectSettings, {
    keys,
    iconSize,
    switchTitle,
    switchSubtitle,
    rowTitle,
    rowSubtitle,
    lower,
    upper,
    available,
}) {
    const stored = settings.get_int(keys.size);
    const aligned = Math.max(
        lower,
        matchHighlightSizeParity(stored, iconSize)
    );
    if (aligned !== stored)
        settings.set_int(keys.size, aligned);

    const toggle = createSwitchRow(settings, {
        key: keys.enabled,
        title: switchTitle,
        subtitle: switchSubtitle,
    });
    group.add(toggle);
    const row = addSpinRow(
        group,
        settings,
        {
            key: keys.size,
            title: rowTitle,
            subtitle: rowSubtitle,
            lower,
            upper,
            step: 2,
        },
        connectSettings
    );
    const syncSensitivity = () => {
        toggle.sensitive = available;
        row.sensitive = available && toggle.active;
    };
    toggle.connect('notify::active', syncSensitivity);
    syncSensitivity();
    return {toggle, row};
}

export function createClassicHighlightOptionsButton(settings) {
    return createPreferencesDialogButton(
        settings,
        _('Highlight Options'),
        ClassicHighlightOptionsDialog
    );
}

export const ClassicHighlightOptionsDialog = GObject.registerClass(
class ClassicHighlightOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Highlight Options'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 580,
        });

        this._settings = settings;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);
        const isClassic = settings.get_string('taskbar-highlight-style') ===
            TASKBAR_HIGHLIGHT_STYLE.CLASSIC;

        const sizeGroup = new Adw.PreferencesGroup({
            title: _('Highlight Size'),
            description: _(
                'Set how far the highlight reaches across the panel'
            ),
        });
        content.append(sizeGroup);

        const iconSize = settings.get_int('icon-size');
        const borderRadiusRow = addSpinRow(
            sizeGroup,
            settings,
            {
                key: CLASSIC_HIGHLIGHT_SETTINGS.borderRadius,
                title: _('Highlight Border Radius'),
                subtitle: _('Border radius in pixels'),
                lower: 0,
                upper: 10,
            },
            connectSettings
        );
        addHighlightExtentRows(
            sizeGroup,
            settings,
            connectSettings,
            {
                keys: HIGHLIGHT_SIZE_SETTINGS,
                iconSize,
                switchTitle: _('Custom Highlight Thickness'),
                switchSubtitle: _(
                    'Keep the highlight a fixed size instead of following the panel thickness'
                ),
                rowTitle: _('Highlight Thickness'),
                rowSubtitle: _('Size across the panel in pixels'),
                lower: highlightSizeLowerBound(iconSize),
                upper: highlightSizeUpperBound(iconSize),
                available: true,
            }
        );
        addHighlightExtentRows(
            sizeGroup,
            settings,
            connectSettings,
            {
                keys: HIGHLIGHT_LENGTH_SETTINGS,
                iconSize,
                switchTitle: _('Custom Highlight Length'),
                switchSubtitle: _(
                    'Grow the highlight along the panel beyond the application icon'
                ),
                rowTitle: _('Highlight Length'),
                rowSubtitle: _('Size along the panel in pixels'),
                lower: highlightLengthLowerBound(settings, iconSize),
                upper: highlightLengthUpperBound(iconSize),
                available: !taskbarAppLabelsVisible(settings),
            }
        );

        const hoverGroup = new Adw.PreferencesGroup({
            title: _('Hover Highlight'),
            description: _('Customize the hover and pressed highlight'),
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

        const focusGroup = new Adw.PreferencesGroup({
            title: _('Focused Application Highlight'),
            description: _('Customize the highlight for the focused application'),
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
            hoverColorRow.sensitive = isClassic && sensitive;
            pressedColorRow.sensitive = isClassic && sensitive;
            borderRadiusRow.sensitive = sensitive ||
                settings.get_boolean(CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled);
        };
        connectSettings(
            settings,
            `changed::${CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled}`,
            syncHoverSensitivity
        );
        connectSettings(
            settings,
            `changed::${CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled}`,
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
            focusDominantSwitch.sensitive = isClassic && enabled;
            focusColorRow.sensitive = isClassic && enabled && !dominant;
            focusOpacityRow.sensitive = isClassic && enabled;
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
    }

    _reset() {
        for (const key of HIGHLIGHT_DIALOG_SETTING_KEYS)
            this._settings.reset(key);
    }
}
);
