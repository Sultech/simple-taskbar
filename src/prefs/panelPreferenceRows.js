// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addColorRow,
    addComboRow,
    addSwitchRow,
    addToggleChoiceRow,
    createSwitchRow,
} from './preferencesWidgets.js';
import {createDynamicTransparencyOptionsButton} from './dynamicTransparencyDialog.js';
import {addSliderRow} from './sliderRow.js';
import {PANEL_SCROLL_ACTION} from '../shared/interactionActions.js';

function blockedSubtitle(blocked, blockedText, text) {
    return blocked ? blockedText : text;
}

export function addThemeRows(group, settings, connectSettings, {
    keyPrefix,
    followSubtitle,
    themeTitle,
    onFollowChanged,
}) {
    const followSwitch = createSwitchRow(settings, {
        key: `${keyPrefix}panel-theme-follow-system`,
        title: _('Follow System Theme'),
        subtitle: followSubtitle,
    });
    group.add(followSwitch);
    const themeRow = addToggleChoiceRow(group, settings, {
        key: `${keyPrefix}panel-theme`,
        title: themeTitle,
        subtitle: _('Choose the colour scheme when system matching is off'),
        choices: [
            {value: 'light', label: _('Light')},
            {value: 'dark', label: _('Dark')},
        ],
    }, connectSettings);
    followSwitch.connect('notify::active', widget => {
        if (widget.active)
            settings.set_boolean(`${keyPrefix}custom-panel-color-enabled`, false);
        onFollowChanged();
    });
    return {followSwitch, themeRow};
}

export function addTransparencyRows(group, settings, connectSettings, {
    keyPrefix,
    switchSubtitle,
    optionsTitle,
    addAfterSwitch = () => {},
    onChanged,
}) {
    const levelSubtitle = _('0% is opaque and 100% is fully transparent');
    const dynamicSubtitle = _('Adjust transparency according to the selected window state');
    const switchRow = createSwitchRow(settings, {
        key: `${keyPrefix}transparency-enabled`,
        title: _('Enable Transparency'),
        subtitle: switchSubtitle,
    });
    group.add(switchRow);
    addAfterSwitch();
    const levelRow = addSliderRow(group, settings, {
        key: `${keyPrefix}transparency-level`,
        unit: '%',
        title: _('Transparency'),
        subtitle: levelSubtitle,
        lower: 0,
        upper: 100,
    }, connectSettings);
    const optionsButton = createDynamicTransparencyOptionsButton(settings, {
        title: optionsTitle,
        behaviorKey: `${keyPrefix}transparency-dynamic-behavior`,
        distanceKey: `${keyPrefix}transparency-dynamic-distance`,
        levelKey: `${keyPrefix}transparency-dynamic-level`,
        animationTimeKey: `${keyPrefix}transparency-dynamic-animation-time`,
    });
    const {row: dynamicRow, toggle: dynamicToggle} = addSwitchRow(group, settings, {
        key: `${keyPrefix}transparency-on-unmaximized`,
        title: _('Dynamic Transparency'),
        subtitle: dynamicSubtitle,
        addSuffix: row => row.add_suffix(optionsButton),
    });
    switchRow.connect('notify::active', onChanged);
    dynamicToggle.connect('notify::active', onChanged);
    return {
        sync(available, blocked, blockedText) {
            switchRow.sensitive = available && !blocked;
            switchRow.subtitle = blockedSubtitle(blocked, blockedText, switchSubtitle);
            levelRow.sensitive = available && !blocked && switchRow.active;
            levelRow.subtitle = blockedSubtitle(blocked, blockedText, levelSubtitle);
            dynamicRow.sensitive = available && !blocked;
            dynamicRow.subtitle = blockedSubtitle(blocked, blockedText, dynamicSubtitle);
            optionsButton.sensitive = available && !blocked && dynamicToggle.active;
        },
    };
}

export function addCustomColorRows(group, settings, connectSettings, {
    keyPrefix,
    switchTitle,
    colorTitle,
    gradientTitle,
    gradientSubtitle,
    gradientColorTitle,
    gradientDirectionTitle,
    textColorTitle,
    textColorSubtitle,
    onChanged,
}) {
    const enabledKey = `${keyPrefix}custom-panel-color-enabled`;
    const gradientKey = `${keyPrefix}custom-panel-gradient-enabled`;
    const followKey = `${keyPrefix}panel-theme-follow-system`;
    const switchSubtitle = _('Use a chosen color instead of the light or dark theme color');
    const colorSwitch = createSwitchRow(settings, {
        key: enabledKey,
        title: switchTitle,
        subtitle: switchSubtitle,
    });
    group.add(colorSwitch);
    const colorRow = addColorRow(group, settings, {
        key: `${keyPrefix}custom-panel-color`,
        title: colorTitle,
    }, connectSettings);
    const gradientSwitch = createSwitchRow(settings, {
        key: gradientKey,
        title: gradientTitle,
        subtitle: gradientSubtitle,
    });
    group.add(gradientSwitch);
    const gradientColorRow = addColorRow(group, settings, {
        key: `${keyPrefix}custom-panel-gradient-color`,
        title: gradientColorTitle,
    }, connectSettings);
    const gradientDirectionRow = addToggleChoiceRow(group, settings, {
        key: `${keyPrefix}custom-panel-gradient-direction`,
        title: gradientDirectionTitle,
        subtitle: _('Choose how the gradient flows'),
        choices: [
            {value: 'vertical', label: _('Vertical')},
            {value: 'horizontal', label: _('Horizontal')},
        ],
    }, connectSettings);
    const textColorRow = addToggleChoiceRow(group, settings, {
        key: `${keyPrefix}panel-theme`,
        title: textColorTitle,
        subtitle: textColorSubtitle,
        choices: [
            {value: 'dark', label: _('White')},
            {value: 'light', label: _('Black')},
        ],
    }, connectSettings);
    colorSwitch.connect('notify::active', widget => {
        if (widget.active && settings.get_boolean(followKey))
            settings.set_boolean(followKey, false);
        onChanged();
    });
    gradientSwitch.connect('notify::active', onChanged);
    return {
        sync(available, blocked, blockedText) {
            if (blocked && settings.get_boolean(enabledKey))
                settings.set_boolean(enabledKey, false);
            const enabled = settings.get_boolean(enabledKey);
            const gradientEnabled = enabled && settings.get_boolean(gradientKey);
            const usable = available && !blocked;
            colorSwitch.sensitive = usable;
            colorSwitch.subtitle = blockedSubtitle(blocked, blockedText, switchSubtitle);
            gradientSwitch.visible = enabled;
            gradientSwitch.sensitive = usable && enabled;
            gradientColorRow.visible = gradientEnabled;
            gradientColorRow.sensitive = usable && gradientEnabled;
            gradientDirectionRow.visible = gradientEnabled;
            gradientDirectionRow.sensitive = usable && gradientEnabled;
            colorRow.visible = enabled;
            colorRow.sensitive = usable && enabled;
            textColorRow.visible = enabled;
            textColorRow.sensitive = usable && enabled;
            textColorRow.subtitle = blockedSubtitle(blocked, blockedText, textColorSubtitle);
        },
    };
}

export function addBordersGroup(page, settings, {keyPrefix, subtitle}) {
    const group = page.addGroup({
        title: _('Borders'),
        description: _('Choose whether to show a border in light and dark themes'),
    });
    group.add(createSwitchRow(settings, {
        key: `${keyPrefix}panel-border-enabled`,
        title: _('Show Border in Dark Mode'),
        subtitle,
    }));
    group.add(createSwitchRow(settings, {
        key: `${keyPrefix}panel-border-light-enabled`,
        title: _('Show Border in Light Mode'),
        subtitle,
    }));
    return group;
}

export function addPanelScrollGroup(page, settings, connectSettings, {
    title,
    description,
    actionKey,
    actionSubtitle,
    delayKey,
    delaySubtitle,
    isAvailable = () => true,
}) {
    const group = page.addGroup({title, description});
    const actionRow = addComboRow(group, settings, {
        key: actionKey,
        title: _('Scroll Action'),
        subtitle: actionSubtitle,
        choices: getPanelScrollActionChoices(),
    }, connectSettings);
    const delayRow = addSliderRow(group, settings, {
        key: delayKey,
        unit: 'ms',
        title: _('Scroll Delay'),
        subtitle: delaySubtitle,
        lower: 5,
        upper: 250,
        step: 5,
    }, connectSettings);
    group.add(createSwitchRow(settings, {
        key: 'panel-scroll-ignore-natural',
        title: _('Ignore Natural Scrolling'),
        subtitle: _('Use traditional scrolling on the taskbar, the Dock, window previews and the volume icon'),
    }));
    const sync = () => {
        const available = isAvailable();
        actionRow.sensitive = available;
        delayRow.sensitive = available && settings.get_string(actionKey) !== PANEL_SCROLL_ACTION.DO_NOTHING;
    };
    connectSettings(settings, `changed::${actionKey}`, sync);
    sync();
    return {group, sync};
}

export function getPanelScrollActionChoices() {
    return [
        {
            value: PANEL_SCROLL_ACTION.SWITCH_WORKSPACE,
            label: _('Switch Workspace'),
        },
        {
            value: PANEL_SCROLL_ACTION.CYCLE_WINDOWS,
            label: _('Cycle Windows'),
        },
        {
            value: PANEL_SCROLL_ACTION.CHANGE_VOLUME,
            label: _('Change Volume'),
        },
        {
            value: PANEL_SCROLL_ACTION.DO_NOTHING,
            label: _('Do Nothing'),
        },
    ];
}
