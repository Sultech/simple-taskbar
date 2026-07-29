// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {GridAltTabPopup} from './gridAltTabPopup.js';

const FORWARD_BINDING = 'grid-alt-tab-hotkey';
const BACKWARD_BINDING = 'grid-alt-tab-backward-hotkey';
const DISPLACED_BINDINGS_KEY = 'grid-alt-tab-displaced-bindings';
const ENTRY_SEPARATOR = '\u001f';
const GRID_ACCELERATORS = new Set([
    '<alt>tab',
    '<shift><alt>tab',
    '<alt><shift>tab',
]);
const KEYBINDING_SCHEMAS = [
    'org.gnome.desktop.wm.keybindings',
    'org.gnome.mutter.keybindings',
    'org.gnome.mutter.wayland.keybindings',
    'org.gnome.shell.keybindings',
];

export class GridAltTabController {
    constructor(settings) {
        this._settings = settings;
        this._settingChangedId = 0;
        this._keybindingSettings = KEYBINDING_SCHEMAS.map(schemaId => ({
            schemaId,
            settings: new Gio.Settings({schema_id: schemaId}),
            changedId: 0,
        }));
        this._forwardAction = Meta.KeyBindingAction.NONE;
        this._backwardAction = Meta.KeyBindingAction.NONE;
        this._popup = null;
        this._windowOrder = [];
    }

    enable() {
        this._settingChangedId = this._settings.connect(
            'changed::grid-alt-tab-enabled',
            () => this._sync()
        );
        for (const entry of this._keybindingSettings) {
            entry.changedId = entry.settings.connect('changed', () => {
                if (this._settings.get_boolean('grid-alt-tab-enabled'))
                    this._displaceSystemBindings();
            });
        }
        this._sync();
    }

    destroy() {
        if (this._settingChangedId) {
            this._settings.disconnect(this._settingChangedId);
            this._settingChangedId = 0;
        }
        for (const entry of this._keybindingSettings) {
            entry.settings.disconnect(entry.changedId);
            entry.changedId = 0;
        }
        this._closePopup();
        this._disableBindings();
        this._keybindingSettings = null;
        this._windowOrder = null;
        this._settings = null;
    }

    _sync() {
        this._closePopup();
        if (this._settings.get_boolean('grid-alt-tab-enabled'))
            this._enableBindings();
        else
            this._disableBindings();
    }

    _enableBindings() {
        if (this._forwardAction !== Meta.KeyBindingAction.NONE)
            return;

        this._displaceSystemBindings();
        this._forwardAction = Main.wm.addKeybinding(
            FORWARD_BINDING,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            this._startSwitcher.bind(this, false)
        );
        this._backwardAction = Main.wm.addKeybinding(
            BACKWARD_BINDING,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            this._startSwitcher.bind(this, true)
        );

        if (this._forwardAction === Meta.KeyBindingAction.NONE ||
            this._backwardAction === Meta.KeyBindingAction.NONE) {
            console.warn(
                'Simple Taskbar: Grid Alt-Tab shortcuts could not be registered'
            );
            this._settings.set_boolean('grid-alt-tab-enabled', false);
        }
    }

    _disableBindings() {
        if (this._forwardAction !== Meta.KeyBindingAction.NONE)
            Main.wm.removeKeybinding(FORWARD_BINDING);
        if (this._backwardAction !== Meta.KeyBindingAction.NONE)
            Main.wm.removeKeybinding(BACKWARD_BINDING);
        this._forwardAction = Meta.KeyBindingAction.NONE;
        this._backwardAction = Meta.KeyBindingAction.NONE;
        this._restoreSystemBindings();
    }

    _startSwitcher(backward, _display, _window, _event, binding) {
        this._closePopup();

        let popup;
        popup = new GridAltTabPopup(
            this._getSwitcherWindows(),
            this._settings.get_int('grid-alt-tab-max-card-size'),
            this._forwardAction,
            this._backwardAction,
            () => {
                if (this._popup === popup)
                    this._popup = null;
            }
        );
        this._popup = popup;

        if (!popup.show(
            backward,
            binding.get_name(),
            binding.get_mask()
        )) {
            popup.destroy();
        }
    }

    _getSwitcherWindows() {
        const workspace = this._settings.get_boolean(
            'grid-alt-tab-isolate-workspaces'
        )
            ? global.workspace_manager.get_active_workspace()
            : null;
        const tabList = global.display.get_tab_list(
            Meta.TabList.NORMAL_ALL,
            workspace
        );
        const windows = tabList
            .map(window =>
                window.is_attached_dialog()
                    ? window.get_transient_for()
                    : window)
            .filter((window, index, allWindows) =>
                !window.skip_taskbar &&
                allWindows.indexOf(window) === index);
        const currentWindows = new Set(windows);
        const orderIsCurrent =
            windows.length === this._windowOrder.length &&
            this._windowOrder.every(window =>
                currentWindows.has(window));

        if (orderIsCurrent)
            return [...this._windowOrder];

        if (windows.length > 1)
            windows.push(windows.shift());
        this._windowOrder = windows;
        return [...this._windowOrder];
    }

    _closePopup() {
        if (!this._popup)
            return;

        const popup = this._popup;
        this._popup = null;
        popup.destroy();
    }

    _displaceSystemBindings() {
        const displaced = this._settings.get_strv(
            DISPLACED_BINDINGS_KEY
        );
        const displacedSet = new Set(displaced);

        for (const entry of this._keybindingSettings) {
            for (const key of entry.settings.settings_schema.list_keys()) {
                const value = entry.settings.get_value(key);
                if (value.get_type_string() !== 'as')
                    continue;

                const accelerators = value.deep_unpack();
                const retained = [];
                let changed = false;
                for (const accelerator of accelerators) {
                    if (!this._isGridAccelerator(accelerator)) {
                        retained.push(accelerator);
                        continue;
                    }

                    changed = true;
                    displacedSet.add([
                        entry.schemaId,
                        key,
                        accelerator,
                    ].join(ENTRY_SEPARATOR));
                }
                if (changed)
                    entry.settings.set_strv(key, retained);
            }
        }

        this._settings.set_strv(
            DISPLACED_BINDINGS_KEY,
            [...displacedSet]
        );
    }

    _restoreSystemBindings() {
        const displaced = this._settings.get_strv(
            DISPLACED_BINDINGS_KEY
        );
        if (displaced.length === 0)
            return;

        for (const encoded of displaced) {
            const [schemaId, key, accelerator] =
                encoded.split(ENTRY_SEPARATOR);
            const entry = this._keybindingSettings.find(
                candidate => candidate.schemaId === schemaId
            );
            if (!entry || !key || !accelerator)
                continue;

            const accelerators = entry.settings.get_strv(key);
            if (!accelerators.includes(accelerator)) {
                accelerators.push(accelerator);
                entry.settings.set_strv(key, accelerators);
            }
        }
        this._settings.set_strv(DISPLACED_BINDINGS_KEY, []);
    }

    _isGridAccelerator(accelerator) {
        return GRID_ACCELERATORS.has(
            accelerator.replaceAll(' ', '').toLowerCase()
        );
    }
}
