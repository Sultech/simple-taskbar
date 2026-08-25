// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {createSwitchRow} from './preferencesWidgets.js';

export function addAppBehaviorGroup({
    settings,
    advancedFileManagerGroup,
}) {
    const nautilusPlacesSwitch = createSwitchRow(settings, {
        key: 'nautilus-places-enabled',
        title: _('Nautilus Folder Shortcuts'),
        subtitle: _('Show common folders in the Files taskbar menu'),
    });
    advancedFileManagerGroup.add(nautilusPlacesSwitch);

    return {
        nautilusPlacesSwitch,
    };
}
