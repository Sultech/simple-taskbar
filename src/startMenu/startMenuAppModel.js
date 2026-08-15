// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Shell from 'gi://Shell';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

export const APP_CATEGORIES = [
    {
        id: 'internet',
        label: () => _('Internet'),
        desktopCategories: ['Network'],
    },
    {
        id: 'office',
        label: () => _('Office'),
        desktopCategories: ['Office'],
    },
    {
        id: 'development',
        label: () => _('Development'),
        desktopCategories: ['Development'],
    },
    {
        id: 'games',
        label: () => _('Games'),
        desktopCategories: ['Game'],
    },
    {
        id: 'graphics',
        label: () => _('Graphics'),
        desktopCategories: ['Graphics'],
    },
    {
        id: 'audio-video',
        label: () => _('Sound & Video'),
        desktopCategories: ['AudioVideo', 'Audio', 'Video'],
    },
    {
        id: 'education',
        label: () => _('Education'),
        desktopCategories: ['Education'],
    },
    {
        id: 'science',
        label: () => _('Science'),
        desktopCategories: ['Science'],
    },
    {
        id: 'system',
        label: () => _('System'),
        desktopCategories: ['System', 'Settings'],
    },
    {
        id: 'utilities',
        label: () => _('Utilities'),
        desktopCategories: ['Utility'],
    },
];

export function getAllApps(appSystem) {
    const apps = [];
    const seen = new Set();
    for (const appInfo of appSystem.get_installed()) {
        const id = appInfo.get_id();
        if (!id || seen.has(id) || !appInfo.should_show())
            continue;
        const app = appSystem.lookup_app(id);
        if (!app)
            continue;
        seen.add(id);
        apps.push(app);
    }
    return apps.sort((a, b) => a.get_name().localeCompare(b.get_name()));
}

export function getRecommendedApps(settings, favorites, pinnedApps) {
    if (!settings.get_boolean('start-menu-recommended-apps'))
        return [];

    const pinnedIds = new Set(pinnedApps.map(app => app.get_id()));
    return Shell.AppUsage.get_default().get_most_used()
        .filter(app => {
            const appId = app.get_id();
            return appShouldShow(app) &&
                !pinnedIds.has(appId) &&
                !favorites.isFavorite(appId);
        })
        .slice(0, 6);
}

export function groupAppsByCategory(apps) {
    const groupedApps = new Map([
        ...APP_CATEGORIES.map(category => [category.id, []]),
        ['other', []],
    ]);
    for (const app of apps)
        groupedApps.get(categoryForApp(app)).push(app);
    return groupedApps;
}

function categoryForApp(app) {
    const categories = new Set(
        (app.get_app_info().get_categories() ?? '')
            .split(';')
            .filter(Boolean)
    );
    for (const category of APP_CATEGORIES) {
        if (category.desktopCategories.some(name => categories.has(name)))
            return category.id;
    }
    return 'other';
}

export function appShouldShow(app) {
    const appInfo = app.get_app_info();
    return appInfo ? appInfo.should_show() : false;
}
