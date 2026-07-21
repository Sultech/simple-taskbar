// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SEARCH_DELAY = 150;
const MAX_APPLICATION_RESULTS = 6;
const MAX_PROVIDER_RESULTS = 5;

export class StartMenuSearchController {
    constructor() {
        this._appSystem = Shell.AppSystem.get_default();
        this._fallbackAppProvider = new AppDisplay.AppSearchProvider();
        this._cancellable = null;
        this._searchTimeoutId = 0;
        this._generation = 0;
        this._terms = [];
        this._providerResults = new Map();
    }

    search(query, onUpdate) {
        const terms = query.split(/\s+/).filter(Boolean);
        const previousTerms = this._terms;
        const previousProviderResults = this._providerResults;

        this._stopActiveSearch();
        this._terms = terms;
        this._providerResults = new Map();

        if (terms.length === 0) {
            onUpdate([], true);
            return;
        }

        const providers = this._getProviders();
        const groups = providers.map(provider => ({
            provider,
            name: this._getProviderName(provider),
            results: [],
            complete: false,
        }));
        const generation = this._generation;
        const cancellable = new Gio.Cancellable();
        const previousSearch = previousTerms.join(' ');
        const currentSearch = terms.join(' ');
        const isSubsearch = previousSearch.length > 0 &&
            currentSearch.startsWith(previousSearch);

        this._cancellable = cancellable;
        this._searchTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            SEARCH_DELAY,
            () => {
                this._searchTimeoutId = 0;
                for (const group of groups) {
                    this._queryProvider(
                        group,
                        terms,
                        isSubsearch
                            ? previousProviderResults.get(group.provider)
                            : null,
                        cancellable,
                        generation,
                        groups,
                        onUpdate
                    );
                }
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    cancel() {
        this._stopActiveSearch();
        this._terms = [];
        this._providerResults.clear();
    }

    destroy() {
        this.cancel();
        this._fallbackAppProvider = null;
        this._appSystem = null;
        this._providerResults = null;
    }

    async _queryProvider(group, terms, previousResults, cancellable,
        generation, groups, onUpdate) {
        try {
            const provider = group.provider;
            const resultIds = previousResults &&
                typeof provider.getSubsearchResultSet === 'function'
                ? await provider.getSubsearchResultSet(
                    previousResults,
                    terms,
                    cancellable
                )
                : await provider.getInitialResultSet(terms, cancellable);

            if (!this._isCurrent(cancellable, generation))
                return;

            const allResultIds = Array.isArray(resultIds) ? resultIds : [];
            this._providerResults.set(provider, allResultIds);
            const displayedIds = this._filterResults(provider, allResultIds);
            const metas = displayedIds.length > 0
                ? await provider.getResultMetas(displayedIds, cancellable)
                : [];

            if (!this._isCurrent(cancellable, generation))
                return;

            group.results = this._normalizeResults(
                provider,
                Array.isArray(metas) ? metas : [],
                terms
            );
        } catch (error) {
            if (this._isCurrent(cancellable, generation)) {
                const providerId = group.provider.id ?? 'unknown';
                console.error(
                    `Start menu search provider ${providerId} failed: ${error}`
                );
            }
        } finally {
            if (!this._isCurrent(cancellable, generation))
                return;

            group.complete = true;
            const complete = groups.every(item => item.complete);
            const visibleGroups = groups.filter(item =>
                item.complete && item.results.length > 0
            );
            try {
                onUpdate(visibleGroups, complete);
            } catch (error) {
                console.error(`Failed to display start menu results: ${error}`);
            }
            if (complete && this._cancellable === cancellable)
                this._cancellable = null;
        }
    }

    _getProviders() {
        const searchController = Main.overview?.searchController ??
            Main.overview?._overview?.controls?._searchController;
        const shellProviders = searchController?._searchResults?._providers;
        const providers = shellProviders?.[Symbol.iterator]
            ? [...shellProviders]
            : [];
        const usableProviders = providers.filter(provider =>
            typeof provider?.getInitialResultSet === 'function' &&
            typeof provider?.getResultMetas === 'function'
        );

        if (!usableProviders.some(provider =>
            provider instanceof AppDisplay.AppSearchProvider)) {
            usableProviders.unshift(this._fallbackAppProvider);
        }

        return [...new Set(usableProviders)];
    }

    _filterResults(provider, resultIds) {
        const maxResults = provider.appInfo
            ? MAX_PROVIDER_RESULTS
            : MAX_APPLICATION_RESULTS;
        const filtered = typeof provider.filterResults === 'function'
            ? provider.filterResults(resultIds, maxResults)
            : resultIds.slice(0, maxResults);
        return Array.isArray(filtered) ? filtered : [];
    }

    _getProviderName(provider) {
        try {
            return provider.appInfo?.get_name?.() ?? null;
        } catch {
            return null;
        }
    }

    _normalizeResults(provider, metas, terms) {
        return metas
            .filter(meta => meta?.id && meta?.name)
            .map(meta => ({
                provider,
                meta,
                id: meta.id,
                name: meta.name,
                description: meta.description ?? null,
                terms,
                app: provider.appInfo
                    ? null
                    : this._appSystem.lookup_app(meta.id),
            }));
    }

    _isCurrent(cancellable, generation) {
        return !cancellable.is_cancelled() &&
            generation === this._generation;
    }

    _stopActiveSearch() {
        this._generation++;
        if (this._searchTimeoutId) {
            GLib.Source.remove(this._searchTimeoutId);
            this._searchTimeoutId = 0;
        }
        this._cancellable?.cancel();
        this._cancellable = null;
    }
}
