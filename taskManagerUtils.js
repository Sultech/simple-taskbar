// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const DEFAULT_TASK_MANAGER_APP = 'net.nokyan.Resources.desktop';
export const TASK_MANAGER_FALLBACK_APPS = Object.freeze([
    DEFAULT_TASK_MANAGER_APP,
    'org.gnome.SystemMonitor.desktop',
    'io.missioncenter.MissionCenter.desktop',
]);

export function taskManagerCandidates(configuredApp) {
    return [...new Set([
        configuredApp,
        ...TASK_MANAGER_FALLBACK_APPS,
    ])];
}

export function resolveTaskManagerAppId(configuredApp, availableIds) {
    return taskManagerCandidates(configuredApp).find(
        appId => appId && availableIds.has(appId)
    ) ?? null;
}
