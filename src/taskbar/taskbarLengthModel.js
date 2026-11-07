// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function iconSizeForTaskbarLength({
    availableLength,
    maximumIconSize,
    minimumIconSize,
    scalingIconSize,
    scalableItemCount,
    maximumLength,
    measureIconSlot,
}) {
    const minimum = Math.min(minimumIconSize, maximumIconSize);
    const maximumItemLength = measureIconSlot(maximumIconSize);
    const scalingItemLength = scalingIconSize === null
        ? 0
        : measureIconSlot(scalingIconSize);
    let closestIconSize = maximumIconSize;
    let closestOverflow = Infinity;
    for (let iconSize = maximumIconSize;
        iconSize >= minimum;
        iconSize--) {
        const itemLength = measureIconSlot(iconSize);
        const available = scalingIconSize === null
            ? availableLength
            : availableLength + scalingItemLength - itemLength;
        const length = maximumLength + scalableItemCount *
            (itemLength - maximumItemLength);
        if (length <= available)
            return iconSize;
        if (length - available < closestOverflow) {
            closestOverflow = length - available;
            closestIconSize = iconSize;
        }
    }

    return closestIconSize;
}

export function combinedAppsForLength({
    appIds,
    availableLength,
    getWindowCount,
    measureCombinedApps,
}) {
    const combinedAppIds = new Set();
    if (measureCombinedApps(combinedAppIds) <= availableLength)
        return combinedAppIds;

    const candidates = [];
    const candidateIds = new Set();
    for (let index = 0; index < appIds.length; index++) {
        const appId = appIds[index];
        if (candidateIds.has(appId))
            continue;

        const windowCount = getWindowCount(index);
        if (windowCount < 2)
            continue;

        candidateIds.add(appId);
        candidates.push({appId, index, windowCount});
    }

    candidates.sort((a, b) =>
        b.windowCount - a.windowCount || a.index - b.index
    );

    for (const candidate of candidates) {
        combinedAppIds.add(candidate.appId);
        if (measureCombinedApps(combinedAppIds) <= availableLength)
            break;
    }

    return combinedAppIds;
}

export function taskbarEntriesLength(entries, {
    showLabels,
    showPinnedSeparator,
    showLocationSeparator,
    separatorExtent,
    measureEntry,
}) {
    const applicationEntries = entries.filter(entry =>
        !entry.app._simpleTaskbarLocation
    );
    const applicationIndexes = new Map();
    for (let index = 0; index < applicationEntries.length; index++) {
        if (!applicationIndexes.has(applicationEntries[index]))
            applicationIndexes.set(applicationEntries[index], index);
    }
    const width = entries.reduce((total, entry, index) => {
        const entryShowLabels = showLabels &&
            (Boolean(entry.window) || entry.isCombined);
        const applicationIndex = applicationIndexes.has(entry)
            ? applicationIndexes.get(entry)
            : -1;
        const nextApplicationEntry = applicationIndex >= 0
            ? applicationEntries[applicationIndex + 1]
            : null;
        const pinnedToRunningGap = !entry.app._simpleTaskbarLocation &&
            entry.isLauncher && Boolean(nextApplicationEntry) &&
            !nextApplicationEntry.isLauncher;
        const {mainExtent, iconSpacing, transitionGap} = measureEntry(
            entry,
            entryShowLabels,
            pinnedToRunningGap
        );
        const trailingSpacing = index + 1 === entries.length && iconSpacing < 0
            ? -iconSpacing
            : 0;
        return total + mainExtent + iconSpacing + transitionGap + trailingSpacing;
    }, 0);
    return width + pinnedSeparatorLength(
        applicationEntries, showPinnedSeparator, separatorExtent
    ) + locationSeparatorLength(entries, showLocationSeparator, separatorExtent);
}

export function pinnedSeparatorLength(entries, enabled, separatorExtent) {
    if (!enabled)
        return 0;

    let hasPinnedEntries = false;
    for (const entry of entries) {
        const pinned = entry.isLauncher || entry.isPinnedPrimary;
        if (pinned) {
            hasPinnedEntries = true;
            continue;
        }
        if (hasPinnedEntries)
            return separatorExtent;
    }
    return 0;
}

export function locationSeparatorLength(entries, enabled, separatorExtent) {
    if (!enabled)
        return 0;

    const hasApplications = entries.some(entry =>
        !entry.app._simpleTaskbarLocation
    );
    const hasLocations = entries.some(entry =>
        entry.app._simpleTaskbarLocation
    );
    return hasApplications && hasLocations
        ? separatorExtent
        : 0;
}

export function sameCombinedApps(left, right) {
    if (left.size !== right.size)
        return false;

    return [...left].every(appId => right.has(appId));
}
