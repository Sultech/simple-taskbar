// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const SETTINGS_APP_ID = 'org.gnome.Settings.desktop';
export const LOGS_APP_ID = 'org.gnome.Logs.desktop';
export const DISKS_APP_ID = 'org.gnome.DiskUtility.desktop';

export const TERMINAL_APP_IDS = Object.freeze([
    'org.gnome.Console.desktop',
    'org.gnome.Terminal.desktop',
    'org.gnome.Ptyxis.desktop',
]);

export const DEFAULT_TASK_MANAGER_APP = 'net.nokyan.Resources.desktop';
export const TASK_MANAGER_FALLBACK_APPS = Object.freeze([
    DEFAULT_TASK_MANAGER_APP,
    'org.gnome.Resources.desktop',
    'org.gnome.SystemMonitor.desktop',
    'io.missioncenter.MissionCenter.desktop',
]);

export function findInstalledApp(appIds, lookupApp) {
    for (const appId of appIds) {
        const app = appId ? lookupApp(appId) : null;
        if (app)
            return app;
    }
    return null;
}

export function taskManagerCandidates(configuredApp) {
    return [...new Set([
        configuredApp,
        ...TASK_MANAGER_FALLBACK_APPS,
    ])];
}

export function resolveTaskManagerAppId(configuredApp, availableIds) {
    return findInstalledApp(
        taskManagerCandidates(configuredApp),
        appId => availableIds.has(appId) ? appId : null
    );
}
