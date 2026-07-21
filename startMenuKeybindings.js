// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SUPER_KEY_SETTING = 'start-menu-super-key';
const SUPER_TAB_KEYBINDING = 'start-menu-super-tab-hotkey';
const CUSTOM_KEYBINDING = 'start-menu-custom-hotkey';
const SWITCH_APPLICATIONS_KEY = 'switch-applications';
const DISPLACED_BINDINGS_KEY =
    'start-menu-displaced-switch-applications';
const DISPLACED_OVERLAY_KEY = 'start-menu-displaced-overlay-key';
const OVERLAY_KEY = 'overlay-key';
const ACTION_MODES = Shell.ActionMode.NORMAL |
    Shell.ActionMode.OVERVIEW |
    Shell.ActionMode.POPUP;
const DEFAULT_OVERLAY_ACTION_MODES = Shell.ActionMode.NORMAL |
    Shell.ActionMode.OVERVIEW;

export class StartMenuKeybindings {
    constructor(settings, toggleMenu, toggleOverview) {
        this._settings = settings;
        this._toggleMenu = toggleMenu;
        this._toggleOverview = toggleOverview;
        this._wmKeybindings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.wm.keybindings',
        });
        this._mutterSettings = new Gio.Settings({
            schema_id: 'org.gnome.mutter',
        });
        this._displacedSwitchApplications = this._settings.get_strv(
            DISPLACED_BINDINGS_KEY
        );
        this._superTabMode = null;
        this._customEnabled = false;
        this._overlayEnabled = false;
        this._overlayHandlerId = 0;
        this._defaultOverlayHandlerId = 0;
        this._startupCompleteId = 0;
    }

    sync() {
        if (!this._startMenuAvailable()) {
            this.disable();
            return;
        }

        if (this._settings.get_boolean(SUPER_KEY_SETTING)) {
            this._disableCustom();
            if (!this._enableSuperTab('overview') ||
                !this._enableOverlayKey()) {
                this._disableSuperTab();
                this._disableOverlayKey();
                this._disableSuperKeySetting();
            }
            return;
        }

        this._disableOverlayKey();
        if (this._settings.get_boolean('start-menu-super-tab')) {
            this._disableCustom();
            this._enableSuperTab('start-menu');
            return;
        }

        this._disableSuperTab();
        if (this._settings.get_strv(CUSTOM_KEYBINDING).length > 0)
            this._enableCustom();
        else
            this._disableCustom();
    }

    customAcceleratorChanged() {
        this._disableCustom();
        this.sync();
    }

    disable() {
        this._disableSuperTab();
        this._disableOverlayKey();
        this._disableCustom();
    }

    destroy() {
        this.disable();
        this._wmKeybindings = null;
        this._mutterSettings = null;
        this._displacedSwitchApplications = null;
        this._settings = null;
        this._toggleMenu = null;
        this._toggleOverview = null;
    }

    _startMenuAvailable() {
        return this._settings.get_boolean('windows-start-menu-enabled') &&
            !this._settings.get_boolean('default-gnome-panel');
    }

    _enableSuperTab(mode) {
        if (this._superTabMode === mode)
            return true;

        this._disableSuperTab();
        this._displaceSwitchApplicationsSuperTab();
        let action = Meta.KeyBindingAction.NONE;
        try {
            action = Main.wm.addKeybinding(
                SUPER_TAB_KEYBINDING,
                this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                ACTION_MODES,
                () => {
                    if (mode === 'overview')
                        this._toggleOverview?.();
                    else
                        this._toggleMenu?.();
                }
            );
        } catch (error) {
            console.error(`Failed to register Super+Tab: ${error}`);
        }

        if (action === Meta.KeyBindingAction.NONE) {
            this._restoreSwitchApplicationsSuperTab();
            console.warn(
                `Simple Taskbar: Super+Tab ${mode} shortcut could not be registered`
            );
            return false;
        }

        this._superTabMode = mode;
        return true;
    }

    _disableSuperTab() {
        if (this._superTabMode)
            Main.wm.removeKeybinding(SUPER_TAB_KEYBINDING);
        this._superTabMode = null;
        this._restoreSwitchApplicationsSuperTab();
    }

    _enableOverlayKey() {
        if (this._overlayEnabled)
            return true;

        this._saveOverlayKey();
        try {
            this._mutterSettings.set_string(OVERLAY_KEY, 'Super');
            Main.wm.allowKeybinding(OVERLAY_KEY, ACTION_MODES);
        } catch (error) {
            console.error(`Failed to configure the Super key: ${error}`);
            this._restoreOverlayKey();
            return false;
        }

        this._overlayEnabled = true;
        if (Main.layoutManager._startingUp) {
            this._startupCompleteId = Main.layoutManager.connect(
                'startup-complete',
                () => {
                    this._startupCompleteId = 0;
                    if (this._overlayEnabled && !this._installOverlayHandler())
                        this._overlayInstallationFailed();
                }
            );
            return true;
        }

        if (this._installOverlayHandler())
            return true;

        this._overlayEnabled = false;
        this._restoreOverlayKey();
        Main.wm.allowKeybinding(
            OVERLAY_KEY,
            DEFAULT_OVERLAY_ACTION_MODES
        );
        return false;
    }

    _installOverlayHandler() {
        const handlerId = GObject.signal_handler_find(global.display, {
            signalId: OVERLAY_KEY,
        });
        if (!handlerId) {
            console.warn(
                'Simple Taskbar: GNOME overlay-key handler was not found'
            );
            return false;
        }

        try {
            GObject.signal_handler_block(global.display, handlerId);
            this._defaultOverlayHandlerId = handlerId;
            this._overlayHandlerId = global.display.connect(
                OVERLAY_KEY,
                () => {
                    this._toggleMenu?.();
                    Main.wm.allowKeybinding(OVERLAY_KEY, ACTION_MODES);
                }
            );
        } catch (error) {
            console.error(`Failed to replace the Super key handler: ${error}`);
            this._unblockDefaultOverlayHandler();
            return false;
        }

        return true;
    }

    _overlayInstallationFailed() {
        this._disableSuperTab();
        this._disableOverlayKey();
        this._disableSuperKeySetting();
    }

    _disableOverlayKey() {
        this._overlayEnabled = false;
        if (this._startupCompleteId) {
            Main.layoutManager.disconnect(this._startupCompleteId);
            this._startupCompleteId = 0;
        }
        if (this._overlayHandlerId) {
            global.display.disconnect(this._overlayHandlerId);
            this._overlayHandlerId = 0;
        }
        this._unblockDefaultOverlayHandler();

        Main.wm.allowKeybinding(
            OVERLAY_KEY,
            DEFAULT_OVERLAY_ACTION_MODES
        );
        this._restoreOverlayKey();
    }

    _saveOverlayKey() {
        if (this._settings.get_strv(DISPLACED_OVERLAY_KEY).length > 0)
            return;

        this._settings.set_strv(DISPLACED_OVERLAY_KEY, [
            this._mutterSettings.get_string(OVERLAY_KEY),
        ]);
    }

    _restoreOverlayKey() {
        const [overlayKey] = this._settings.get_strv(DISPLACED_OVERLAY_KEY);
        if (overlayKey === undefined)
            return;

        try {
            this._mutterSettings.set_string(OVERLAY_KEY, overlayKey);
            this._settings.set_strv(DISPLACED_OVERLAY_KEY, []);
        } catch (error) {
            console.error(`Failed to restore the original Super key: ${error}`);
        }
    }

    _unblockDefaultOverlayHandler() {
        if (!this._defaultOverlayHandlerId)
            return;

        try {
            if (GObject.signal_handler_is_connected(
                global.display,
                this._defaultOverlayHandlerId
            )) {
                GObject.signal_handler_unblock(
                    global.display,
                    this._defaultOverlayHandlerId
                );
            }
        } catch (error) {
            console.warn(
                `Failed to restore GNOME's Super key handler: ${error}`
            );
        }
        this._defaultOverlayHandlerId = 0;
    }

    _disableSuperKeySetting() {
        if (this._settings?.get_boolean(SUPER_KEY_SETTING))
            this._settings.set_boolean(SUPER_KEY_SETTING, false);
    }

    _displaceSwitchApplicationsSuperTab() {
        const accelerators = this._wmKeybindings.get_strv(
            SWITCH_APPLICATIONS_KEY
        );
        const retained = [];
        for (const accelerator of accelerators) {
            if (accelerator.replaceAll(' ', '').toLowerCase() ===
                '<super>tab') {
                if (!this._displacedSwitchApplications.includes(accelerator))
                    this._displacedSwitchApplications.push(accelerator);
            } else {
                retained.push(accelerator);
            }
        }

        if (this._displacedSwitchApplications.length > 0) {
            this._settings.set_strv(
                DISPLACED_BINDINGS_KEY,
                this._displacedSwitchApplications
            );
            this._wmKeybindings.set_strv(
                SWITCH_APPLICATIONS_KEY,
                retained
            );
        }
    }

    _restoreSwitchApplicationsSuperTab() {
        if (this._displacedSwitchApplications.length === 0)
            return;

        const accelerators = this._wmKeybindings.get_strv(
            SWITCH_APPLICATIONS_KEY
        );
        for (const accelerator of this._displacedSwitchApplications) {
            if (!accelerators.includes(accelerator))
                accelerators.push(accelerator);
        }
        this._wmKeybindings.set_strv(
            SWITCH_APPLICATIONS_KEY,
            accelerators
        );
        this._settings.set_strv(DISPLACED_BINDINGS_KEY, []);
        this._displacedSwitchApplications = [];
    }

    _enableCustom() {
        if (this._customEnabled)
            return;

        const action = Main.wm.addKeybinding(
            CUSTOM_KEYBINDING,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            ACTION_MODES,
            () => this._toggleMenu?.()
        );
        this._customEnabled = action !== Meta.KeyBindingAction.NONE;
        if (!this._customEnabled)
            console.warn('Simple Taskbar: custom Start menu shortcut could not be registered');
    }

    _disableCustom() {
        if (!this._customEnabled)
            return;

        Main.wm.removeKeybinding(CUSTOM_KEYBINDING);
        this._customEnabled = false;
    }
}
