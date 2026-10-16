// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    createApplicationClickActionOptionsButton,
    getApplicationClickActionChoices,
} from './applicationClickActionDialog.js';
import {
    createApplicationHoverAnimationOptionsButton,
} from './applicationHoverAnimationDialog.js';
import {
    createWindowPreviewOptionsButton,
} from './windowPreviewDialog.js';
import {
    APP_ICON_HOVER_ANIMATION,
    APP_ICON_MAGNIFY_SETTING_KEYS,
    appIconMagnifyAllowed,
} from '../shared/applicationHoverAnimation.js';
import {
    APPLICATION_CLICK_ANIMATION,
} from '../shared/applicationClickAnimation.js';
import {
    WINDOW_MINIMIZE_EFFECT,
} from '../shared/windowMinimizeEffect.js';
import {HOVER_ACTION} from '../shared/applicationHoverActions.js';
import {SCROLL_ACTION} from '../shared/applicationScrollActions.js';
import {
    addComboRow,
    addToggleChoiceRow,
    setButtonIcon,
} from './preferencesWidgets.js';
import {addSliderRow} from './sliderRow.js';

function getApplicationClickAnimationChoices() {
    return [
        {
            value: APPLICATION_CLICK_ANIMATION.NONE,
            label: _('None'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.GNOME_ZOOM_OUT,
            label: _('GNOME Launch Zoom'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.BOUNCE,
            label: _('Bounce'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.JUMP,
            label: _('Jump'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.HEARTBEAT,
            label: _('Heartbeat'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.SQUISH,
            label: _('Squish'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.JELLY,
            label: _('Jelly'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.SPIN,
            label: _('Spin'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.SPIN_3D,
            label: _('3D Spin'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.FLIP,
            label: _('Horizontal Flip'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.ROLL,
            label: _('Roll'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.ZOOM_FADE,
            label: _('Zoom Out & Fade'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.SQUEEZE,
            label: _('Squeeze'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.GLOW,
            label: _('Glow'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.DIM,
            label: _('Dim'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.TADA,
            label: _('Tada'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.SWING,
            label: _('Swing'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.SHAKE,
            label: _('Shake'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.MOVE_UP,
            label: _('Nudge Up'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.MOVE_DOWN,
            label: _('Nudge Down'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.MOVE_LEFT,
            label: _('Nudge Left'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.MOVE_RIGHT,
            label: _('Nudge Right'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.ENLARGE,
            label: _('Pulse Larger'),
        },
        {
            value: APPLICATION_CLICK_ANIMATION.SHRINK,
            label: _('Pulse Smaller'),
        },
    ];
}

export function addApplicationInteractionGroup({
    page,
    groups,
    settings,
    connectSettings,
}) {
    const clickGroup = page.addGroup({
        title: _('Clicking'),
        description: _('Choose what happens when an application icon is clicked'),
    });
    const scrollGroup = page.addGroup({
        title: _('Scrolling'),
        description: _('Choose what happens when scrolling over an application icon'),
    });
    const hoverGroup = page.addGroup({
        title: _('Hovering and Animations'),
        description: _('Choose what happens when the pointer rests on an application icon'),
    });
    groups.push(clickGroup, scrollGroup, hoverGroup);
    const clickActionOptionsButton =
        createApplicationClickActionOptionsButton(settings);
    const previewOptionsButton = createWindowPreviewOptionsButton(settings);
    const clickActionRow = addComboRow(
        clickGroup,
        settings,
        {
            key: 'application-click-action',
            title: _('Click Action'),
            subtitle: _('Choose what happens when a running application is clicked'),
            choices: getApplicationClickActionChoices(),
            addSuffix: row => {
                if (!settings.isDefaultPanelWindows)
                    row.add_suffix(clickActionOptionsButton);
            },
        },
        connectSettings
    );
    const syncClickActionVisibility = () => {
        clickActionRow.visible = !settings.isDefaultPanelWindows ||
            settings.get_string('combine-app-buttons-mode') === 'when-full';
    };
    if (settings.isDefaultPanelWindows) {
        clickActionRow.title = _('Grouped Application Click Action');
        connectSettings(settings, 'changed::combine-app-buttons-mode', syncClickActionVisibility);
    }
    syncClickActionVisibility();
    if (settings.isDefaultPanelWindows) {
        const clickOptionsRow = new Adw.ActionRow({
            title: _('Window Click Actions'),
            subtitle: _('Configure modifier-click and middle-click actions'),
            activatable_widget: clickActionOptionsButton,
        });
        clickOptionsRow.add_suffix(clickActionOptionsButton);
        clickGroup.add(clickOptionsRow);
    }
    addComboRow(
        clickGroup,
        settings,
        {
            key: 'application-click-animation',
            title: _('Click Animation'),
            subtitle: _('Choose the animation shown when an application is clicked'),
            choices: getApplicationClickAnimationChoices(),
        },
        connectSettings
    );
    const scrollActionChoices = [
        {
            value: SCROLL_ACTION.SWITCH_WORKSPACE,
            label: _('Switch Workspace'),
        },
        {
            value: SCROLL_ACTION.CYCLE_WINDOWS,
            label: _('Cycle Windows'),
        },
        {
            value: SCROLL_ACTION.DO_NOTHING,
            label: _('Do Nothing'),
        },
    ];
    const scrollActionModel = new Gtk.StringList();
    for (const choice of scrollActionChoices)
        scrollActionModel.append(choice.label);
    const scrollActionDropDown = new Gtk.DropDown({
        model: scrollActionModel,
        valign: Gtk.Align.CENTER,
    });
    const scrollActionRow = new Adw.ActionRow({
        title: _('Scroll App/Icon Action'),
        subtitle: _('Choose what happens when scrolling over an application icon'),
    });
    const syncScrollAction = () => {
        const index = scrollActionChoices.findIndex(
            choice => choice.value === settings.get_string('scroll-icon-action')
        );
        if (index >= 0 && scrollActionDropDown.selected !== index)
            scrollActionDropDown.selected = index;
    };
    scrollActionDropDown.connect('notify::selected', widget => {
        const choice = scrollActionChoices[widget.selected];
        if (choice)
            settings.set_string('scroll-icon-action', choice.value);
    });
    connectSettings(settings, 'changed::scroll-icon-action', syncScrollAction);
    syncScrollAction();
    const scrollDelayRow = addSliderRow(null, settings, {
        key: 'scroll-icon-delay',
        title: _('Scroll Delay'),
        subtitle: _('Minimum delay between app icon scrolls in milliseconds'),
        lower: 5,
        upper: 250,
        step: 5,
        unit: 'ms',
        addRow: () => {},
    }, connectSettings);

    const scrollDelayBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
    });
    const followScrollDelayCheck = new Gtk.CheckButton({
        label: _('Follow Taskbar Scroll Delay'),
    });
    settings.bind(
        'scroll-icon-follow-panel-delay',
        followScrollDelayCheck,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    scrollDelayBox.append(followScrollDelayCheck);
    scrollDelayBox.append(scrollDelayRow);
    const scrollDelayPopover = new Gtk.Popover({
        child: scrollDelayBox,
        has_arrow: false,
    });
    const scrollDelayButton = new Gtk.MenuButton({
        always_show_arrow: false,
        popover: scrollDelayPopover,
        tooltip_text: _('Configure Scroll Delay'),
        valign: Gtk.Align.CENTER,
        css_classes: ['flat', 'circular'],
    });
    setButtonIcon(scrollDelayButton, 'emblem-system-symbolic');
    const syncScrollActionButtonSensitivity = () => {
        scrollDelayButton.sensitive = settings.get_string(
            'scroll-icon-action'
        ) !== SCROLL_ACTION.DO_NOTHING;
    };
    connectSettings(
        settings,
        'changed::scroll-icon-action',
        syncScrollActionButtonSensitivity
    );
    syncScrollActionButtonSensitivity();
    const scrollActionBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 6,
        valign: Gtk.Align.CENTER,
    });
    scrollActionBox.append(scrollDelayButton);
    scrollActionBox.append(scrollActionDropDown);
    scrollActionRow.add_suffix(scrollActionBox);
    scrollActionRow.activatable_widget = scrollActionDropDown;
    scrollGroup.add(scrollActionRow);
    const syncFollowScrollDelayLabel = () => {
        followScrollDelayCheck.label = !settings.isDefaultPanelWindows && settings.get_boolean('dock-mode')
            ? _('Follow Dock Scroll Delay')
            : _('Follow Taskbar Scroll Delay');
    };
    connectSettings(settings, 'changed::dock-mode', syncFollowScrollDelayLabel);
    syncFollowScrollDelayLabel();
    const syncScrollDelayRow = () => {
        scrollDelayRow.sensitive = !followScrollDelayCheck.active;
    };
    followScrollDelayCheck.connect('notify::active', syncScrollDelayRow);
    syncScrollDelayRow();
    addComboRow(
        hoverGroup,
        settings,
        {
            key: 'application-hover-action',
            title: _('Application Hover Action'),
            subtitle: _(
                'Choose what happens when hovering over an application icon'
            ),
            choices: [
                {
                    value: HOVER_ACTION.SHOW_PREVIEWS,
                    label: _('Show Previews'),
                },
                {
                    value: HOVER_ACTION.SHOW_TOOLTIP,
                    label: _('Show Tooltip'),
                },
                {
                    value: HOVER_ACTION.DO_NOTHING,
                    label: _('Do Nothing'),
                },
            ],
            addSuffix: row => row.add_suffix(previewOptionsButton),
        },
        connectSettings
    );
    const syncPreviewOptionsButtonSensitivity = () => {
        previewOptionsButton.sensitive = settings.get_string(
            'application-hover-action'
        ) === HOVER_ACTION.SHOW_PREVIEWS;
    };
    connectSettings(
        settings,
        'changed::application-hover-action',
        syncPreviewOptionsButtonSensitivity
    );
    syncPreviewOptionsButtonSensitivity();
    const animationOptionsButton =
        createApplicationHoverAnimationOptionsButton(settings);
    const hoverAnimationChoices = [
        {
            value: APP_ICON_HOVER_ANIMATION.NONE,
            label: _('None'),
        },
        {
            value: APP_ICON_HOVER_ANIMATION.SIMPLE,
            label: _('Simple'),
        },
        {
            value: APP_ICON_HOVER_ANIMATION.RIPPLE,
            label: _('Ripple'),
        },
        {
            value: APP_ICON_HOVER_ANIMATION.MAGNIFY,
            label: _('Magnify'),
        },
    ];
    const hoverAnimationTypeRow = addComboRow(
        hoverGroup,
        settings,
        {
            key: 'animate-appicon-hover-animation-type',
            title: _('Hover Animation Type'),
            subtitle: _(
                'Choose the animation style for application icon hover'
            ),
            choices: hoverAnimationChoices,
            choicesProvider: () => appIconMagnifyAllowed(settings)
                ? hoverAnimationChoices
                : hoverAnimationChoices.filter(
                    choice => choice.value !==
                        APP_ICON_HOVER_ANIMATION.MAGNIFY
                ),
            choicesChangedKeys: APP_ICON_MAGNIFY_SETTING_KEYS,
            addSuffix: row => row.add_suffix(animationOptionsButton),
        },
        connectSettings
    );
    if (!settings.isDefaultPanelWindows) {
        const effectsGroup = page.addGroup({
            title: _('Window Effects'),
            description: _('Choose the animation used when windows are minimized or restored'),
        });
        groups.push(effectsGroup);
        addToggleChoiceRow(
            effectsGroup,
            settings,
            {
                key: 'window-minimize-effect',
                title: _('Window Minimize Effect'),
                subtitle: _(
                    'Choose the effect shown when a window is minimized or restored'
                ),
                choices: [
                    {
                        value: WINDOW_MINIMIZE_EFFECT.GNOME_DEFAULT,
                        label: _('GNOME Default'),
                    },
                    {
                        value: WINDOW_MINIMIZE_EFFECT.MAGIC_LAMP,
                        label: _('Magic Lamp'),
                    },
                ],
            },
            connectSettings
        );
    }
    const syncAnimationOptionsSensitivity = () => {
        const enabled = !settings.get_boolean('windows-xp-theme-enabled');
        hoverAnimationTypeRow.sensitive = enabled;
        const type = settings.get_string(
            'animate-appicon-hover-animation-type'
        );
        animationOptionsButton.sensitive = enabled &&
            type !== APP_ICON_HOVER_ANIMATION.NONE &&
            (type !== APP_ICON_HOVER_ANIMATION.MAGNIFY ||
                appIconMagnifyAllowed(settings));
    };
    connectSettings(
        settings,
        'changed::animate-appicon-hover-animation-type',
        syncAnimationOptionsSensitivity
    );
    connectSettings(
        settings,
        'changed::windows-xp-theme-enabled',
        syncAnimationOptionsSensitivity
    );
    for (const key of APP_ICON_MAGNIFY_SETTING_KEYS) {
        connectSettings(
            settings,
            `changed::${key}`,
            syncAnimationOptionsSensitivity
        );
    }
    syncAnimationOptionsSensitivity();
}
