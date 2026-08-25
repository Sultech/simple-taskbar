// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function addAdvancedPage(window) {
    const advancedPage = new Adw.PreferencesPage({
        title: _('Advanced'),
        icon_name: 'applications-engineering-symbolic',
    });
    window.add(advancedPage);

    const advancedFileManagerGroup = new Adw.PreferencesGroup({
        title: _('File Manager'),
        description: _(
            'File manager shortcuts and taskbar menu folders.'
        ),
    });
    advancedPage.add(advancedFileManagerGroup);

    return {
        advancedFileManagerGroup,
    };
}
