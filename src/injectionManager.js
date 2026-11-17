// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

const liveOverrides = new WeakMap();

function liveOverride(prototype, methodName) {
    return liveOverrides.get(prototype)?.get(methodName);
}

export class SafeInjectionManager extends InjectionManager {
    constructor() {
        super();
        this._overrides = new Map();
    }

    overrideMethod(prototype, methodName, createOverrideFunc) {
        const override = {method: null};
        super.overrideMethod(prototype, methodName, originalMethod => {
            override.method = createOverrideFunc(originalMethod);
            return function (...args) {
                const method = override.method ?? liveOverride(prototype, methodName)?.method ?? originalMethod;
                return method?.apply(this, args);
            };
        });

        let protoOverrides = this._overrides.get(prototype);
        if (!protoOverrides) {
            protoOverrides = new Map();
            this._overrides.set(prototype, protoOverrides);
        }
        protoOverrides.set(methodName, override);

        let live = liveOverrides.get(prototype);
        if (!live) {
            live = new Map();
            liveOverrides.set(prototype, live);
        }
        live.set(methodName, override);
    }

    restoreMethod(prototype, methodName) {
        const protoOverrides = this._overrides.get(prototype);
        const override = protoOverrides?.get(methodName);
        if (override) {
            override.method = null;
            protoOverrides.delete(methodName);
            if (protoOverrides.size === 0)
                this._overrides.delete(prototype);

            const live = liveOverrides.get(prototype);
            if (live?.get(methodName) === override)
                live.delete(methodName);
        }
        super.restoreMethod(prototype, methodName);
    }
}
