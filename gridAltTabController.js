// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {GridAltTabPopup} from './gridAltTabPopup.js';

const FORWARD_BINDING = 'grid-alt-tab-hotkey';
const BACKWARD_BINDING = 'grid-alt-tab-backward-hotkey';
const SYSTEM_ACTIONS = new Map([
    ['switch-applications', [
        Meta.KeyBindingAction.SWITCH_APPLICATIONS,
        Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD,
    ]],
    ['switch-applications-backward', [
        Meta.KeyBindingAction.SWITCH_APPLICATIONS,
        Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD,
    ]],
    ['switch-windows', [
        Meta.KeyBindingAction.SWITCH_WINDOWS,
        Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD,
    ]],
    ['switch-windows-backward', [
        Meta.KeyBindingAction.SWITCH_WINDOWS,
        Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD,
    ]],
    ['switch-group', [
        Meta.KeyBindingAction.SWITCH_GROUP,
        Meta.KeyBindingAction.SWITCH_GROUP_BACKWARD,
    ]],
    ['switch-group-backward', [
        Meta.KeyBindingAction.SWITCH_GROUP,
        Meta.KeyBindingAction.SWITCH_GROUP_BACKWARD,
    ]],
]);

export class GridAltTabController {
    constructor(settings, switcherKeybindings) {
        this._settings = settings;
        this._switcherKeybindings = switcherKeybindings;
        this._settingChangedId = 0;
        this._forwardAction = Meta.KeyBindingAction.NONE;
        this._backwardAction = Meta.KeyBindingAction.NONE;
        this._popup = null;
        this._windowOrder = [];
        this._systemHandler = this._startSystemSwitcher.bind(this);
    }

    enable() {
        this._settingChangedId = this._settings.connect(
            'changed::grid-alt-tab-enabled',
            () => this._sync()
        );
        this._sync();
    }

    destroy() {
        if (this._settingChangedId) {
            this._settings.disconnect(this._settingChangedId);
            this._settingChangedId = 0;
        }
        this._closePopup();
        this._disableBindings();
        this._systemHandler = null;
        this._windowOrder = null;
        this._switcherKeybindings = null;
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
        this._switcherKeybindings.setGridHandler(this._systemHandler);
        if (this._forwardAction !== Meta.KeyBindingAction.NONE)
            return;

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
            this._removeRegisteredBindings();
        }
    }

    _disableBindings() {
        this._switcherKeybindings.setGridHandler(null);
        this._removeRegisteredBindings();
    }

    _removeRegisteredBindings() {
        if (this._forwardAction !== Meta.KeyBindingAction.NONE)
            Main.wm.removeKeybinding(FORWARD_BINDING);
        if (this._backwardAction !== Meta.KeyBindingAction.NONE)
            Main.wm.removeKeybinding(BACKWARD_BINDING);
        this._forwardAction = Meta.KeyBindingAction.NONE;
        this._backwardAction = Meta.KeyBindingAction.NONE;
    }

    _startSwitcher(backward, _display, _window, _event, binding) {
        this._showSwitcher(
            backward,
            binding,
            this._forwardAction,
            this._backwardAction
        );
    }

    _startSystemSwitcher(_display, _window, _event, binding) {
        const [forwardAction, backwardAction] =
            SYSTEM_ACTIONS.get(binding.get_name());
        this._showSwitcher(
            binding.is_reversed(),
            binding,
            forwardAction,
            backwardAction
        );
    }

    _showSwitcher(
        backward,
        binding,
        forwardAction,
        backwardAction
    ) {
        this._closePopup();

        const popup = new GridAltTabPopup(
            this._getSwitcherWindows(),
            this._settings.get_int('grid-alt-tab-max-card-size'),
            forwardAction,
            backwardAction
        );
        this._popup = popup;
        popup.connect('destroy', () => {
            if (this._popup === popup)
                this._popup = null;
        });

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

        if (orderIsCurrent) {
            const focusedWindow = windows[0];
            const focusedIndex =
                this._windowOrder.indexOf(focusedWindow);
            if (focusedIndex > 0) {
                this._windowOrder.splice(focusedIndex, 1);
                this._windowOrder.unshift(focusedWindow);
            }
            return [...this._windowOrder];
        }

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

}
