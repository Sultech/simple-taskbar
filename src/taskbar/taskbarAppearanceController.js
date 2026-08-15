// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {getIconDominantColor} from '../themeUtils.js';

const INDICATOR_ANIMATION_DURATION = 150;
const INDICATOR_SEGMENT_GAP = 2;
const APP_LABEL_SPACING = 8;
const APP_CONTENT_VERTICAL_RESERVE = 14;
const WINDOWS_XP_BUTTON_Y = 3;
const WINDOWS_XP_BUTTON_BORDER_WIDTH = 2;
const WINDOWS_XP_TASKBUTTON_WIDTH = 160;
const WINDOWS_XP_TASKBUTTON_HORIZONTAL_PADDING = 8;
const WINDOWS_XP_TASKBUTTON_ICON_SPACING = 4;
const WINDOWS_XP_PINNED_TO_RUNNING_GAP = 6;

export class TaskbarAppearanceController {
    constructor({
        settings,
        taskbarActor,
        getAppItems,
        getAppLabelWidth,
        getIconSize,
        getPanelHeight,
        showAppLabels,
    }) {
        this._settings = settings;
        this._taskbarActor = taskbarActor;
        this._getAppItems = getAppItems;
        this._getAppLabelWidth = getAppLabelWidth;
        this._getIconSize = getIconSize;
        this._getPanelHeight = getPanelHeight;
        this._showAppLabels = showAppLabels;
    }

    updateGlassGeometry(item) {
        const glassWidth = this.buttonWidth(
            item._taskbarWindow,
            this._showAppLabels(),
            this._getAppLabelWidth(),
            item._taskbarIsCombinedApp
        );
        const slotWidth = this.itemSlotWidth(
            item._taskbarWindow,
            item._taskbarIsLauncher,
            item._taskbarPinnedToRunningGap,
            item._taskbarIsCombinedApp,
            item._taskbarTrailingSpacing
        );
        const panelHeight = this._getPanelHeight();
        const glassHeight = this.glassHeight();

        this.syncLauncherIconPosition(item);
        item._taskbarButton.set_width(glassWidth);
        item._taskbarSlot.set_size(slotWidth, panelHeight);
        item._taskbarVisual.set_size(glassWidth, panelHeight);
        item._taskbarGlassHost.set_size(glassWidth, panelHeight);
        const glassInset = this.glassInset();
        const glassY = this.glassY();
        const glassContentWidth = glassWidth - glassInset * 2;
        const glassContentHeight = glassHeight - glassInset * 2;
        item._taskbarGlass.set_position(glassInset, glassY + glassInset);
        item._taskbarGlass.set_size(glassContentWidth, glassContentHeight);
        item._taskbarGlassTexture.set_position(
            glassInset,
            glassY + glassInset
        );
        item._taskbarGlassTexture.set_size(
            glassContentWidth,
            glassContentHeight
        );
        item._taskbarGlassTexture.set_style(
            `background-size: ${glassContentWidth}px ${glassContentHeight}px;`
        );
        item._taskbarGlassBorder.set_position(0, glassY);
        item._taskbarGlassBorder.set_size(glassWidth, glassHeight);
        item._taskbarLabel.set_width(
            this.labelWidthForButton(
                item._taskbarWindow,
                item._taskbarIsCombinedApp
            )
        );
        this.updateIndicatorGeometry(item, false, glassWidth);
    }

    glassHeight() {
        const panelHeight = this._getPanelHeight();
        if (this._settings.get_boolean('windows-xp-theme-enabled'))
            return panelHeight - 5;

        const roundedIndicators = this._settings.get_string(
            'running-indicator-style'
        ) === 'rounded';
        return Math.max(1, panelHeight - (roundedIndicators ? 7 : 8));
    }

    glassY() {
        return this._settings.get_boolean('windows-xp-theme-enabled')
            ? WINDOWS_XP_BUTTON_Y
            : 4;
    }

    glassInset() {
        return this._settings.get_boolean('windows-xp-theme-enabled')
            ? WINDOWS_XP_BUTTON_BORDER_WIDTH
            : 0;
    }

    updateIndicatorGeometry(
        item,
        animate = false,
        glassWidth = this.buttonWidth(
            item._taskbarWindow,
            this._showAppLabels(),
            this._getAppLabelWidth(),
            item._taskbarIsCombinedApp
        )
    ) {
        const evenWidth = glassWidth % 2 === 0;
        const containerWidth = evenWidth ? 20 : 21;
        let barWidth = evenWidth ? 8 : 7;

        if (item._taskbarFocused)
            barWidth = containerWidth;
        else if (item._taskbarMultipleWindows)
            barWidth = evenWidth ? 18 : 17;

        const show = item._taskbarShowSecondary;
        const secondaryWidth = Math.max(1, Math.floor(
            (containerWidth - INDICATOR_SEGMENT_GAP) / 2
        ));
        const primaryWidth = show
            ? barWidth - INDICATOR_SEGMENT_GAP - secondaryWidth
            : barWidth;
        const primaryX = (containerWidth - barWidth) / 2;
        const secondaryX = show
            ? primaryX + primaryWidth + INDICATOR_SEGMENT_GAP
            : primaryX + primaryWidth;

        if (item._taskbarIndicatorWidth === containerWidth &&
            item._taskbarIndicatorPrimaryWidth === primaryWidth &&
            item._taskbarIndicatorPrimaryX === primaryX &&
            item._taskbarIndicatorSecondaryX === secondaryX &&
            item._taskbarIndicatorSecondaryShown === show) {
            return;
        }

        item._taskbarIndicatorWidth = containerWidth;
        item._taskbarIndicatorPrimaryWidth = primaryWidth;
        item._taskbarIndicatorPrimaryX = primaryX;
        item._taskbarIndicatorSecondaryX = secondaryX;
        item._taskbarIndicatorSecondaryShown = show;

        const indicator = item._taskbarIndicator;
        const primary = item._taskbarIndicatorPrimary;
        const secondary = item._taskbarIndicatorSecondary;
        indicator.set_width(containerWidth);
        secondary.set_width(secondaryWidth);

        if (!animate) {
            primary.remove_transition('width');
            primary.remove_transition('x');
            secondary.remove_transition('x');
            secondary.remove_transition('opacity');
            primary.set_width(primaryWidth);
            primary.set_x(primaryX);
            secondary.set_x(secondaryX);
            secondary.opacity = 255;
            secondary.visible = show;
            return;
        }

        primary.ease({
            width: primaryWidth,
            x: primaryX,
            duration: INDICATOR_ANIMATION_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        if (show) {
            if (!secondary.visible) {
                secondary.set_x(primaryX + barWidth);
                secondary.opacity = 0;
                secondary.visible = true;
            }
            secondary.ease({
                x: secondaryX,
                opacity: 255,
                duration: INDICATOR_ANIMATION_DURATION,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            return;
        }

        secondary.ease({
            x: secondaryX,
            opacity: 0,
            duration: INDICATOR_ANIMATION_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                secondary.visible = false;
                secondary.opacity = 255;
            },
        });
    }

    syncIndicatorColor(item) {
        let style = null;
        if (item._taskbarRunning) {
            if (item._taskbarFocused &&
                this._settings.get_boolean('match-icon-color')) {
                const dominantColor = getIconDominantColor(item._taskbarApp);
                if (dominantColor) {
                    style = `background-color: ${dominantColor};`;
                } else if (this._settings.get_boolean(
                    'custom-indicator-colors-enabled'
                )) {
                    style = `background-color: ${this._settings.get_string(
                        'focused-indicator-color'
                    )};`;
                }
            } else if (this._settings.get_boolean(
                'custom-indicator-colors-enabled'
            )) {
                const key = item._taskbarFocused
                    ? 'focused-indicator-color'
                    : 'unfocused-indicator-color';
                style = `background-color: ${this._settings.get_string(key)};`;
            }
        }

        for (const segment of item._taskbarIndicator.get_children())
            segment.set_style(style);
    }

    syncIndicatorVisibility(item) {
        item._taskbarIndicator.opacity = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        ) ? 0 : 255;
    }

    buttonWidth(
        window,
        showLabels = this._showAppLabels(),
        labelWidth = this._getAppLabelWidth(),
        isCombined = false
    ) {
        const hasLabel = Boolean(window) || isCombined;
        if (this._settings.get_boolean('windows-xp-theme-enabled') &&
            hasLabel && showLabels) {
            return WINDOWS_XP_TASKBUTTON_WIDTH;
        }

        const iconSize = this._getIconSize();
        const minimumIconWidth = iconSize % 2 === 0 ? 22 : 21;
        const iconWidth = Math.max(iconSize, minimumIconWidth) + 8;
        return hasLabel && showLabels
            ? iconWidth + APP_LABEL_SPACING + labelWidth
            : iconWidth;
    }

    labelWidthForButton(window, isCombined = false) {
        if (this._settings.get_boolean('windows-xp-theme-enabled') &&
            (window || isCombined)) {
            return WINDOWS_XP_TASKBUTTON_WIDTH - this._getIconSize() -
                WINDOWS_XP_TASKBUTTON_ICON_SPACING -
                WINDOWS_XP_TASKBUTTON_HORIZONTAL_PADDING * 2;
        }
        return this._getAppLabelWidth();
    }

    buttonContentHeight() {
        return Math.max(
            1,
            this._getPanelHeight() - APP_CONTENT_VERTICAL_RESERVE
        );
    }

    syncLauncherIconPosition(item) {
        if (!item._taskbarIsLauncher)
            return;
        item._taskbarIcon.translation_x =
            this._settings.get_boolean('windows-xp-theme-enabled') ? -1 : 0;
    }

    iconSpacing(isLauncher) {
        const spacing = this._settings.get_int('icon-spacing');
        if (this._settings.get_boolean('windows-xp-theme-enabled') &&
            isLauncher) {
            return spacing;
        }
        return Math.max(spacing, 0);
    }

    transitionGap(pinnedToRunningGap) {
        return this._settings.get_boolean('windows-xp-theme-enabled') &&
            pinnedToRunningGap
            ? WINDOWS_XP_PINNED_TO_RUNNING_GAP
            : 0;
    }

    itemSlotWidth(
        window,
        isLauncher = false,
        pinnedToRunningGap = false,
        isCombined = false,
        trailing = false
    ) {
        const transitionGap = this.transitionGap(pinnedToRunningGap);
        const iconSpacing = this.iconSpacing(isLauncher);
        return this.buttonWidth(
            window,
            this._showAppLabels(),
            this._getAppLabelWidth(),
            isCombined
        ) + iconSpacing + transitionGap +
            (trailing && iconSpacing < 0 ? -iconSpacing : 0);
    }

    applyCurrentButtonWidths() {
        for (const item of this._getAppItems())
            this.updateGlassGeometry(item);
        this._taskbarActor.queue_relayout();
    }

    syncItemLabel(item) {
        const window = item._taskbarWindow;
        const windowTitle = window ? window.get_title() : null;
        const text = windowTitle || item._taskbarApp.get_name();
        item._taskbarLabel.text = text;
        item._taskbarLabel.visible =
            (Boolean(window) || item._taskbarIsCombinedApp) &&
            this._showAppLabels();
        if (window)
            item._taskbarButton.accessible_name = `${text}, ${_('running')}`;
    }

    destroy() {
        this._showAppLabels = null;
        this._getPanelHeight = null;
        this._getIconSize = null;
        this._getAppLabelWidth = null;
        this._getAppItems = null;
        this._taskbarActor = null;
        this._settings = null;
    }
}
