// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {hoverRenderScale} from '../shared/applicationHoverAnimation.js';
import {
    PROGRESS_BAR_SETTINGS,
    PROGRESS_BAR_SETTING_KEYS,
} from '../shared/progressBarSettings.js';

const BADGE_SINGLE_DIGIT_ICON_SIZE = 31;
const BADGE_TWO_DIGIT_ICON_SIZE = 35;
const BADGE_LARGE_FONT_ICON_SIZE = 56;
const BADGE_REFERENCE_ICON_SIZE = 48;
const BADGE_MINIMUM_FONT_SIZE = 5;
const BADGE_FONT_SIZE = 11;
const BADGE_LARGE_FONT_SIZE = 12;
const BADGE_FONT_SIZE_RATIO = 0.25;
const BADGE_PADDING_RATIO = 0.07;
const BADGE_MINIMUM_PADDING = 1;
const BADGE_MAXIMUM_PADDING = 4;
const BADGE_SINGLE_DIGIT_MARGIN = 2;
const BADGE_MAXIMUM_OUTWARD_OFFSET = 4;
const BADGE_OUTWARD_OFFSET_DIVISOR = 4;
const BADGE_INWARD_OFFSET_ICON_SIZE = 63;
const BADGE_INWARD_OFFSET_DIVISOR = 8;
const BADGE_MAXIMUM_INWARD_OFFSET = 8;
const PROGRESS_BAR_FILL_HEIGHT_RATIO = 0.05;
const PROGRESS_BAR_MINIMUM_FILL_HEIGHT = 2;
const PROGRESS_BAR_MAXIMUM_FILL_HEIGHT = 3;
const PROGRESS_BAR_BORDER_WIDTH = 1;
const PROGRESS_BAR_BOTTOM_GAP_RATIO = 0.08;
const PROGRESS_BAR_MINIMUM_BOTTOM_GAP = 1;
const PROGRESS_BAR_SIDE_GAP_RATIO = 0.2;

export class TaskbarOverlayController {
    constructor({
        settings,
        overlayModel,
        appButtons,
        getOrderedApplicationItems,
        getIconSize,
        appearanceController,
    }) {
        this._settings = settings;
        this._overlayModel = overlayModel;
        this._appButtons = appButtons;
        this._getOrderedApplicationItems = getOrderedApplicationItems;
        this._getIconSize = getIconSize;
        this._appearanceController = appearanceController;
    }

    enable() {
        this._overlayModel.connectObject(
            'changed', () => this.sync(), this
        );
        this._settings.connectObject(
            'changed::show-notification-badges',
            () => this._syncNotificationBadges(),
            'changed::show-progress-bars',
            () => this._syncProgressBars(),
            this
        );
        for (const key of PROGRESS_BAR_SETTING_KEYS) {
            this._settings.connectObject(`changed::${key}`, () => {
                for (const item of this._appButtons.values())
                    this.syncProgressBarGeometry(item);
            }, this);
        }
    }

    destroy() {
        this._overlayModel.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._overlayModel = null;
        this._settings = null;
        this._appButtons = null;
        this._getOrderedApplicationItems = null;
        this._getIconSize = null;
        this._appearanceController = null;
    }

    sync() {
        this._syncNotificationBadges();
        this._syncProgressBars();
    }

    _launcherOverlayTargets() {
        const itemsByAppId = new Map();
        for (const item of this._getOrderedApplicationItems()) {
            if (!item._taskbarApp)
                continue;

            const appId = item._taskbarApp.get_id();
            let items = itemsByAppId.get(appId);
            if (!items) {
                items = [];
                itemsByAppId.set(appId, items);
            }
            items.push(item);
        }

        const targets = new Map();
        for (const [appId, items] of itemsByAppId) {
            targets.set(
                appId,
                items.find(item => item._taskbarIsLauncher) ??
                items.find(item => item._taskbarIsPinnedPrimary) ??
                items.find(item => item._taskbarIsCombinedApp) ??
                items[0]
            );
        }

        return targets;
    }

    _syncNotificationBadges() {
        for (const item of this._appButtons.values())
            item._taskbarNotificationBadge.hide();

        if (!this._settings.get_boolean('show-notification-badges'))
            return;

        for (const [appId, target] of this._launcherOverlayTargets()) {
            const count = this._overlayModel.getCount(appId);
            if (count <= 0)
                continue;

            target._taskbarNotificationBadgeLabel.text =
                this._notificationBadgeText(count);
            this.syncNotificationBadgeGeometry(target);
            target._taskbarNotificationBadge.show();
        }
    }

    _syncProgressBars() {
        for (const item of this._appButtons.values())
            item._taskbarProgressBar.hide();

        if (!this._settings.get_boolean('show-progress-bars'))
            return;

        for (const [appId, target] of this._launcherOverlayTargets()) {
            const progress = this._overlayModel.getProgress(appId);
            if (progress < 0)
                continue;

            target._taskbarProgress = progress;
            this.syncProgressBarGeometry(target);
            target._taskbarProgressBar.show();
        }
    }

    syncProgressBarGeometry(item) {
        const iconSize = this._getIconSize();
        const fillHeight = this._settings.get_boolean(
            PROGRESS_BAR_SETTINGS.automaticThickness
        )
            ? Math.max(
                PROGRESS_BAR_MINIMUM_FILL_HEIGHT,
                Math.min(
                    PROGRESS_BAR_MAXIMUM_FILL_HEIGHT,
                    Math.round(iconSize * PROGRESS_BAR_FILL_HEIGHT_RATIO)
                )
            )
            : this._settings.get_int(PROGRESS_BAR_SETTINGS.thickness);
        const height = fillHeight + PROGRESS_BAR_BORDER_WIDTH * 2;
        const bottomGap = Math.max(
            PROGRESS_BAR_MINIMUM_BOTTOM_GAP,
            Math.round(iconSize * PROGRESS_BAR_BOTTOM_GAP_RATIO)
        );
        const sideGap = Math.round(
            iconSize * PROGRESS_BAR_SIDE_GAP_RATIO
        );
        const width = Math.max(1, iconSize - sideGap * 2);
        const radius = Math.floor(height / 2);
        const fillRadius = Math.max(0, radius - PROGRESS_BAR_BORDER_WIDTH);
        const renderScale = hoverRenderScale(this._settings);
        const color = this._settings.get_boolean(
            PROGRESS_BAR_SETTINGS.followIndicatorColors
        )
            ? this._appearanceController.indicatorColor(item)
            : this._settings.get_string(PROGRESS_BAR_SETTINGS.color);
        item._taskbarProgressBarTrack.set_position(
            sideGap,
            iconSize - height - bottomGap
        );
        item._taskbarProgressBarTrack.set_scale(
            1 / renderScale,
            1 / renderScale
        );
        item._taskbarProgressBarTrack.set_size(
            width * renderScale,
            height * renderScale
        );
        item._taskbarProgressBarTrack.set_style(
            `border-radius: ${radius * renderScale}px;` +
            `border-width: ${PROGRESS_BAR_BORDER_WIDTH * renderScale}px;`
        );
        const innerWidth = Math.max(
            0,
            width - PROGRESS_BAR_BORDER_WIDTH * 2
        );
        item._taskbarProgressBarFill.set_size(
            Math.round(item._taskbarProgress * innerWidth) * renderScale,
            fillHeight * renderScale
        );
        item._taskbarProgressBarFill.set_style(
            `border-radius: ${fillRadius * renderScale}px;` +
            (color ? `background-color: ${color};` : '')
        );
    }

    _notificationBadgeText(count) {
        const iconSize = this._getIconSize();
        if (iconSize <= BADGE_SINGLE_DIGIT_ICON_SIZE && count > 9)
            return '9';

        if (count <= 99)
            return count.toString();

        return iconSize <= BADGE_TWO_DIGIT_ICON_SIZE ? '99' : '99+';
    }

    syncNotificationBadgeGeometry(item) {
        const iconSize = this._getIconSize();
        const fontSize = Math.max(
            BADGE_MINIMUM_FONT_SIZE,
            Math.min(
                iconSize < BADGE_LARGE_FONT_ICON_SIZE
                    ? BADGE_FONT_SIZE
                    : BADGE_LARGE_FONT_SIZE,
                Math.floor(iconSize * BADGE_FONT_SIZE_RATIO)
            )
        );
        const horizontalPadding = Math.max(
            BADGE_MINIMUM_PADDING,
            Math.min(
                BADGE_MAXIMUM_PADDING,
                Math.round(iconSize * BADGE_PADDING_RATIO)
            )
        );
        const badgeTextLength =
            item._taskbarNotificationBadgeLabel.text.length;
        const singleDigit = badgeTextLength === 1;
        const singleDigitSize = fontSize + BADGE_SINGLE_DIGIT_MARGIN;
        const maximumOutwardOffset = Math.min(
            BADGE_MAXIMUM_OUTWARD_OFFSET,
            badgeTextLength + 1
        );
        const cornerOffset = iconSize < BADGE_REFERENCE_ICON_SIZE
            ? Math.min(
                maximumOutwardOffset,
                Math.round(
                    (BADGE_REFERENCE_ICON_SIZE - iconSize) /
                    BADGE_OUTWARD_OFFSET_DIVISOR
                )
            )
            : -Math.max(
                0,
                Math.min(
                    BADGE_MAXIMUM_INWARD_OFFSET,
                    Math.round(
                        (iconSize - BADGE_INWARD_OFFSET_ICON_SIZE) /
                        BADGE_INWARD_OFFSET_DIVISOR
                    )
                )
            );
        item._taskbarIconContainer.set_size(
            iconSize,
            iconSize
        );
        item._taskbarNotificationBadge.set_style(
            `font-size: ${fontSize}px;` +
            `min-width: ${singleDigit ? singleDigitSize : 0}px;` +
            `min-height: ${singleDigit ? singleDigitSize : 0}px;` +
            `padding: 0 ${singleDigit ? 0 : horizontalPadding}px;`
        );
        item._taskbarNotificationBadgeBin.translation_x = cornerOffset +
            this._appearanceController.launcherIconOffset(item);
        item._taskbarNotificationBadgeBin.translation_y = -cornerOffset;
    }
}
