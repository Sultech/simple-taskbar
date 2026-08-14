// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function setInteger(settings, key, value) {
    if (settings.get_int(key) !== value)
        settings.set_int(key, value);
}

export function setString(settings, key, value) {
    if (settings.get_string(key) !== value)
        settings.set_string(key, value);
}

export function setBoolean(settings, key, value) {
    if (settings.get_boolean(key) !== value)
        settings.set_boolean(key, value);
}

export function setStringArray(settings, key, value) {
    const current = settings.get_strv(key);
    if (current.length !== value.length ||
        current.some((item, index) => item !== value[index])) {
        settings.set_strv(key, value);
    }
}
