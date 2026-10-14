// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

const BUILTIN_START_ICONS = new Map([
    ['builtin:gnome', 'gnome-start-symbolic.svg'],
    ['builtin:eleven', 'eleven-start-symbolic.svg'],
    ['builtin:ten', 'ten-start-symbolic.svg'],
]);

const DISTRO_LOCATION_PREFIX = 'distro:';
const DISTRO_ICON_FILENAME = /^distro-[a-z0-9-]+\.(?:png|svg)$/;

export function isDistroIconFilename(filename) {
    return DISTRO_ICON_FILENAME.test(filename);
}

export function isBundledStartIcon(location) {
    return BUILTIN_START_ICONS.has(location) ||
        location.startsWith(DISTRO_LOCATION_PREFIX);
}

export function bundledStartIconFile(extensionDir, location) {
    const iconsDir = extensionDir.get_child('icons');
    const builtinFilename = BUILTIN_START_ICONS.get(location);
    if (builtinFilename)
        return iconsDir.get_child('start').get_child(builtinFilename);

    const distroFilename = location.slice(DISTRO_LOCATION_PREFIX.length);
    return isDistroIconFilename(distroFilename)
        ? iconsDir.get_child('distros').get_child(distroFilename)
        : null;
}
