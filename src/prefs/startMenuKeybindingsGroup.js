// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {openCustomShortcutDialog} from './preferencesDialogs.js';
import {createSwitchRow, setButtonIcon} from './preferencesWidgets.js';

function createShortcutRow(window, settings, connectSettings, {title, key, fallbackAccelerator = ''}) {
    const label = new Gtk.ShortcutLabel({
        disabled_text: _('Not set'),
        valign: Gtk.Align.CENTER,
    });
    const editButton = new Gtk.Button({
        tooltip_text: _('Set custom shortcut'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(editButton, 'document-edit-symbolic');
    const clearButton = new Gtk.Button({
        tooltip_text: _('Clear custom shortcut'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(clearButton, 'edit-clear-symbolic');
    const row = new Adw.ActionRow({title, activatable_widget: editButton});
    row.add_suffix(label);
    row.add_suffix(clearButton);
    row.add_suffix(editButton);

    const syncShortcut = () => {
        const [accelerator] = settings.get_strv(key);
        label.accelerator = accelerator ?? fallbackAccelerator;
        clearButton.visible = Boolean(accelerator);
    };
    editButton.connect('clicked', () => openCustomShortcutDialog(window, key));
    clearButton.connect('clicked', () => settings.set_strv(key, []));
    connectSettings(settings, `changed::${key}`, syncShortcut);
    syncShortcut();
    return row;
}

export function addStartMenuKeybindingsGroup({window, settings, connectSettings, keyboardSubpage, windowsStartMenuSwitch}) {
    const startMenuKeybindingsGroup = keyboardSubpage.addGroup({
        title: _('Keyboard Shortcuts'),
        description: _('Configure Start menu shortcuts.'),
    });

    const superKeyRow = createSwitchRow(settings, {
        key: 'start-menu-super-key',
        title: _('Super Opens Start Menu'),
        subtitle: _('Use Super for the Start Menu and move the Overview to Super+Tab or your own shortcut'),
    });
    startMenuKeybindingsGroup.add(superKeyRow);

    const overviewShortcutRow = createShortcutRow(window, settings, connectSettings, {
        title: _('Overview Shortcut'),
        key: 'overview-custom-hotkey',
        fallbackAccelerator: '<Super>Tab',
    });
    startMenuKeybindingsGroup.add(overviewShortcutRow);

    const superTabRow = createSwitchRow(settings, {
        key: 'start-menu-super-tab',
        title: _('Super+Tab Opens Start Menu'),
        subtitle: _(
            'Use GNOME’s application-switch shortcut for the Eleven-style Start Menu while it is enabled'
        ),
    });
    startMenuKeybindingsGroup.add(superTabRow);
    const updateSuperTabRow = () => {
        const windowsXpTheme = settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        superKeyRow.sensitive = windowsStartMenuSwitch.active &&
            !windowsXpTheme;
        superTabRow.sensitive = windowsStartMenuSwitch.active;
        overviewShortcutRow.sensitive = superKeyRow.sensitive && superKeyRow.active;
        overviewShortcutRow.subtitle = superKeyRow.active
            ? _('Opens the Overview while Super opens the Start Menu; clear it to use Super+Tab')
            : _('Turn on the Super shortcut to change the Overview shortcut');
    };
    superKeyRow.connect('notify::active', () => {
        if (superKeyRow.active && superTabRow.active)
            settings.set_boolean('start-menu-super-tab', false);
        updateSuperTabRow();
    });
    superTabRow.connect('notify::active', () => {
        if (superTabRow.active && superKeyRow.active)
            settings.set_boolean('start-menu-super-key', false);
    });
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateSuperTabRow
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        updateSuperTabRow
    );
    updateSuperTabRow();

    const customShortcutRow = createShortcutRow(window, settings, connectSettings, {
        title: _('Custom Start Menu Shortcut'),
        key: 'start-menu-custom-hotkey',
    });
    startMenuKeybindingsGroup.add(customShortcutRow);

    const updateCustomShortcutRow = () => {
        customShortcutRow.sensitive =
            windowsStartMenuSwitch.active && !superTabRow.active &&
            !superKeyRow.active;
        if (superKeyRow.active) {
            customShortcutRow.subtitle =
                _('Turn off the Super shortcut to use a custom shortcut');
        } else if (superTabRow.active) {
            customShortcutRow.subtitle =
                _('Turn off Super+Tab to use a custom shortcut');
        } else {
            customShortcutRow.subtitle =
                _('Choose any unused keyboard shortcut; none is assigned by default');
        }
    };

    superKeyRow.connect('notify::active', updateCustomShortcutRow);
    superTabRow.connect('notify::active', updateCustomShortcutRow);
    windowsStartMenuSwitch.connect(
        'notify::active',
        updateCustomShortcutRow
    );
    updateCustomShortcutRow();
}
