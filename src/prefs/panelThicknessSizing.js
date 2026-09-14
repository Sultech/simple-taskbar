// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    derivePanelHeightFromIconSize,
    fitIconSizeToPanelHeight,
    fitPanelHeightToIconSize,
} from '../shared/panelSizing.js';
import {createSwitchRow} from './preferencesWidgets.js';

export function createPanelThicknessSizing(settings, connectSettings, {
    heightKey,
    followKey,
    followSubtitle,
    isActive,
}) {
    const followsIcons = () => isActive() &&
        settings.get_boolean(followKey);
    const fitThicknessToIcons = () => {
        if (!isActive())
            return;

        if (followsIcons()) {
            derivePanelHeightFromIconSize(settings, heightKey);
            return;
        }

        fitPanelHeightToIconSize(settings, heightKey);
    };
    const fitIconsToThickness = () => {
        if (!isActive() || followsIcons())
            return;

        fitIconSizeToPanelHeight(settings, heightKey);
    };
    const followSwitch = createSwitchRow(settings, {
        key: followKey,
        title: _('Match Thickness to Icon Size'),
        subtitle: followSubtitle,
    });
    connectSettings(settings, 'changed::icon-size', fitThicknessToIcons);
    connectSettings(
        settings,
        `changed::${heightKey}`,
        fitIconsToThickness
    );
    connectSettings(
        settings,
        `changed::${followKey}`,
        fitThicknessToIcons
    );
    fitThicknessToIcons();

    return {followSwitch, followsIcons};
}
