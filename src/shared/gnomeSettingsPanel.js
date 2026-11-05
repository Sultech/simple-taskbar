// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function openSettingsPanel(panel, args = []) {
    const actionParameter = new GLib.Variant('(sav)', [
        panel,
        args.map(argument => new GLib.Variant('s', argument)),
    ]);
    const parameters = new GLib.Variant('(sava{sv})', [
        'launch-panel',
        [actionParameter],
        {},
    ]);
    Gio.DBus.session.call(
        'org.gnome.Settings',
        '/org/gnome/Settings',
        'org.freedesktop.Application',
        'ActivateAction',
        parameters,
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (connection, result) => {
            connection.call_finish(result);
        }
    );
}
