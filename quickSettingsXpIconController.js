// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';

const ASSET_DIRECTORY = ['icons', 'taskbar', 'xp', 'quick-settings'];

const ASSETS = Object.freeze({
    acPower: 'ac_power.png',
    batteryCharging: 'battery_charging.png',
    batteryCritical: 'battery_critical.png',
    batteryEmpty: 'battery_empty.png',
    batteryFull: 'battery_full.png',
    batteryLow: 'battery_low.png',
    batteryMedium: 'battery_medium.png',
    batteryUnknown: 'battery_unknown.png',
    bluetooth: 'bluetooth.png',
    camera: 'camera.png',
    camcorder: 'camcorder.png',
    microphone: 'microphone.png',
    networkError: 'net_error.png',
    networkIdle: 'net_idle.png',
    networkLan: 'net_lan.png',
    networkOffline: 'net_offline.png',
    networkVpn: 'net_vpn.png',
    networkWireless: 'net_wireless.png',
    volumeOff: 'volume_off.png',
    volumeOn: 'volume_on.png',
});

function getNetworkAsset(iconName) {
    const name = iconName || '';

    if (!name || name.includes('disconnected') || name.includes('disabled'))
        return ASSETS.networkOffline;
    if (name.includes('no-route'))
        return ASSETS.networkError;
    if (name.includes('acquiring'))
        return ASSETS.networkIdle;
    if (name.startsWith('network-wireless'))
        return ASSETS.networkWireless;
    if (name.startsWith('network-wired'))
        return ASSETS.networkLan;

    return null;
}

function getThemedIconName(gicon) {
    if (!gicon)
        return '';

    const names = gicon.get_names();
    return names.length > 0 ? names[0] : '';
}

function getPowerAsset(record) {
    const iconName = getThemedIconName(record.gicon) ||
        record.iconName || '';

    if (iconName === 'system-shutdown-symbolic')
        return ASSETS.acPower;
    if (iconName.includes('charging'))
        return ASSETS.batteryCharging;

    const match = iconName.match(/battery-level-(\d+)/);
    if (!match)
        return ASSETS.batteryUnknown;

    const level = Number(match[1]);
    if (level === 0)
        return ASSETS.batteryEmpty;
    if (level <= 15)
        return ASSETS.batteryCritical;
    if (level <= 25)
        return ASSETS.batteryLow;
    if (level <= 75)
        return ASSETS.batteryMedium;
    return ASSETS.batteryFull;
}

function getVolumeAsset(iconName) {
    const name = iconName || '';
    return name.includes('muted') || name.includes('none')
        ? ASSETS.volumeOff
        : ASSETS.volumeOn;
}

export class QuickSettingsXpIconController {
    constructor(settings, extensionDir, quickSettings) {
        this._settings = settings;
        this._extensionDir = extensionDir;
        this._quickSettings = quickSettings;
        this._indicatorBox = quickSettings._indicators;
        this._records = new Map();
        this._assetIcons = new Map();
        this._childAddedId = 0;
        this._childRemovedId = 0;
    }

    enable() {
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => this._syncMode(),
            this
        );
        this._syncMode();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._stopTracking();
        this._assetIcons.clear();
        this._indicatorBox = null;
        this._quickSettings = null;
        this._extensionDir = null;
        this._settings = null;
    }

    _startTracking() {
        this._childAddedId = this._indicatorBox.connect(
            'child-added',
            () => this._syncIndicators()
        );
        this._childRemovedId = this._indicatorBox.connect(
            'child-removed',
            () => this._syncIndicators()
        );
        this._syncIndicators();
    }

    _stopTracking() {
        if (this._childAddedId)
            this._indicatorBox.disconnect(this._childAddedId);
        if (this._childRemovedId)
            this._indicatorBox.disconnect(this._childRemovedId);
        this._childAddedId = 0;
        this._childRemovedId = 0;

        for (const record of this._records.values()) {
            this._disconnectRecord(record);
            this._restore(record);
        }
        this._records.clear();
        this._assetIcons.clear();
    }

    _syncMode() {
        if (this._settings.get_boolean('windows-xp-theme-enabled'))
            this._startTracking();
        else
            this._stopTracking();
    }

    _syncIndicators() {
        const targets = this._getTargets();

        for (const [icon, target] of targets) {
            if (this._records.has(icon))
                continue;

            const record = {
                icon,
                kind: target.kind,
                source: target.source,
                iconName: null,
                gicon: null,
                fallbackIconName: null,
                visible: false,
                xpIcon: null,
                syncing: false,
            };
            this._capture(record);
            icon.connectObject(
                'notify::icon-name',
                () => this._sourceChanged(record, 'icon-name'),
                'notify::gicon',
                () => this._sourceChanged(record, 'gicon'),
                'notify::fallback-icon-name',
                () => this._sourceChanged(record, 'fallback-icon-name'),
                this
            );
            if (record.kind === 'bluetooth')
                record.source._client.connectObject(
                    'notify::active',
                    () => this._syncBluetooth(record),
                    'devices-changed',
                    () => this._syncBluetooth(record),
                    this
                );
            this._records.set(icon, record);
        }

        for (const [icon, record] of this._records) {
            if (targets.has(icon))
                continue;

            this._disconnectRecord(record);
            this._restore(record);
            this._records.delete(icon);
        }

        this._syncTheme();
    }

    _getTargets() {
        const targets = new Map();
        const quickSettings = this._quickSettings;

        if (quickSettings._network) {
            const network = quickSettings._network;
            this._addTarget(targets, network._primaryIndicator, 'network');
            this._addTarget(targets, network._vpnIndicator, 'vpn');
        }
        if (quickSettings._bluetooth)
            this._addTarget(
                targets,
                quickSettings._bluetooth._indicator,
                'bluetooth',
                quickSettings._bluetooth
            );
        if (quickSettings._system)
            this._addTarget(
                targets,
                quickSettings._system._indicator,
                'power'
            );
        if (quickSettings._camera)
            this._addTarget(
                targets,
                quickSettings._camera._indicator,
                'camera'
            );
        if (quickSettings._remoteAccess)
            this._addTarget(
                targets,
                quickSettings._remoteAccess._indicator,
                'camcorder'
            );
        if (quickSettings._volumeOutput)
            this._addTarget(
                targets,
                quickSettings._volumeOutput._indicator,
                'volume'
            );
        if (quickSettings._volumeInput)
            this._addTarget(
                targets,
                quickSettings._volumeInput._indicator,
                'microphone'
            );

        return targets;
    }

    _addTarget(targets, icon, kind, source) {
        targets.set(icon, {kind, source});
    }

    _capture(record) {
        record.iconName = record.icon.icon_name;
        record.gicon = record.icon.gicon;
        record.fallbackIconName = record.icon.fallback_icon_name;
        if (record.kind !== 'bluetooth')
            record.visible = record.icon.visible;
    }

    _sourceChanged(record, propertyName) {
        if (record.syncing)
            return;

        if (record.xpIcon && record.icon.gicon === record.xpIcon) {
            if (propertyName === 'fallback-icon-name')
                record.fallbackIconName = record.icon.fallback_icon_name;
            return;
        }

        this._capture(record);
        if (this._settings.get_boolean('windows-xp-theme-enabled'))
            this._apply(record);
    }

    _syncTheme() {
        const enabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        for (const record of this._records.values()) {
            if (!enabled) {
                this._restore(record);
                continue;
            }
            if (record.kind === 'bluetooth')
                this._syncBluetooth(record);
            else
                this._apply(record);
        }
    }

    _syncBluetooth(record) {
        if (!this._settings.get_boolean('windows-xp-theme-enabled'))
            return;

        record.visible = [...record.source._client.getDevices()]
            .some(device => device.connected);
        record.syncing = true;
        record.icon.visible = record.source._client.active;
        record.syncing = false;
        this._apply(record);
    }

    _getAssetName(record) {
        switch (record.kind) {
        case 'network':
            return getNetworkAsset(record.iconName);
        case 'vpn':
            return ASSETS.networkVpn;
        case 'bluetooth':
            return ASSETS.bluetooth;
        case 'power':
            return getPowerAsset(record);
        case 'camera':
            return ASSETS.camera;
        case 'camcorder':
            return ASSETS.camcorder;
        case 'volume':
            return getVolumeAsset(record.iconName);
        case 'microphone':
            return ASSETS.microphone;
        default:
            return null;
        }
    }

    _getAssetIcon(assetName) {
        let icon = this._assetIcons.get(assetName);
        if (icon)
            return icon;

        let file = this._extensionDir;
        for (const directory of ASSET_DIRECTORY)
            file = file.get_child(directory);
        file = file.get_child(assetName);
        icon = new Gio.FileIcon({file});
        this._assetIcons.set(assetName, icon);
        return icon;
    }

    _apply(record) {
        const assetName = this._getAssetName(record);
        if (!assetName) {
            this._restore(record);
            return;
        }

        record.xpIcon = this._getAssetIcon(assetName);
        record.syncing = true;
        record.icon.gicon = record.xpIcon;
        record.syncing = false;
    }

    _disconnectRecord(record) {
        record.icon.disconnectObject(this);
        if (record.source)
            record.source._client.disconnectObject(this);
    }

    _restore(record) {
        record.xpIcon = null;
        record.syncing = true;
        record.icon.gicon = record.gicon;
        record.icon.fallback_icon_name = record.fallbackIconName;
        if (record.kind === 'bluetooth')
            record.icon.visible = record.visible;
        record.syncing = false;
    }
}
