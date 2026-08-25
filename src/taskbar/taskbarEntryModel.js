// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export class TaskbarEntryModel {
    constructor({
        settings,
        tracker,
        favorites,
        getInterestingWindows,
        getLocationEntries,
    }) {
        this._settings = settings;
        this._tracker = tracker;
        this._favorites = favorites;
        this._getInterestingWindows = getInterestingWindows;
        this._getLocationEntries = getLocationEntries;
        this._sessionOrder = [];
    }

    get sessionOrder() {
        return this._sessionOrder;
    }

    setSessionOrder(order) {
        this._sessionOrder = order;
    }

    resetSessionOrder() {
        this._sessionOrder = [];
    }

    isPersistentPinned(app) {
        const appId = app ? app.get_id() : null;
        return Boolean(appId) && this._favorites.isFavorite(appId) &&
            !this._settings.get_boolean('hide-pinned-taskbar-apps');
    }

    usePinnedAppLaunchers() {
        return this._settings.get_boolean('use-pinned-apps-as-launchers');
    }

    pinnedApps() {
        if (this._settings.get_boolean('hide-pinned-taskbar-apps'))
            return [];

        const apps = [];
        const seen = new Set();
        for (const app of this._favorites.getFavorites()) {
            const id = app.get_id();
            if (!id || seen.has(id))
                continue;

            seen.add(id);
            apps.push(app);
        }
        return apps;
    }

    orderedEntries(pinnedOnly, combineMode, combinedAppIds) {
        const apps = this.orderedApps(pinnedOnly, combineMode);
        const usePinnedAppLaunchers = this.usePinnedAppLaunchers();
        const launcherCount = usePinnedAppLaunchers
            ? this.pinnedApps().length
            : 0;
        if (combineMode === 'always') {
            const entries = apps.map((app, index) => {
                const isLauncher = index < launcherCount;
                return {
                    key: isLauncher
                        ? `launcher:${app.get_id()}`
                        : usePinnedAppLaunchers
                            ? `app:${app.get_id()}`
                            : app.get_id(),
                    app,
                    window: null,
                    isLauncher,
                    isPinnedPrimary: !usePinnedAppLaunchers &&
                        this.isPersistentPinned(app),
                };
            });
            return [...entries, ...this._getLocationEntries()];
        }

        const entries = this.uncombinedEntries(
            apps,
            launcherCount,
            combineMode === 'when-full' ? combinedAppIds : new Set()
        );
        return [...entries, ...this._getLocationEntries()];
    }

    orderedApps(pinnedOnly, combineMode) {
        const seen = new Set();
        const runningApps = pinnedOnly ? [] : this._getRunningApps();
        const pinnedApps = this.pinnedApps();
        const pinnedAppIds = new Set();

        for (const app of pinnedApps) {
            const id = app.get_id();
            if (!id || seen.has(id))
                continue;
            seen.add(id);
            pinnedAppIds.add(id);
        }

        const unpinnedApps = runningApps.filter(app => {
            const id = app.get_id();
            if (!id || seen.has(id))
                return false;
            seen.add(id);
            return true;
        });
        const usePinnedAppLaunchers = this.usePinnedAppLaunchers();
        const hideUnpinnedApps = this._settings.get_boolean(
            'hide-unpinned-taskbar-apps'
        );
        const orderPinnedRunningApps = usePinnedAppLaunchers ||
            combineMode !== 'always';
        const appsToOrder = hideUnpinnedApps
            ? runningApps.filter(app =>
                pinnedAppIds.has(app.get_id())
            )
            : orderPinnedRunningApps
                ? runningApps
                : unpinnedApps;
        const visibleUnpinnedApps = hideUnpinnedApps
            ? []
            : unpinnedApps;
        const visibleRunningIds = new Set(
            appsToOrder.map(app => app.get_id())
        );
        this._sessionOrder = this._sessionOrder.filter(appId =>
            visibleRunningIds.has(appId)
        );

        const orderedIds = new Set(this._sessionOrder);
        for (const app of appsToOrder) {
            const appId = app.get_id();
            if (orderedIds.has(appId))
                continue;
            this._sessionOrder.push(appId);
            orderedIds.add(appId);
        }

        const positions = new Map(
            this._sessionOrder.map((id, index) => [id, index])
        );
        const orderedRunningApps = [...appsToOrder].sort((a, b) =>
            positions.get(a.get_id()) - positions.get(b.get_id())
        );
        if (!usePinnedAppLaunchers) {
            return [
                ...pinnedApps,
                ...visibleUnpinnedApps.sort((a, b) =>
                    positions.get(a.get_id()) - positions.get(b.get_id())
                ),
            ];
        }

        return [...pinnedApps, ...orderedRunningApps];
    }

    uncombinedEntries(apps, launcherCount = 0, combinedAppIds = new Set()) {
        if (!this.usePinnedAppLaunchers())
            return this._uncombinedWindowEntries(apps, combinedAppIds);

        const entries = [];
        for (let index = 0; index < apps.length; index++) {
            const app = apps[index];
            const isLauncher = index < launcherCount;
            if (isLauncher) {
                entries.push({
                    key: `launcher:${app.get_id()}`,
                    app,
                    window: null,
                    isLauncher: true,
                    isPinnedPrimary: false,
                });
                continue;
            }

            if (combinedAppIds.has(app.get_id())) {
                entries.push({
                    key: `app:${app.get_id()}`,
                    app,
                    window: null,
                    isLauncher: false,
                    isCombined: true,
                    isPinnedPrimary: false,
                });
                continue;
            }

            const windows = this._sortedWindows(app);
            if (windows.length === 0) {
                entries.push({
                    key: app.get_id(),
                    app,
                    window: null,
                    isLauncher: false,
                    isPinnedPrimary: false,
                });
                continue;
            }

            for (const window of windows) {
                entries.push({
                    key: `window:${window.get_stable_sequence()}`,
                    app,
                    window,
                    isLauncher: false,
                    isPinnedPrimary: false,
                });
            }
        }
        return entries;
    }

    destroy() {
        this._sessionOrder = null;
        this._getInterestingWindows = null;
        this._getLocationEntries = null;
        this._favorites = null;
        this._tracker = null;
        this._settings = null;
    }

    _uncombinedWindowEntries(apps, combinedAppIds) {
        const pinnedEntries = [];
        const runningGroups = new Map();
        for (const app of apps) {
            const windows = this._sortedWindows(app);
            const isPinned = this.isPersistentPinned(app);

            if (combinedAppIds.has(app.get_id())) {
                const entry = {
                    key: `app:${app.get_id()}`,
                    app,
                    window: null,
                    isLauncher: false,
                    isCombined: true,
                    isPinnedPrimary: isPinned,
                };
                if (isPinned)
                    pinnedEntries.push(entry);
                else
                    runningGroups.set(app.get_id(), [entry]);
                continue;
            }

            if (!isPinned) {
                runningGroups.set(app.get_id(), windows.map(window => ({
                    key: `window:${window.get_stable_sequence()}`,
                    app,
                    window,
                    isLauncher: false,
                    isPinnedPrimary: false,
                })));
                continue;
            }

            if (windows.length === 0) {
                pinnedEntries.push({
                    key: app.get_id(),
                    app,
                    window: null,
                    isLauncher: false,
                    isPinnedPrimary: true,
                });
                continue;
            }

            const [firstWindow, ...remainingWindows] = windows;
            pinnedEntries.push({
                key: `window:${firstWindow.get_stable_sequence()}`,
                app,
                window: firstWindow,
                isLauncher: false,
                isPinnedPrimary: true,
            });
            if (remainingWindows.length > 0) {
                runningGroups.set(app.get_id(), remainingWindows.map(
                    window => ({
                        key: `window:${window.get_stable_sequence()}`,
                        app,
                        window,
                        isLauncher: false,
                        isPinnedPrimary: false,
                    })
                ));
            }
        }

        const positions = new Map(
            this._sessionOrder.map((id, index) => [id, index])
        );
        const orderedRunningGroups = [...runningGroups.entries()]
            .sort((left, right) =>
                positions.get(left[0]) - positions.get(right[0])
            )
            .map(([, entries]) => entries)
            .flat();
        return [...pinnedEntries, ...orderedRunningGroups];
    }

    _getRunningApps() {
        const apps = [];
        const seen = new Set();
        for (const windowActor of global.get_window_actors()) {
            const window = windowActor.meta_window;
            if (!window || window.skip_taskbar)
                continue;

            const app = this._tracker.get_window_app(window);
            const appId = app ? app.get_id() : null;
            if (!appId || seen.has(appId) ||
                this._getInterestingWindows(app).length === 0) {
                continue;
            }
            seen.add(appId);
            apps.push(app);
        }
        return apps;
    }

    _sortedWindows(app) {
        return this._getInterestingWindows(app).sort((a, b) =>
            a.get_stable_sequence() - b.get_stable_sequence()
        );
    }
}
