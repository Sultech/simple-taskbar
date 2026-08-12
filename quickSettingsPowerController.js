// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export class QuickSettingsPowerController {
    constructor(settings, quickSettings) {
        this._settings = settings;
        this._quickSettings = quickSettings;
        this._shutdownItem = null;
        this._shutdownVisibilityId = 0;
        this._systemIndicator = null;
        this._powerToggle = null;
        this._powerToggleVisibilityId = 0;
        this._gridChildAddedId = 0;
    }

    enable() {
        this._settings.connectObject(
            'changed::start-menu-power-options-enabled',
            this._sync.bind(this),
            'changed::windows-start-menu-enabled',
            this._sync.bind(this),
            'changed::default-gnome-panel',
            this._sync.bind(this),
            this
        );
        const grid = this._quickSettings.menu._grid;
        this._gridChildAddedId = grid.connect(
            'child-added',
            () => this._sync()
        );
        this._sync();
    }

    destroy() {
        this._settings.disconnectObject(this);
        const grid = this._quickSettings.menu._grid;
        if (this._gridChildAddedId)
            grid.disconnect(this._gridChildAddedId);
        this._gridChildAddedId = 0;
        const shutdownItem = this._shutdownItem;
        this._disconnectShutdownItem();
        if (shutdownItem)
            shutdownItem._sync();
        const panelIndicator = this._systemIndicator?._indicator;
        this._disconnectSystemIndicator();
        if (panelIndicator)
            panelIndicator.show();
        this._settings = null;
        this._quickSettings = null;
    }

    _sync() {
        const systemIndicator = this._quickSettings._system;
        if (!systemIndicator)
            return;

        this._setSystemIndicator(systemIndicator);
        this._setShutdownItem(this._findShutdownItem());
        if (this._shutdownItem) {
            if (this._shouldReplacePowerMenu()) {
                this._shutdownItem.menu.close();
                this._shutdownItem.hide();
            } else {
                this._restoreShutdownItem();
            }
        }
        this._syncPanelIndicator();
    }

    _findShutdownItem() {
        const systemItem = this._quickSettings._system._systemItem;
        const shutdownMenu = systemItem.menu;

        return systemItem.child.get_children()
            .find(child => child.menu === shutdownMenu);
    }

    _setShutdownItem(item) {
        if (item === this._shutdownItem)
            return;

        this._disconnectShutdownItem();
        this._shutdownItem = item;
        if (!item)
            return;

        this._shutdownVisibilityId = item.connect(
            'notify::visible',
            () => {
                if (this._shouldReplacePowerMenu() && item.visible)
                    item.hide();
            }
        );
    }

    _disconnectShutdownItem() {
        if (this._shutdownItem && this._shutdownVisibilityId)
            this._shutdownItem.disconnect(this._shutdownVisibilityId);
        this._shutdownVisibilityId = 0;
        this._shutdownItem = null;
    }

    _restoreShutdownItem() {
        if (this._shutdownItem)
            this._shutdownItem._sync();
    }

    _setSystemIndicator(systemIndicator) {
        if (systemIndicator === this._systemIndicator)
            return;

        const oldPanelIndicator = this._systemIndicator?._indicator;
        this._disconnectSystemIndicator();
        if (oldPanelIndicator)
            oldPanelIndicator.show();
        this._systemIndicator = systemIndicator;
        this._powerToggle = systemIndicator._systemItem.powerToggle;

        this._powerToggleVisibilityId = this._powerToggle.connect(
            'notify::visible',
            () => this._syncPanelIndicator()
        );
    }

    _disconnectSystemIndicator() {
        if (this._powerToggle && this._powerToggleVisibilityId)
            this._powerToggle.disconnect(this._powerToggleVisibilityId);
        this._powerToggleVisibilityId = 0;
        this._powerToggle = null;
        this._systemIndicator = null;
    }

    _syncPanelIndicator() {
        const panelIndicator = this._systemIndicator._indicator;
        const hideFallback = this._shouldReplacePowerMenu() &&
            !this._powerToggle.visible;
        panelIndicator.visible = !hideFallback;
    }

    _shouldReplacePowerMenu() {
        const powerOptionsEnabled = this._settings.get_boolean(
            'start-menu-power-options-enabled'
        );
        return powerOptionsEnabled &&
            this._settings.get_boolean('windows-start-menu-enabled') &&
            !this._settings.get_boolean('default-gnome-panel');
    }
}
