// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

export const COMMON_FOLDERS = Object.freeze([
    {id: 'home', name: 'Home', iconName: 'user-home', directory: null},
    {id: 'desktop', name: 'Desktop', iconName: 'user-desktop', directory: GLib.UserDirectory.DIRECTORY_DESKTOP},
    {id: 'documents', name: 'Documents', iconName: 'folder-documents', directory: GLib.UserDirectory.DIRECTORY_DOCUMENTS},
    {id: 'downloads', name: 'Downloads', iconName: 'folder-download', directory: GLib.UserDirectory.DIRECTORY_DOWNLOAD},
    {id: 'music', name: 'Music', iconName: 'folder-music', directory: GLib.UserDirectory.DIRECTORY_MUSIC},
    {id: 'pictures', name: 'Pictures', iconName: 'folder-pictures', directory: GLib.UserDirectory.DIRECTORY_PICTURES},
    {id: 'videos', name: 'Videos', iconName: 'folder-videos', directory: GLib.UserDirectory.DIRECTORY_VIDEOS},
].map(folder => Object.freeze(folder)));

export function commonFolderKey(folder, prefix) {
    return `${prefix}-show-${folder.id}`;
}

export function commonFolderPath(folder) {
    return folder.directory === null
        ? GLib.get_home_dir()
        : GLib.get_user_special_dir(folder.directory);
}
