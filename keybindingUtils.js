// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

const MODIFIER_ALIASES = new Map([
    ['primary', 'control'],
    ['ctrl', 'control'],
    ['ctl', 'control'],
    ['mod1', 'alt'],
]);
const SUPER_OVERLAY_KEYS = new Set([
    'Super',
    'Super_L',
    'Super_R',
]);

export function normalizeAccelerator(accelerator) {
    const compact = accelerator.replaceAll(' ', '').toLowerCase();
    const modifiers = [...compact.matchAll(/<([^>]+)>/g)]
        .map(match => MODIFIER_ALIASES.get(match[1]) ?? match[1])
        .sort();
    const key = compact.replaceAll(/<[^>]+>/g, '');
    return modifiers.map(modifier => `<${modifier}>`).join('') + key;
}

export function isSuperOverlayKey(key) {
    return SUPER_OVERLAY_KEYS.has(key);
}
