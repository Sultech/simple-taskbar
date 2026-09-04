// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {RunningIndicator} from './runningIndicator.js';
import {TaskbarItemContainer} from './taskbarItemContainer.js';

export class TaskbarAppItemFactory {
    constructor({
        activateItem,
        getButtonContentHeight,
        getButtonWidth,
        getGlassHeight,
        getGlassInset,
        getGlassY,
        getIconSize,
        getLabelWidth,
        getPanelHeight,
        getPreserveItemWidths,
        getSlotWidth,
        handleHover,
        handleMiddleClick,
        handleShiftClick,
        makeDraggable,
        popupMenu,
        queueIconGeometryUpdate,
        showAppLabels,
        syncClassicHighlight,
        syncItemLabel,
        syncLauncherIconPosition,
        updateItemGeometry,
    }) {
        this._activateItem = activateItem;
        this._getButtonContentHeight = getButtonContentHeight;
        this._getButtonWidth = getButtonWidth;
        this._getGlassHeight = getGlassHeight;
        this._getGlassInset = getGlassInset;
        this._getGlassY = getGlassY;
        this._getIconSize = getIconSize;
        this._getLabelWidth = getLabelWidth;
        this._getPanelHeight = getPanelHeight;
        this._getPreserveItemWidths = getPreserveItemWidths;
        this._getSlotWidth = getSlotWidth;
        this._handleHover = handleHover;
        this._handleMiddleClick = handleMiddleClick;
        this._handleShiftClick = handleShiftClick;
        this._makeDraggable = makeDraggable;
        this._popupMenu = popupMenu;
        this._queueIconGeometryUpdate = queueIconGeometryUpdate;
        this._showAppLabels = showAppLabels;
        this._syncClassicHighlight = syncClassicHighlight;
        this._syncItemLabel = syncItemLabel;
        this._syncLauncherIconPosition = syncLauncherIconPosition;
        this._updateItemGeometry = updateItemGeometry;
    }

    create(
        app,
        window = null,
        isLauncher = false,
        isCombined = false,
        isPinnedPrimary = false
    ) {
        const glassWidth = this._getButtonWidth(window, isCombined);
        const slotWidth = this._getSlotWidth(window, isLauncher, isCombined);
        const glassHeight = this._getGlassHeight();
        const glassInset = this._getGlassInset();
        const glassContentWidth = glassWidth - glassInset * 2;
        const glassContentHeight = glassHeight - glassInset * 2;
        const glassY = this._getGlassY();
        const panelHeight = this._getPanelHeight();
        const item = new TaskbarItemContainer();
        item.setPreserveNaturalWidth(this._getPreserveItemWidths());
        item.setSnapChildAllocation(true);
        item.add_style_class_name('simple-taskbar-app-item');
        item.reactive = true;
        item.track_hover = true;
        item.y_align = Clutter.ActorAlign.FILL;
        item.connect('notify::allocation', () => {
            this._queueIconGeometryUpdate();
        });
        const slot = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: slotWidth,
            height: panelHeight,
            clip_to_allocation: false,
        });
        const visual = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            height: panelHeight,
            clip_to_allocation: false,
        });
        visual.set_pivot_point(0.5, 0.5);
        const glassHost = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            height: panelHeight,
            clip_to_allocation: false,
        });
        const classicHover = new St.Widget({
            style_class: 'simple-taskbar-classic-hover',
            visible: false,
        });
        classicHover.set_pivot_point(0, 0);
        const classicFocus = new St.Widget({
            style_class: 'simple-taskbar-classic-focus',
            visible: false,
        });
        classicFocus.set_pivot_point(0, 0);
        const glass = new St.Widget({
            style_class: 'simple-taskbar-app-glass',
            x: glassInset,
            y: glassY + glassInset,
            width: glassContentWidth,
            height: glassContentHeight,
        });
        glass.set_pivot_point(0, 0);
        const glassBorder = new St.Widget({
            style_class: 'simple-taskbar-app-glass-border',
            x: 0,
            y: glassY,
            width: glassWidth,
            height: glassHeight,
        });
        glassBorder.set_pivot_point(0, 0);
        const glassTexture = new St.Widget({
            style_class: 'simple-taskbar-app-glass-texture',
            x: glassInset,
            y: glassY + glassInset,
            width: glassContentWidth,
            height: glassContentHeight,
        });
        glassTexture.set_pivot_point(0, 0);
        glassTexture.set_style(
            `background-size: ${glassContentWidth}px ${glassContentHeight}px;`
        );
        glassHost.add_child(classicHover);
        glassHost.add_child(classicFocus);
        glassHost.add_child(glass);
        glassHost.add_child(glassTexture);
        glassHost.add_child(glassBorder);
        const layout = new St.Widget({
            layout_manager: new Clutter.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
            }),
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        const topSpacer = new St.Widget();
        const bottomSpacer = new St.Widget();
        const content = new St.Widget({
            style_class: 'simple-taskbar-app-content',
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_expand: true,
        });
        const icon = app.create_icon_texture(this._getIconSize());
        icon.x_align = Clutter.ActorAlign.CENTER;
        icon.y_align = Clutter.ActorAlign.CENTER;
        const iconContainer = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            width: this._getIconSize(),
            height: this._getIconSize(),
        });
        const iconClickTarget = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_expand: true,
        });
        iconContainer.add_child(iconClickTarget);
        iconClickTarget.add_child(icon);
        const notificationBadgeLabel = new St.Label({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const notificationBadge = new St.Bin({
            style_class: 'simple-taskbar-notification-badge',
            child: notificationBadgeLabel,
            visible: false,
        });
        const notificationBadgeBin = new St.Bin({
            child: notificationBadge,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });
        iconClickTarget.add_child(notificationBadgeBin);
        const buttonContent = new St.BoxLayout({
            style_class: 'simple-taskbar-app-button-content',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            height: this._getButtonContentHeight(),
        });
        buttonContent.add_child(iconContainer);
        const windowTitle = window ? window.get_title() : null;
        const label = new St.Label({
            style_class: 'simple-taskbar-app-label',
            text: windowTitle || app.get_name(),
            width: this._getLabelWidth(window, isCombined),
            y_align: Clutter.ActorAlign.CENTER,
            visible: (Boolean(window) || isCombined) && this._showAppLabels(),
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        buttonContent.add_child(label);
        content.add_child(buttonContent);

        const button = new St.Button({
            style_class: 'simple-taskbar-app-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            accessible_name: app.get_name(),
            child: layout,
        });
        const indicatorHost = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            width: glassWidth,
            height: panelHeight,
            clip_to_allocation: false,
        });
        const indicator = new RunningIndicator(
            'simple-taskbar-running-indicator',
            glass
        );
        indicatorHost.add_child(indicator);
        layout.add_child(topSpacer);
        layout.add_child(content);
        layout.add_child(bottomSpacer);
        visual.add_child(glassHost);
        visual.add_child(indicatorHost);
        slot.add_child(visual);
        slot.add_child(button);
        item.setChild(slot);

        Object.assign(item, {
            _taskbarApp: app,
            _taskbarWindow: window,
            _taskbarIsLauncher: isLauncher,
            _taskbarIsCombinedApp: isCombined,
            _taskbarIsPinnedPrimary: isPinnedPrimary,
            _taskbarPinnedToRunningGap: false,
            _taskbarTrailingSpacing: false,
            _taskbarButton: button,
            _taskbarButtonContent: buttonContent,
            _taskbarIcon: icon,
            _taskbarIconContainer: iconContainer,
            _taskbarIconClickTarget: iconClickTarget,
            _taskbarNotificationBadge: notificationBadge,
            _taskbarNotificationBadgeLabel: notificationBadgeLabel,
            _taskbarNotificationBadgeBin: notificationBadgeBin,
            _taskbarLabel: label,
            _taskbarSlot: slot,
            _taskbarTopSpacer: topSpacer,
            _taskbarBottomSpacer: bottomSpacer,
            _taskbarVisual: visual,
            _taskbarGlassHost: glassHost,
            _taskbarClassicHover: classicHover,
            _taskbarClassicFocus: classicFocus,
            _taskbarClassicRenderScale: 1,
            _taskbarGlass: glass,
            _taskbarGlassTexture: glassTexture,
            _taskbarGlassBorder: glassBorder,
            _taskbarIndicator: indicator,
            _taskbarIndicatorHost: indicatorHost,
            _taskbarFocused: false,
            _taskbarRunning: false,
            _taskbarWindowCount: 0,
        });
        this._syncLauncherIconPosition(item);
        if (window) {
            window.connectObject(
                'notify::title',
                () => {
                    this._syncItemLabel(item);
                    this._updateItemGeometry(item);
                },
                item
            );
        }

        item.connect('notify::hover', () => {
            this._handleHover(item, item.hover);
            this._syncClassicHighlight(item);
        });
        item.connect('notify::pseudo-class', () => {
            this._syncClassicHighlight(item);
        });

        this._makeDraggable(item, button, icon, app);
        button.connect('clicked', () => {
            this._activateItem(item);
        });
        button.connect('notify::pressed', () => {
            this._syncClassicHighlight(item);
        });
        button.connect('button-press-event', (_actor, event) => {
            const mouseButton = event.get_button();
            if (mouseButton === Clutter.BUTTON_PRIMARY &&
                event.get_state() & Clutter.ModifierType.SHIFT_MASK) {
                this._handleShiftClick(item);
                return Clutter.EVENT_STOP;
            }
            if (mouseButton === Clutter.BUTTON_MIDDLE) {
                this._handleMiddleClick(
                    item,
                    Boolean(event.get_state() & Clutter.ModifierType.SHIFT_MASK)
                );
                return Clutter.EVENT_STOP;
            }
            if (mouseButton === Clutter.BUTTON_SECONDARY) {
                this._popupMenu(item, button);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('popup-menu', () => {
            this._popupMenu(item, button);
            return Clutter.EVENT_STOP;
        });

        return item;
    }

    sync(item) {
        const app = item._taskbarApp;
        item._taskbarIcon.gicon = app.icon;
        item._taskbarLabel.text = app.get_name();
        item._taskbarButton.accessible_name = app.get_name();
    }

    destroy() {
        this._syncLauncherIconPosition = null;
        this._updateItemGeometry = null;
        this._syncItemLabel = null;
        this._showAppLabels = null;
        this._queueIconGeometryUpdate = null;
        this._popupMenu = null;
        this._makeDraggable = null;
        this._syncClassicHighlight = null;
        this._handleShiftClick = null;
        this._handleMiddleClick = null;
        this._handleHover = null;
        this._getSlotWidth = null;
        this._getPreserveItemWidths = null;
        this._getPanelHeight = null;
        this._getLabelWidth = null;
        this._getIconSize = null;
        this._getGlassY = null;
        this._getGlassInset = null;
        this._getGlassHeight = null;
        this._getButtonWidth = null;
        this._getButtonContentHeight = null;
        this._activateItem = null;
    }
}
