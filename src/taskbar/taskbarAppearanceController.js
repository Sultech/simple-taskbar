// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {IconDominantColorCache} from './iconDominantColor.js';
import {panelIsVertical} from '../panel/panelPosition.js';
import {
    RUNNING_INDICATOR_LENGTH_RATIO,
    RUNNING_INDICATOR_RESERVE,
    runningIndicatorFillsLength,
    runningIndicatorPositionIsHorizontal,
} from '../shared/runningIndicatorSettings.js';
import {
    GLASS_VERTICAL_INSET,
    taskbarGlassHeight,
    taskbarVisualPanelHeight,
} from '../shared/panelSizing.js';

const CONTENT_LEADING_SPACE = 7;
const ICON_GLASS_MARGIN = 3;
const APP_LABEL_SPACING = 8;
const APP_CONTENT_VERTICAL_RESERVE = 14;
const WINDOWS_XP_BUTTON_Y = 3;
const WINDOWS_XP_BUTTON_BORDER_WIDTH = 2;
const WINDOWS_XP_TASKBUTTON_WIDTH = 160;
const WINDOWS_XP_TASKBUTTON_HORIZONTAL_PADDING = 8;
const WINDOWS_XP_TASKBUTTON_ICON_SPACING = 4;
const WINDOWS_XP_PINNED_TO_RUNNING_GAP = 6;

function settingsScale(value) {
    return value * St.ThemeContext.get_for_stage(global.stage).scale_factor;
}

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
        this._iconColors = new IconDominantColorCache();
    }

    visualPanelHeight() {
        return taskbarVisualPanelHeight(
            this._getPanelHeight(),
            this._getIconSize(),
            this._settings.isDock &&
                !this._settings.get_boolean('dock-panel-mode')
        );
    }

    updateGlassGeometry(item) {
        const glassWidth = this.buttonWidth(
            item._taskbarWindow,
            this._showAppLabels(),
            this._getAppLabelWidth(),
            item._taskbarIsCombinedApp,
            this._getIconSize(),
            item._taskbarLabel
        );
        const slotWidth = this.itemSlotWidth(
            item._taskbarWindow,
            item._taskbarIsLauncher,
            item._taskbarPinnedToRunningGap,
            item._taskbarIsCombinedApp,
            item._taskbarTrailingSpacing,
            this._getIconSize(),
            item._taskbarLabel
        );
        const panelHeight = this._getPanelHeight();
        const visualPanelHeight = this.visualPanelHeight();
        const glassHeight = this.glassHeight(visualPanelHeight);
        const vertical = panelIsVertical(this._settings);
        const slotHeight = vertical ? slotWidth : visualPanelHeight;
        const itemWidth = vertical ? visualPanelHeight : glassWidth;
        const itemHeight = vertical
            ? this.verticalItemExtent()
            : visualPanelHeight;

        this.syncLauncherIconPosition(item);
        item.setVertical(vertical);
        item._taskbarTopSpacer.set_height(
            vertical ? 0 : CONTENT_LEADING_SPACE
        );
        item._taskbarBottomSpacer.set_height(
            vertical ? RUNNING_INDICATOR_RESERVE : CONTENT_LEADING_SPACE
        );
        item._taskbarButtonContent.set_height(
            vertical ? -1 : this.buttonContentHeight(visualPanelHeight)
        );
        item._taskbarVisual.y_align = vertical
            ? Clutter.ActorAlign.CENTER
            : Clutter.ActorAlign.FILL;
        item._taskbarVisual.y_expand = !vertical;
        item.set_size(
            vertical ? panelHeight : -1,
            vertical ? -1 : slotHeight
        );
        item._taskbarButton.set_size(itemWidth, itemHeight);
        item._taskbarSlot.set_size(
            vertical ? visualPanelHeight : slotWidth,
            slotHeight
        );
        item._taskbarVisual.set_size(itemWidth, itemHeight);
        item._taskbarGlassHost.set_size(itemWidth, itemHeight);
        item._taskbarIndicatorHost.set_size(itemWidth, itemHeight);
        const glassInset = this.glassInset();
        const glassOuterHeight = vertical ? itemHeight : glassHeight;
        const glassX = vertical
            ? Math.floor((itemWidth - glassWidth) / 2)
            : 0;
        const glassY = vertical ? 0 : this.glassY();
        const glassContentWidth = glassWidth - glassInset * 2;
        const glassContentHeight = glassOuterHeight - glassInset * 2;
        item._taskbarGlass.set_position(
            glassX + glassInset,
            glassY + glassInset
        );
        item._taskbarGlass.set_size(glassContentWidth, glassContentHeight);
        item._taskbarGlassTexture.set_position(
            glassX + glassInset,
            glassY + glassInset
        );
        item._taskbarGlassTexture.set_size(
            glassContentWidth,
            glassContentHeight
        );
        item._taskbarGlassTexture.set_style(
            `background-size: ${glassContentWidth}px ${glassContentHeight}px;`
        );
        item._taskbarGlassBorder.set_position(glassX, glassY);
        item._taskbarGlassBorder.set_size(glassWidth, glassOuterHeight);
        item._taskbarLabel.set_width(
            this.labelWidthForButton(
                item._taskbarWindow,
                item._taskbarIsCombinedApp,
                item._taskbarLabel
            )
        );
        this.updateIndicatorGeometry(item, false, {
            x: glassX,
            y: glassY,
            width: glassWidth,
            height: glassOuterHeight,
        });
    }

    indicatorThickness() {
        return this._settings.get_int('running-indicator-size');
    }

    indicatorPosition() {
        return this._settings.get_string('running-indicator-position');
    }

    indicatorStyle() {
        return this._settings.get_string('running-indicator-style');
    }

    labelMaxWidth() {
        return settingsScale(
            this._settings.get_int('group-apps-label-max-width')
        );
    }

    verticalItemExtent(iconSize = this._getIconSize()) {
        return iconSize + ICON_GLASS_MARGIN * 2 + RUNNING_INDICATOR_RESERVE;
    }

    glassHeight(panelHeight = this.visualPanelHeight()) {
        return taskbarGlassHeight(
            panelHeight,
            this._settings.get_boolean('windows-xp-theme-enabled')
        );
    }

    glassY() {
        return this._settings.get_boolean('windows-xp-theme-enabled')
            ? WINDOWS_XP_BUTTON_Y
            : GLASS_VERTICAL_INSET;
    }

    glassInset() {
        return this._settings.get_boolean('windows-xp-theme-enabled')
            ? WINDOWS_XP_BUTTON_BORDER_WIDTH
            : 0;
    }

    glassRect(item) {
        const glassWidth = this.buttonWidth(
            item._taskbarWindow,
            this._showAppLabels(),
            this._getAppLabelWidth(),
            item._taskbarIsCombinedApp,
            this._getIconSize(),
            item._taskbarLabel
        );
        const vertical = panelIsVertical(this._settings);
        const visualPanelHeight = this.visualPanelHeight();
        const itemWidth = vertical ? visualPanelHeight : glassWidth;
        return {
            x: vertical ? Math.floor((itemWidth - glassWidth) / 2) : 0,
            y: vertical ? 0 : this.glassY(),
            width: glassWidth,
            height: vertical
                ? this.verticalItemExtent()
                : this.glassHeight(visualPanelHeight),
        };
    }

    updateIndicatorGeometry(item, animate = false, rect = null) {
        const glass = rect ?? this.glassRect(item);
        const position = this.indicatorPosition();
        const style = this.indicatorStyle();
        const horizontal = runningIndicatorPositionIsHorizontal(position);
        const glassLength = horizontal ? glass.width : glass.height;
        const thickness = Math.min(
            this.indicatorThickness(),
            horizontal ? glass.height : glass.width
        );
        const inset = runningIndicatorFillsLength(style) &&
            !this._settings.get_boolean('running-indicator-full-length')
            ? Math.round(
                glassLength * (1 - RUNNING_INDICATOR_LENGTH_RATIO) / 2
            )
            : 0;
        const length = Math.max(1, glassLength - inset * 2);
        item._taskbarIndicator.update({
            x: position === 'right'
                ? glass.x + glass.width - thickness
                : glass.x + (horizontal ? inset : 0),
            y: position === 'bottom'
                ? glass.y + glass.height - thickness
                : glass.y + (horizontal ? 0 : inset),
            length,
            inset,
            cross: horizontal ? glass.height : glass.width,
            thickness,
            position,
            style,
            count: item._taskbarWindowCount,
            focused: item._taskbarFocused,
            color: item._taskbarRunning ? this._indicatorColor(item) : null,
        }, animate);
    }

    syncIndicatorColor(item) {
        this.updateIndicatorGeometry(item, false);
    }

    _indicatorColor(item) {
        if (!this._settings.get_boolean('custom-indicator-colors-enabled') &&
            this._settings.get_boolean('match-icon-color')) {
            const iconColor = this._iconColors.getColor(item._taskbarApp);
            if (iconColor)
                return iconColor;
        }

        if (!this._settings.get_boolean('custom-indicator-colors-enabled'))
            return null;

        return this._settings.get_string(
            item._taskbarFocused
                ? 'focused-indicator-color'
                : 'unfocused-indicator-color'
        );
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
        isCombined = false,
        iconSize = this._getIconSize(),
        label = null
    ) {
        const hasLabel = (Boolean(window) || isCombined) &&
            !panelIsVertical(this._settings);
        if (this._settings.get_boolean('windows-xp-theme-enabled') &&
            hasLabel && showLabels) {
            return WINDOWS_XP_TASKBUTTON_WIDTH;
        }

        const minimumIconWidth = iconSize % 2 === 0 ? 22 : 21;
        const iconWidth = Math.max(iconSize, minimumIconWidth) + 8;
        const actualLabelWidth = label
            ? this.labelWidthForButton(window, isCombined, label)
            : labelWidth;
        return hasLabel && showLabels && actualLabelWidth > 0
            ? iconWidth + APP_LABEL_SPACING + actualLabelWidth
            : iconWidth;
    }

    labelWidthForButton(window, isCombined = false, label = null) {
        if (this._settings.get_boolean('windows-xp-theme-enabled') &&
            (window || isCombined)) {
            return WINDOWS_XP_TASKBUTTON_WIDTH - this._getIconSize() -
                WINDOWS_XP_TASKBUTTON_ICON_SPACING -
                WINDOWS_XP_TASKBUTTON_HORIZONTAL_PADDING * 2;
        }
        if (!label || this._settings.get_boolean('group-apps-use-fixed-width'))
            return this._getAppLabelWidth();

        return Math.min(
            label.get_preferred_width(-1)[1],
            this.labelMaxWidth()
        );
    }

    buttonContentHeight(panelHeight = this.visualPanelHeight()) {
        return Math.max(
            1,
            panelHeight - APP_CONTENT_VERTICAL_RESERVE
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

    itemMainExtent(
        window,
        showLabels = this._showAppLabels(),
        labelWidth = this._getAppLabelWidth(),
        isCombined = false,
        iconSize = this._getIconSize(),
        label = null
    ) {
        return panelIsVertical(this._settings)
            ? this.verticalItemExtent(iconSize)
            : this.buttonWidth(
                window,
                showLabels,
                labelWidth,
                isCombined,
                iconSize,
                label
            );
    }

    itemSlotWidth(
        window,
        isLauncher = false,
        pinnedToRunningGap = false,
        isCombined = false,
        trailing = false,
        iconSize = this._getIconSize(),
        label = null
    ) {
        const transitionGap = this.transitionGap(pinnedToRunningGap);
        const iconSpacing = this.iconSpacing(isLauncher);
        return this.itemMainExtent(
            window,
            this._showAppLabels(),
            this._getAppLabelWidth(),
            isCombined,
            iconSize,
            label
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
        const maxLabelWidth = this.labelMaxWidth();
        const fixedWidth = this._settings.get_boolean(
            'group-apps-use-fixed-width'
        );
        const windowsXpTheme = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const hasLabel = (Boolean(window) || item._taskbarIsCombinedApp) &&
            this._showAppLabels() &&
            !panelIsVertical(this._settings);
        item._taskbarLabel.text = text;
        if (windowsXpTheme) {
            item._taskbarLabel.set_style(null);
            item._taskbarLabel.clutter_text.natural_width = 0;
            item._taskbarLabel.clutter_text.natural_width_set = false;
        } else {
            item._taskbarLabel.set_style(
                `font-size: ${this._settings.get_int(
                    'group-apps-label-font-size'
                )}px;` +
                `font-weight: ${this._settings.get_string(
                    'group-apps-label-font-weight'
                )};` +
                (fixedWidth ? '' : `max-width: ${maxLabelWidth}px;`)
            );
            item._taskbarLabel.set_width(fixedWidth ? maxLabelWidth : -1);
            item._taskbarLabel.clutter_text.natural_width = fixedWidth
                ? maxLabelWidth
                : 0;
            item._taskbarLabel.clutter_text.natural_width_set = fixedWidth;
        }
        item._taskbarLabel.visible = hasLabel &&
            (windowsXpTheme || maxLabelWidth > 0);
        if (window)
            item._taskbarButton.accessible_name = `${text}, ${_('running')}`;
    }

    destroy() {
        this._iconColors.destroy();
        this._iconColors = null;
        this._getAppItems = null;
        this._showAppLabels = null;
        this._getPanelHeight = null;
        this._getIconSize = null;
        this._getAppLabelWidth = null;
        this._taskbarActor = null;
        this._settings = null;
    }
}
