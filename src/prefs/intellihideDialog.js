// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {AUTO_HIDE_REVEAL_MODE, pressureRevealAtBottom} from '../shared/autoHideSettings.js';
import {
    addComboRow,
    createSwitchRow,
    createPreferencesDialogButton,
    createPreferencesDialogContent,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

export function createIntellihideOptionsButton(
    settings,
    pointerRevealKey,
    autohideKey,
    keys,
    positionKey,
    edgeReveal,
    descriptions
) {
    return createPreferencesDialogButton(
        settings,
        _('Intellihide Options'),
        IntellihideOptionsDialog,
        {pointerRevealKey, autohideKey, keys, positionKey, edgeReveal, descriptions}
    );
}

export const IntellihideOptionsDialog = GObject.registerClass(
class IntellihideOptionsDialog extends Adw.Window {
    _init({settings, parent, pointerRevealKey, autohideKey, keys, positionKey, edgeReveal, descriptions}) {
        super._init({
            title: _('Intellihide Options'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 740,
        });

        this._settings = settings;
        this._pointerRevealKey = pointerRevealKey;
        this._edgeRevealKey = edgeReveal.key;
        this._keys = keys;
        const {content, connectSettings} =
            createPreferencesDialogContent(this);

        const revealGroup = new Adw.PreferencesGroup({
            title: _('Reveal'),
            description: descriptions.reveal,
        });
        content.append(revealGroup);

        const overviewRow = createSwitchRow(settings, {
            key: keys.revealOverview,
            title: _('Reveal in Overview'),
            subtitle: _('Show the auto-hidden taskbar or Dock while the Overview is open'),
        });
        revealGroup.add(overviewRow);

        revealGroup.add(createSwitchRow(settings, {
            key: pointerRevealKey,
            title: _('Reveal on Pointer'),
            subtitle: descriptions.pointerReveal,
        }));

        const edgeRevealRow = createSwitchRow(settings, {
            key: edgeReveal.key,
            title: edgeReveal.title,
            subtitle: edgeReveal.subtitle,
        });
        revealGroup.add(edgeRevealRow);

        const fullscreenRow = createSwitchRow(settings, {
            key: keys.revealFullscreen,
            title: _('Reveal Over Fullscreen Apps'),
            subtitle: _('Allow the pointer to reveal the taskbar or Dock over fullscreen applications'),
        });
        revealGroup.add(fullscreenRow);

        const modeRow = addComboRow(
            revealGroup,
            settings,
            {
                key: keys.revealMode,
                title: _('Reveal Mode'),
                subtitle: descriptions.revealMode,
                choices: [
                    {
                        value: AUTO_HIDE_REVEAL_MODE.INSTANT,
                        label: _('Instant'),
                    },
                    {
                        value: AUTO_HIDE_REVEAL_MODE.DELAY,
                        label: _('After a Delay'),
                    },
                    {
                        value: AUTO_HIDE_REVEAL_MODE.PRESSURE,
                        label: _('After Pushing Against the Edge'),
                    },
                ],
            },
            connectSettings
        );
        const delayRow = addSliderRow(
            revealGroup,
            settings,
            {
                key: keys.revealDelay,
                unit: 'ms',
                title: _('Reveal Delay'),
                subtitle: _('How long the pointer rests on the edge, in milliseconds'),
                lower: 50,
                upper: 2000,
                step: 50,
            },
            connectSettings
        );

        const pressureRow = addSliderRow(
            revealGroup,
            settings,
            {
                key: keys.pressureThreshold,
                unit: 'px',
                title: _('Activation Pressure'),
                subtitle: _('How far to push past the edge before revealing. Turns off the bottom hot edge when placed at the bottom.'),
                lower: 0,
                upper: 500,
                step: 10,
            },
            connectSettings
        );

        const hideGroup = new Adw.PreferencesGroup({
            title: _('Hide'),
            description: descriptions.hide,
        });
        content.append(hideGroup);

        addSliderRow(
            hideGroup,
            settings,
            {
                key: keys.hideDelay,
                unit: 'ms',
                title: _('Hide Delay'),
                subtitle: descriptions.hideDelay,
                lower: 0,
                upper: 2000,
                step: 50,
            },
            connectSettings
        );

        const disableHotEdgeWithPressure = () => {
            if (pressureRevealAtBottom(settings, keys.revealMode, positionKey))
                settings.set_boolean('hot-edge-overview-enabled', false);
        };
        connectSettings(
            settings,
            `changed::${keys.revealMode}`,
            disableHotEdgeWithPressure
        );
        disableHotEdgeWithPressure();

        const syncSensitivity = () => {
            const revealable = settings.get_boolean(pointerRevealKey);
            modeRow.sensitive = revealable;
            fullscreenRow.sensitive = revealable;
            edgeRevealRow.sensitive = revealable && edgeReveal.isAvailable();
            overviewRow.sensitive = settings.get_boolean(autohideKey);
            const mode = settings.get_string(keys.revealMode);
            delayRow.sensitive = revealable &&
                mode === AUTO_HIDE_REVEAL_MODE.DELAY;
            pressureRow.sensitive = revealable &&
                mode === AUTO_HIDE_REVEAL_MODE.PRESSURE;
        };
        connectSettings(
            settings,
            `changed::${keys.revealMode}`,
            syncSensitivity
        );
        connectSettings(
            settings,
            `changed::${pointerRevealKey}`,
            syncSensitivity
        );
        for (const key of [autohideKey, ...edgeReveal.changedKeys])
            connectSettings(settings, `changed::${key}`, syncSensitivity);
        syncSensitivity();
    }

    _reset() {
        for (const key of [...Object.values(this._keys), this._pointerRevealKey, this._edgeRevealKey])
            this._settings.reset(key);
    }
}
);
