// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function setStyleClass(actor, styleClass, present) {
    if (present === actor.has_style_class_name(styleClass))
        return;

    if (present)
        actor.add_style_class_name(styleClass);
    else
        actor.remove_style_class_name(styleClass);
}
