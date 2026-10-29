// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addSettingsHub} from './settingsSubpage.js';

function panelHubSections({panelTitle, itemsTitle, autoHideSubtitle}) {
    return [
        {
            title: panelTitle,
            rows: [
                {
                    id: 'size',
                    title: _('Size and Position'),
                    subtitle: _('Thickness, length, and screen edge'),
                    iconName: 'preferences-desktop-display-symbolic',
                },
                {
                    id: 'appearance',
                    title: _('Appearance'),
                    subtitle: _('Theme, colours, transparency, and borders'),
                    iconName: 'preferences-color-symbolic',
                },
                {
                    id: 'items',
                    title: itemsTitle,
                    subtitle: _('Order, visibility, and spacing of items'),
                    iconName: 'view-list-symbolic',
                },
            ],
        },
        {
            title: _('Applications'),
            rows: [
                {
                    id: 'icons',
                    title: _('Application Icons'),
                    subtitle: _('Size, spacing, grouping, and overflow'),
                    iconName: 'preferences-desktop-apps-symbolic',
                },
                {
                    id: 'interaction',
                    title: _('Clicking, Scrolling and Hovering'),
                    subtitle: _('Click, scroll and hover actions for application icons, and window previews'),
                    iconName: 'input-mouse-symbolic',
                },
                {
                    id: 'animations',
                    title: _('Animations'),
                    subtitle: _('Click, hover and window minimize animations'),
                    iconName: 'starred-symbolic',
                },
                {
                    id: 'indicators',
                    title: _('Running Indicators'),
                    subtitle: _('Position, style, size, and colours'),
                    iconName: 'media-record-symbolic',
                },
                {
                    id: 'locations',
                    title: _('Locations'),
                    subtitle: _('Folders, drives, and Trash'),
                    iconName: 'folder-symbolic',
                },
            ],
        },
        {
            title: _('Behavior'),
            rows: [
                {
                    id: 'visibility',
                    title: _('Auto-hide and Dodge'),
                    subtitle: autoHideSubtitle,
                    iconName: 'view-reveal-symbolic',
                },
                {
                    id: 'behavior',
                    title: _('Scrolling, Menus, and Monitors'),
                    subtitle: _('Scroll actions, menus, notifications, and multiple monitors'),
                    iconName: 'preferences-desktop-multitasking-symbolic',
                },
            ],
        },
    ];
}

export function addTaskbarHub({window, page}) {
    return addSettingsHub(window, page, panelHubSections({
        panelTitle: _('Taskbar'),
        itemsTitle: _('Taskbar Items'),
        autoHideSubtitle: _('Choose when the taskbar hides and how it is revealed'),
    }));
}

export function addDockHub({window, page, settings, connectSettings}) {
    const subpages = addSettingsHub(window, page, panelHubSections({
        panelTitle: _('Dock'),
        itemsTitle: _('Dock Items'),
        autoHideSubtitle: _('Choose when the Dock hides and how it is revealed'),
    }));
    const syncAvailability = () => {
        const available = settings.get_boolean('dock-mode');
        for (const subpage of Object.values(subpages))
            subpage.row.sensitive = available;
        page.description = available
            ? ''
            : _('Select Dock Mode in General to use these settings.');
    };
    connectSettings(settings, 'changed::dock-mode', syncAvailability);
    syncAvailability();
    return subpages;
}
