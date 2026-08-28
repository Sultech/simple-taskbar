// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {normalizeAccelerator} from '../shared/keybindingUtils.js';

export function confirmReset(window, createSettings) {
    const dialog = new Adw.AlertDialog({
        heading: _('Reset all settings?'),
        body: _(
            'This will restore taskbar and Start Menu settings. Pinned taskbar apps and Start Menu items, including folders and their order, will be kept.'
        ),
    });
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('reset', _('Reset'));
    dialog.set_response_appearance(
        'reset',
        Adw.ResponseAppearance.DESTRUCTIVE
    );
    dialog.set_default_response('cancel');
    dialog.set_close_response('cancel');
    dialog.choose(window, null, (source, result) => {
        let response;
        try {
            response = source.choose_finish(result);
        } catch (error) {
            console.error(error);
            return;
        }
        if (response !== 'reset')
            return;

        const resetSettings = createSettings();
        resetSettings.delay();
        for (const key of resetSettings.settings_schema.list_keys()) {
            if (key === 'start-menu-displaced-overlay-key' ||
                key === 'start-menu-pinned-apps') {
                continue;
            }
            resetSettings.reset(key);
        }
        resetSettings.apply();
    });
}

export function addResetGroup(page, window, createSettings) {
    const resetGroup = new Adw.PreferencesGroup({
        title: _('Reset'),
    });
    page.add(resetGroup);

    const resetRow = new Adw.ActionRow({
        title: _('Reset All Settings'),
        subtitle: _('Restore defaults without changing pinned taskbar apps or Start Menu items'),
    });
    const resetButton = new Gtk.Button({
        label: _('Reset…'),
        valign: Gtk.Align.CENTER,
    });
    resetButton.add_css_class('destructive-action');
    resetButton.connect('clicked', () => {
        confirmReset(window, createSettings);
    });
    resetRow.add_suffix(resetButton);
    resetRow.activatable_widget = resetButton;
    resetGroup.add(resetRow);
}

export function openCustomShortcutDialog(window) {
    const dialog = new Adw.Window({
        title: _('Set Custom Shortcut'),
        transient_for: window,
        modal: true,
        resizable: false,
        default_width: 420,
        default_height: 230,
    });
    const content = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
    });
    content.append(new Adw.HeaderBar());
    const statusPage = new Adw.StatusPage({
        icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
        title: _('Press a keyboard shortcut'),
        description: _('Press Backspace to clear it, or Escape to cancel.'),
        vexpand: true,
    });
    content.append(statusPage);
    dialog.content = content;

    const keyController = new Gtk.EventControllerKey();
    dialog.add_controller(keyController);
    keyController.connect(
        'key-pressed',
        (controller, keyval, _keycode, state) => {
            let modifiers = state & Gtk.accelerator_get_default_mod_mask();
            modifiers &= ~Gdk.ModifierType.LOCK_MASK;

            if (keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (keyval === Gdk.KEY_BackSpace && modifiers === 0) {
                window._settings.set_strv('start-menu-custom-hotkey', []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }

            const event = controller.get_current_event();
            if (event.is_modifier())
                return Gdk.EVENT_STOP;

            let normalizedKeyval = Gdk.keyval_to_lower(keyval);
            if (normalizedKeyval === Gdk.KEY_ISO_Left_Tab)
                normalizedKeyval = Gdk.KEY_Tab;
            if (normalizedKeyval !== keyval)
                modifiers |= Gdk.ModifierType.SHIFT_MASK;

            const valid = Gtk.accelerator_valid(
                normalizedKeyval,
                modifiers
            ) || (normalizedKeyval === Gdk.KEY_Tab && modifiers !== 0);
            if (!valid) {
                statusPage.description = _(
                    'That shortcut needs a modifier key. Try another shortcut.'
                );
                return Gdk.EVENT_STOP;
            }

            const accelerator = Gtk.accelerator_name(
                normalizedKeyval,
                modifiers
            );
            if (findManagedShortcutConflict(
                window._settings,
                accelerator
            )) {
                statusPage.description = _(
                    'That shortcut is already in use. Press a different shortcut.'
                );
                return Gdk.EVENT_STOP;
            }

            window._settings.set_strv(
                'start-menu-custom-hotkey',
                [accelerator]
            );
            dialog.close();
            return Gdk.EVENT_STOP;
        }
    );
    dialog.present();
}

export function selectFolderMenuLocation(window) {
    const dialog = new Gtk.FileDialog({
        title: _('Choose a Folder'),
    });
    const currentLocation = window._settings.get_string('folder-menu-uri');
    if (currentLocation) {
        dialog.initial_folder = currentLocation.includes('://')
            ? Gio.File.new_for_uri(currentLocation)
            : Gio.File.new_for_path(currentLocation);
    }
    dialog.select_folder(window, null, (source, result) => {
        let folder;
        try {
            folder = source.select_folder_finish(result);
        } catch (_error) {
            return;
        }
        window._settings.set_string('folder-menu-uri', folder.get_uri());
    });
}

function findManagedShortcutConflict(settings, accelerator) {
    const managed = [];
    if (settings.get_boolean('grid-alt-tab-enabled')) {
        managed.push(
            ...settings.get_strv('grid-alt-tab-hotkey'),
            ...settings.get_strv('grid-alt-tab-backward-hotkey')
        );
    }
    if (settings.get_boolean('super-e-file-manager-enabled')) {
        managed.push(
            ...settings.get_strv('super-e-file-manager-hotkey')
        );
    }
    const startMenuAvailable =
        settings.get_boolean('windows-start-menu-enabled') &&
        (!settings.get_boolean('default-gnome-panel') ||
            settings.get_boolean('dock-mode'));
    if (startMenuAvailable &&
        (settings.get_boolean('start-menu-super-key') ||
            settings.get_boolean('start-menu-super-tab'))) {
        managed.push(
            ...settings.get_strv('start-menu-super-tab-hotkey')
        );
    }

    const normalized = normalizeAccelerator(accelerator);
    return managed.some(candidate =>
        normalizeAccelerator(candidate) === normalized);
}
