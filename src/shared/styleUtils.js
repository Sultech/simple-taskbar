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

export function setStylePseudoClass(actor, pseudoClass, enabled) {
    if (enabled)
        actor.add_style_pseudo_class(pseudoClass);
    else
        actor.remove_style_pseudo_class(pseudoClass);
}
