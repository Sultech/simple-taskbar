// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export const PINNED_FOLDER_PREFIX = 'simple-taskbar-folder:';

export function pinnedFolderIsValid(value) {
    let folder;
    try {
        folder = JSON.parse(value.slice(PINNED_FOLDER_PREFIX.length));
    } catch {
        return false;
    }

    return Boolean(folder) &&
        typeof folder.id === 'string' &&
        typeof folder.name === 'string' &&
        Array.isArray(folder.apps) &&
        folder.apps.every(appId => typeof appId === 'string');
}

export function pinnedItemIsValid(value) {
    return typeof value === 'string' &&
        (!value.startsWith(PINNED_FOLDER_PREFIX) ||
            pinnedFolderIsValid(value));
}
