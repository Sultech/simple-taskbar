// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {QuickSettingsPowerController} from './quickSettingsPowerController.js';
import {QuickSettingsXpIconController} from './quickSettingsXpIconController.js';
import {VolumeMixerController} from './volumeMixerController.js';

export class QuickSettingsIntegrations {
    constructor(settings, extensionDir, quickSettings) {
        this._controllers = [
            new VolumeMixerController(settings, quickSettings),
            new QuickSettingsPowerController(settings, quickSettings),
            new QuickSettingsXpIconController(settings, extensionDir, quickSettings),
        ];
    }

    enable() {
        for (const controller of this._controllers)
            controller.enable();
    }

    destroy() {
        for (const controller of this._controllers.reverse())
            controller.destroy();
        this._controllers = null;
    }
}
