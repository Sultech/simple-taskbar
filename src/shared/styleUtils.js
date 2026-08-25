// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function appendStyle(baseStyle, addition) {
    const base = baseStyle ?? '';
    if (!base)
        return addition;

    return base.trimEnd().endsWith(';')
        ? `${base} ${addition}`
        : `${base}; ${addition}`;
}
