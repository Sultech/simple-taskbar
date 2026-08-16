// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';

import {
    BLUR_MY_SHELL_UUID,
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from '../shared/blurMyShellUtils.js';

const GNOME_SHELL_SCHEMA = 'org.gnome.shell';

export function createBlurMyShellState(connectSettings) {
    const shellSettings = new Gio.Settings({
        schema_id: GNOME_SHELL_SCHEMA,
    });
    const blurMyShellSettings = getBlurMyShellSettings();
    let blurMyShellPanelSettings = null;
    let blurMyShellPopupSettings = null;
    if (blurMyShellSettings) {
        blurMyShellPanelSettings = getBlurMyShellChildSettings(
            blurMyShellSettings,
            'panel'
        );
        blurMyShellPopupSettings = getBlurMyShellChildSettings(
            blurMyShellSettings,
            'popup'
        );
    }
    const blurMyShellExtensionEnabled = () => {
        const enabledExtensions = shellSettings.get_strv(
            'enabled-extensions'
        );
        const disabledExtensions = shellSettings.get_strv(
            'disabled-extensions'
        );
        return enabledExtensions.includes(BLUR_MY_SHELL_UUID) &&
            !disabledExtensions.includes(BLUR_MY_SHELL_UUID);
    };
    const blurMyShellBlurEnabled = settings => {
        if (!settings ||
            !blurMyShellHasKey(settings, 'blur') ||
            !blurMyShellExtensionEnabled())
            return false;
        return settings.get_boolean('blur');
    };
    const blurMyShellPanelBlurEnabled = () =>
        blurMyShellBlurEnabled(blurMyShellPanelSettings);
    const blurMyShellPopupBlurEnabled = () =>
        blurMyShellBlurEnabled(blurMyShellPopupSettings);
    let syncPanelTransparencyControls = () => {};
    let syncCustomPanelColorControls = () => {};
    let syncStartMenuTransparencyControl = () => {};
    const syncBlurMyShellTransparencyState = () => {
        syncPanelTransparencyControls();
        syncCustomPanelColorControls();
        syncStartMenuTransparencyControl();
    };
    if (blurMyShellPanelSettings &&
        blurMyShellHasKey(blurMyShellPanelSettings, 'blur')) {
        connectSettings(
            blurMyShellPanelSettings,
            'changed::blur',
            syncBlurMyShellTransparencyState
        );
    }
    if (blurMyShellPopupSettings &&
        blurMyShellHasKey(blurMyShellPopupSettings, 'blur')) {
        connectSettings(
            blurMyShellPopupSettings,
            'changed::blur',
            syncBlurMyShellTransparencyState
        );
    }
    for (const key of [
        'enabled-extensions',
        'disabled-extensions',
    ]) {
        connectSettings(
            shellSettings,
            `changed::${key}`,
            syncBlurMyShellTransparencyState
        );
    }

    return {
        blurMyShellPanelBlurEnabled,
        blurMyShellPopupBlurEnabled,
        setStartMenuSync(syncTransparency) {
            syncStartMenuTransparencyControl = syncTransparency;
        },
        setPanelSyncs(syncTransparency, syncCustomColor) {
            syncPanelTransparencyControls = syncTransparency;
            syncCustomPanelColorControls = syncCustomColor;
        },
    };
}
