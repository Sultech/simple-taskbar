// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

const FOLDER_PREFIX = 'simple-taskbar-folder:';

export function pinnedAppItemKey(appId) {
    return `app:${appId}`;
}

export function pinnedFolderItemKey(folderId) {
    return `folder:${folderId}`;
}

function parsePinnedItem(value) {
    if (!value.startsWith(FOLDER_PREFIX)) {
        return {
            type: 'app',
            key: pinnedAppItemKey(value),
            appId: value,
        };
    }

    const folder = JSON.parse(value.slice(FOLDER_PREFIX.length));
    return {
        type: 'folder',
        key: pinnedFolderItemKey(folder.id),
        id: folder.id,
        name: folder.name,
        appIds: folder.apps,
    };
}

function serializePinnedItem(item) {
    if (item.type === 'app')
        return item.appId;

    return FOLDER_PREFIX + JSON.stringify({
        id: item.id,
        name: item.name,
        apps: item.appIds,
    });
}

function appItem(appId) {
    return {
        type: 'app',
        key: pinnedAppItemKey(appId),
        appId,
    };
}

function folderItem(id, name, appIds) {
    return {
        type: 'folder',
        key: pinnedFolderItemKey(id),
        id,
        name,
        appIds,
    };
}

export class StartMenuPinnedModel {
    constructor(settings) {
        this._settings = settings;
    }

    getItems() {
        return this._settings
            .get_strv('start-menu-pinned-apps')
            .map(parsePinnedItem);
    }

    getFolder(folderId) {
        return this.getItems().find(item =>
            item.type === 'folder' && item.id === folderId
        ) ?? null;
    }

    getPinnedAppIds() {
        return this.getItems().flatMap(item =>
            item.type === 'app' ? [item.appId] : item.appIds
        );
    }

    isPinned(appId) {
        return this.getItems().some(item =>
            item.type === 'app'
                ? item.appId === appId
                : item.appIds.includes(appId)
        );
    }

    pinApp(appId) {
        if (this.isPinned(appId))
            return false;

        const items = this.getItems();
        items.push(appItem(appId));
        this._save(items);
        return true;
    }

    unpinApp(appId) {
        let changed = false;
        const items = [];
        for (const item of this.getItems()) {
            if (item.type === 'app') {
                if (item.appId === appId) {
                    changed = true;
                    continue;
                }
                items.push(item);
                continue;
            }

            if (!item.appIds.includes(appId)) {
                items.push(item);
                continue;
            }

            changed = true;
            const appIds = item.appIds.filter(id => id !== appId);
            if (appIds.length > 1)
                items.push(folderItem(item.id, item.name, appIds));
            else if (appIds.length === 1)
                items.push(appItem(appIds[0]));
        }

        if (changed)
            this._save(items);
        return changed;
    }

    createFolder(sourceAppId, targetAppId, name) {
        const items = this.getItems();
        const sourceIndex = items.findIndex(item =>
            item.type === 'app' && item.appId === sourceAppId
        );
        const targetIndex = items.findIndex(item =>
            item.type === 'app' && item.appId === targetAppId
        );
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
            return null;

        const folder = folderItem(
            GLib.uuid_string_random(),
            name,
            [targetAppId, sourceAppId]
        );
        const insertionIndex = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
        const removalIndexes = [sourceIndex, targetIndex].sort((a, b) => b - a);
        for (const index of removalIndexes)
            items.splice(index, 1);
        items.splice(insertionIndex, 0, folder);
        this._save(items);
        return folder.id;
    }

    moveAppToFolder(appId, folderId) {
        const items = this.getItems();
        const sourceIndex = items.findIndex(item =>
            item.type === 'app' && item.appId === appId
        );
        if (sourceIndex < 0)
            return false;

        items.splice(sourceIndex, 1);
        const folderIndex = items.findIndex(item =>
            item.type === 'folder' && item.id === folderId
        );
        if (folderIndex < 0)
            return false;

        const folder = items[folderIndex];
        items[folderIndex] = folderItem(
            folder.id,
            folder.name,
            [...folder.appIds, appId]
        );
        this._save(items);
        return true;
    }

    moveAppOutOfFolder(appId, folderId) {
        const items = this.getItems();
        const folderIndex = items.findIndex(item =>
            item.type === 'folder' && item.id === folderId
        );
        if (folderIndex < 0)
            return false;

        const folder = items[folderIndex];
        if (!folder.appIds.includes(appId))
            return false;

        const appIds = folder.appIds.filter(id => id !== appId);
        const replacements = [];
        if (appIds.length > 1)
            replacements.push(folderItem(folder.id, folder.name, appIds));
        else if (appIds.length === 1)
            replacements.push(appItem(appIds[0]));
        replacements.push(appItem(appId));
        items.splice(folderIndex, 1, ...replacements);
        this._save(items);
        return true;
    }

    renameFolder(folderId, name) {
        const items = this.getItems();
        const index = items.findIndex(item =>
            item.type === 'folder' && item.id === folderId
        );
        if (index < 0)
            return false;

        const folder = items[index];
        if (folder.name === name)
            return false;

        items[index] = folderItem(folder.id, name, folder.appIds);
        this._save(items);
        return true;
    }

    removeFolder(folderId) {
        const items = this.getItems();
        const index = items.findIndex(item =>
            item.type === 'folder' && item.id === folderId
        );
        if (index < 0)
            return false;

        const folder = items[index];
        items.splice(index, 1, ...folder.appIds.map(appItem));
        this._save(items);
        return true;
    }

    reorderVisibleItems(visibleKeys) {
        const items = this.getItems();
        const visibleSet = new Set(visibleKeys);
        const itemsByKey = new Map(items.map(item => [item.key, item]));
        const orderedItems = visibleKeys.map(key => itemsByKey.get(key));
        let visibleIndex = 0;
        const reordered = items.map(item =>
            visibleSet.has(item.key)
                ? orderedItems[visibleIndex++]
                : item
        );
        this._save(reordered);
    }

    reorderFolderApps(folderId, visibleAppIds) {
        const items = this.getItems();
        const folderIndex = items.findIndex(item =>
            item.type === 'folder' && item.id === folderId
        );
        if (folderIndex < 0)
            return false;

        const folder = items[folderIndex];
        const visibleSet = new Set(visibleAppIds);
        let visibleIndex = 0;
        const appIds = folder.appIds.map(appId =>
            visibleSet.has(appId)
                ? visibleAppIds[visibleIndex++]
                : appId
        );
        items[folderIndex] = folderItem(folder.id, folder.name, appIds);
        this._save(items);
        return true;
    }

    _save(items) {
        this._settings.set_strv(
            'start-menu-pinned-apps',
            items.map(serializePinnedItem)
        );
    }
}
