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

    const advancedAppBehaviorGroup = new Adw.PreferencesGroup({
        title: _('Application Behavior'),
        description: _(
            'Choose which applications appear and how they are grouped.'
        ),
    });
    advancedPage.add(advancedAppBehaviorGroup);

    const advancedBehaviorGroup = new Adw.PreferencesGroup({
        title: _('Taskbar Behavior'),
        description: _(
            'Less commonly used taskbar interaction options.'
        ),
    });
    advancedPage.add(advancedBehaviorGroup);

    const advancedFileManagerGroup = new Adw.PreferencesGroup({
        title: _('File Manager'),
        description: _(
            'File manager shortcuts and taskbar menu folders.'
        ),
    });
    advancedPage.add(advancedFileManagerGroup);

    const advancedStartMenuGroup = new Adw.PreferencesGroup({
        title: _('Start Menu'),
        description: _(
            'Less commonly used Start menu options.'
        ),
    });
    advancedPage.add(advancedStartMenuGroup);

    return {
        advancedAppBehaviorGroup,
        advancedBehaviorGroup,
        advancedFileManagerGroup,
        advancedStartMenuGroup,
    };
}
