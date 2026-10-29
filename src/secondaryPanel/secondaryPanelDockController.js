// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    BLUR_MY_SHELL_PANEL_STYLES,
    BLUR_MY_SHELL_DOCK_STYLES,
    BLUR_MY_SHELL_DOCK_TRANSPARENT,
    blurMyShellDockStyle,
} from '../shared/blurMyShellUtils.js';
import {
    dockBlurIsActive,
    panelBlurIsActive,
    syncPanelBlurCornerRadius,
} from '../integration/blurMyShellRuntime.js';
import {
    panelBackgroundStyle,
    panelBorderStyle,
    panelBorderWidth,
} from '../panel/panelBackgroundStyle.js';
import {
    PANEL_BLUR_CLASSES,
    syncPanelBlurClasses,
} from '../panel/panelBlurClasses.js';
import {floatingPanelEdgeGap} from '../panel/floatingPanelGeometry.js';
import {dockFloatingEnabled} from '../shared/taskbarPanelModes.js';
import {FloatingPanelLayout} from '../panel/floatingPanelLayout.js';
import {panelGeometry} from '../panel/panelGeometry.js';
import {
    dynamicTransparencyStyle,
} from '../panel/dynamicTransparency.js';
import {
    panelEdgeSides,
    panelIsVertical,
    panelPosition,
    positionIsVertical,
} from '../panel/panelPosition.js';
import {constrainTaskbarSize} from '../taskbar/taskbarLayout.js';
import {prepareTaskbarIconSizeChange} from '../taskbar/taskbarIconSize.js';
import {panelUsesLightTheme} from '../themeUtils.js';

const EXTERNAL_PANEL_STYLES = new Set(BLUR_MY_SHELL_PANEL_STYLES);
const EXTERNAL_DOCK_STYLES = new Set(BLUR_MY_SHELL_DOCK_STYLES);
const DOCK_BACKGROUND_CLASS = 'dash-background';
const OWN_BLUR_CLASSES = new Set(PANEL_BLUR_CLASSES);
const DEFAULT_BUTTON_PADDING_CLASS =
    'simple-taskbar-default-panel-button-padding';
const HOVER_INSET_CLASS_PREFIX =
    'simple-taskbar-panel-button-hover-inset-';
const PANEL_EDGE_CLASSES = new Set([
    'simple-taskbar-panel-top',
    'simple-taskbar-panel-bottom',
    'simple-taskbar-panel-left',
    'simple-taskbar-panel-right',
]);
const PANEL_APPEARANCE_CLASSES = new Set([
    'simple-taskbar-theme-light',
    'simple-taskbar-theme-dark',
    'simple-taskbar-border-disabled',
]);

export class SecondaryPanelDockController {
    constructor({
        settings,
        monitor,
        mainPanelSettings,
        actor,
        panelBox,
        leftBox,
        centerBox,
        rightBox,
        taskbarBin,
        taskbarController,
        startButtonController,
        verticalItemsController,
        applicationOverflowController,
        getPanelHeight,
        getIconSize,
        setIconSize,
        setPanelHeight,
        onPosition,
        isCentered,
        getHoverReserve,
    }) {
        this._settings = settings;
        this._monitor = monitor;
        this._mainPanelSettings = mainPanelSettings;
        this._actor = actor;
        this._panelBox = panelBox;
        this._boxes = [leftBox, centerBox, rightBox];
        this._taskbarBin = taskbarBin;
        this._taskbarController = taskbarController;
        this._startButtonController = startButtonController;
        this._verticalItemsController = verticalItemsController;
        this._applicationOverflowController = applicationOverflowController;
        this._getPanelHeight = getPanelHeight;
        this._getIconSize = getIconSize;
        this._setIconSize = setIconSize;
        this._setPanelHeight = setPanelHeight;
        this._onPosition = onPosition;
        this._isCentered = isCentered;
        this._configuredIconSize = settings.getConfiguredIconSize();
        this._layout = new FloatingPanelLayout({
            settings,
            getMonitor: () => this._monitor,
            boxes: this._boxes,
            getPanelHeight,
            getHoverReserve,
            getEdgeGap: () => this.getPanelEdgeGap(),
            getGeometry: () => this.getGeometry(),
            onPosition,
            onContentChanged: () => this._updateTaskbarWidthInternal(),
            strutName: 'simple-taskbar-dock-strut',
        });
        this._mainPanelBox = null;
    }

    get strutActor() {
        return this._layout.strutActor;
    }

    enable() {
        this._layout.enable(!this._settings.get_boolean('dock-panel-mode') ||
            dockFloatingEnabled(this._settings));
        this._connectSignals();
        this._syncSidePadding();
    }

    destroy() {
        this._layout.destroy();
        this._layout = null;
        this._settings.disconnectObject(this);
        St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);
        St.Settings.get().disconnectObject(this);
        if (this._mainPanelBox)
            this._mainPanelBox.disconnectObject(this);

        this._settings = null;
        this._monitor = null;
        this._mainPanelSettings = null;
        this._mainPanelBox = null;
        this._actor = null;
        this._panelBox = null;
        this._boxes = null;
        this._taskbarBin = null;
        this._taskbarController = null;
        this._startButtonController = null;
        this._verticalItemsController = null;
        this._applicationOverflowController = null;
        this._getPanelHeight = null;
        this._getIconSize = null;
        this._setIconSize = null;
        this._setPanelHeight = null;
        this._onPosition = null;
        this._isCentered = null;
        this._configuredIconSize = 0;
    }

    getPanelLengthPercentage() {
        if (this._settings.get_boolean('dock-panel-mode'))
            return null;

        return this._settings.get_int('dock-max-length');
    }

    getBaseLength() {
        return this._layout.baseLength;
    }

    getPanelLengthOverride() {
        if (!this._settings.get_boolean('dock-panel-mode'))
            return this._layout.panelLength;
        if (!dockFloatingEnabled(this._settings))
            return null;

        const monitorLength = panelIsVertical(this._settings)
            ? this._monitor.height : this._monitor.width;
        return monitorLength - this.getPanelEdgeGap() * 2;
    }

    getPanelEdgeGap() {
        return dockFloatingEnabled(this._settings)
            ? floatingPanelEdgeGap(this._settings, this._monitor) : 0;
    }

    getLimitRevealToPanel() {
        return this._isShorterThanEdge() &&
            this._settings.get_boolean('edge-reveal-enabled');
    }

    _isShorterThanEdge() {
        return !this._settings.get_boolean('dock-panel-mode') ||
            dockFloatingEnabled(this._settings);
    }

    _cornerRadius() {
        if (!this._isShorterThanEdge())
            return 0;
        if (this._settings.get_boolean('dock-panel-mode') && this.getPanelEdgeGap() === 0)
            return 0;

        return this._settings.get_int('dock-corner-radius');
    }

    getGeometry() {
        const geometry = panelGeometry(
            this._settings,
            this._monitor,
            this._getPanelHeight(),
            0,
            this.getPanelLengthPercentage(),
            this.getPanelLengthOverride(),
            this.getPanelEdgeGap()
        );
        this._connectToMainPanel(geometry);
        return geometry;
    }

    getTaskbarWidthGeometry() {
        const geometry = panelGeometry(
            this._settings,
            this._monitor,
            this._getPanelHeight(),
            0,
            this.getPanelLengthPercentage(),
            this._settings.get_boolean('dock-panel-mode') ? this.getPanelLengthOverride() : null
        );
        this._connectToMainPanel(geometry);
        return geometry;
    }

    getPositionState(animateEdgeGapRequested) {
        return this._layout.getPositionState(animateEdgeGapRequested);
    }

    syncStrut() {
        this._layout.syncStrut();
    }

    _syncSidePadding() {
        const padding = this._settings.get_boolean('dock-panel-mode')
            ? 0 : this._settings.get_int('taskbar-side-padding');
        const [startBox, , endBox] = this._boxes;
        const [startSide, endSide] = panelEdgeSides(startBox, panelIsVertical(this._settings));
        startBox.set_style(`padding-${startSide}: ${padding}px;`);
        endBox.set_style(`padding-${endSide}: ${padding}px;`);
    }

    updateTaskbarWidth() {
        this._layout.updateContent();
    }

    queueTaskbarWidth() {
        this._layout.queueContentUpdate();
    }

    resetIconSize() {
        this._configuredIconSize = this._settings.getConfiguredIconSize();
        this._settings.setRuntimeIconSize(this._configuredIconSize);
        this._setIconSize(this._configuredIconSize);
        this._setPanelHeight(this._settings.get_int('panel-height'));
        this._taskbarController.setIconSize(this._configuredIconSize);
        this._taskbarController.setPanelHeight(this._getPanelHeight());
        this._startButtonController.applyAppearance(
            this._configuredIconSize,
            this._settings.get_int('start-button-padding')
        );
        this._verticalItemsController.sync();
        this._applicationOverflowController.sync();
    }

    _externalStyles(styles) {
        return this._actor.get_style_class_name()
            .split(/\s+/)
            .filter(style => styles.has(style));
    }

    syncTheme() {
        const dockFloating = this._isShorterThanEdge();
        const dockBlurActive = dockBlurIsActive(this._actor);
        const panelBlurActive = panelBlurIsActive(this._actor);
        const cornerRadius = this._cornerRadius();
        const cornerRadiusStyle = dockFloating
            ? `border-radius: ${cornerRadius}px;`
            : '';
        const vertical = panelIsVertical(this._settings);
        const light = panelUsesLightTheme(this._settings);
        const borderEnabled = this._settings.get_boolean(
            light
                ? 'panel-border-light-enabled'
                : 'panel-border-enabled'
        );
        const edgeClass = `simple-taskbar-panel-${
            panelPosition(this._settings)
        }`;
        const classes = Main.panel.get_style_class_name()
            .split(/\s+/)
            .filter(style => style &&
                style !== DEFAULT_BUTTON_PADDING_CLASS &&
                !style.startsWith(HOVER_INSET_CLASS_PREFIX) &&
                !PANEL_APPEARANCE_CLASSES.has(style) &&
                !PANEL_EDGE_CLASSES.has(style) &&
                style !== 'simple-taskbar-panel-vertical' &&
                !EXTERNAL_PANEL_STYLES.has(style) &&
                !EXTERNAL_DOCK_STYLES.has(style) &&
                style !== DOCK_BACKGROUND_CLASS &&
                style !== 'simple-taskbar-floating' &&
                !OWN_BLUR_CLASSES.has(style));
        if (dockBlurActive)
            classes.push(DOCK_BACKGROUND_CLASS, ...this._externalStyles(EXTERNAL_DOCK_STYLES));
        else if (panelBlurActive)
            classes.push(...this._externalStyles(EXTERNAL_PANEL_STYLES));
        classes.push('simple-taskbar-panel', 'simple-taskbar-secondary-panel');
        if (dockFloating)
            classes.push('simple-taskbar-dock-floating');
        if (vertical)
            classes.push('simple-taskbar-panel-vertical');
        classes.push(light
            ? 'simple-taskbar-theme-light'
            : 'simple-taskbar-theme-dark');
        if (!borderEnabled)
            classes.push('simple-taskbar-border-disabled');
        classes.push(edgeClass);
        this._actor.set_style_class_name([...new Set(classes)].join(' '));
        if (this._settings.get_boolean('windows-xp-theme-enabled')) {
            this._actor.set_style(Main.panel.get_style());
            return;
        }

        const blurActive = dockBlurActive || panelBlurActive;
        syncPanelBlurClasses(
            this._actor,
            blurActive,
            light && (!dockBlurActive ||
                blurMyShellDockStyle() === BLUR_MY_SHELL_DOCK_TRANSPARENT),
            dockBlurActive ? true : undefined
        );
        syncPanelBlurCornerRadius(this._actor, cornerRadius);
        if (blurActive) {
            const borderStyle = panelBorderStyle(
                this._settings,
                light,
                borderEnabled,
                dockFloating,
                true,
                panelBorderWidth(this._monitor.geometry_scale)
            );
            this._actor.set_style(
                cornerRadiusStyle
                    ? `${cornerRadiusStyle} ${borderStyle}`
                    : borderStyle
            );
            return;
        }
        const {dynamicOpacity, transitionDuration} = dynamicTransparencyStyle(
            this._settings,
            this._settings.get_boolean('transparency-on-unmaximized'),
            this._monitor,
            () => this.getGeometry()
        );
        this._actor.set_style(panelBackgroundStyle(
            this._settings,
            light,
            borderEnabled,
            cornerRadiusStyle,
            dockFloating,
            dynamicOpacity,
            transitionDuration,
            panelBorderWidth(this._monitor.geometry_scale)
        ));
    }

    _connectSignals() {
        this._settings.connectObject(
            'changed::icon-size',
            () => {
                this.resetIconSize();
                this._onPosition();
            },
            'changed::windows-xp-theme-enabled',
            () => this.resetIconSize(),
            this
        );
        for (const key of [
            'transparency-enabled',
            'transparency-level',
            'transparency-on-unmaximized',
            'transparency-dynamic-behavior',
            'transparency-dynamic-distance',
            'transparency-dynamic-level',
            'transparency-dynamic-animation-time',
            'custom-panel-color-enabled',
            'custom-panel-color',
            'custom-panel-gradient-enabled',
            'custom-panel-gradient-color',
            'custom-panel-gradient-direction',
            'panel-theme-follow-system',
            'panel-theme',
            'panel-border-enabled',
            'panel-border-light-enabled',
            'dock-corner-radius',
        ]) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this.syncTheme(),
                this
            );
        }
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        themeContext.connectObject(
            'changed',
            () => this.syncTheme(),
            this
        );
        const stSettings = St.Settings.get();
        stSettings.connectObject(
            'notify::color-scheme',
            () => this.syncTheme(),
            this
        );
        this._settings.connectObject(
            'changed::taskbar-side-padding',
            () => this._syncSidePadding(),
            'changed::dock-max-length',
            () => {
                this._layout.resetLength();
                this.updateTaskbarWidth();
            },
            'changed::dock-min-icon-size',
            () => {
                this.updateTaskbarWidth();
            },
            this
        );
    }

    _updateTaskbarWidthInternal() {
        const vertical = panelIsVertical(this._settings);
        const geometry = this.getTaskbarWidthGeometry();
        const availableWidth = constrainTaskbarSize({
            taskbarBin: this._taskbarBin,
            leftBox: this._boxes[0],
            centerBox: this._boxes[1],
            rightBox: this._boxes[2],
            panelLength: vertical ? geometry.height : geometry.width,
            panelThickness: this._getPanelHeight(),
            centered: this._isCentered(),
            vertical,
        });
        if (availableWidth !== undefined) {
            this._taskbarController.setAvailableWidth(availableWidth);
            if (!this._settings.get_boolean('windows-xp-theme-enabled') &&
                this._syncIconSize(availableWidth)) {
                this._onPosition(false);
                this._layout.queueContentUpdate();
                return;
            }
        }

        if (this._settings.get_boolean('dock-panel-mode'))
            return;

        this._layout.updateLength(vertical ? geometry.height : geometry.width, vertical);
    }

    _syncIconSize(availableLength) {
        const maximum = this._configuredIconSize;
        const minimum = Math.min(
            this._settings.get_int('dock-min-icon-size'),
            maximum
        );
        const iconSize = this._taskbarController.getIconSizeForLength(
            availableLength,
            maximum,
            minimum,
            this._startButtonController.actor.visible
                ? this._getIconSize()
                : null
        );
        if (iconSize === this._getIconSize())
            return false;

        prepareTaskbarIconSizeChange(this._taskbarController, this._startButtonController);
        this._settings.setRuntimeIconSize(iconSize);
        this._setIconSize(iconSize);
        this._setPanelHeight(this._settings.get_int('panel-height'));
        this._taskbarController.setIconSize(iconSize);
        this._taskbarController.setPanelHeight(this._getPanelHeight());
        this._startButtonController.applyAppearance(
            iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._verticalItemsController.sync();
        this._applicationOverflowController.syncIconSizeChange();
        return true;
    }

    _findMainPanelBox() {
        if (this._monitor === Main.layoutManager.primaryMonitor)
            return Main.layoutManager.panelBox;

        if (!this._mainPanelSettings.get_boolean('multi-monitor-panels'))
            return null;

        for (const child of Main.uiGroup.get_children()) {
            if (child._simpleTaskbarPanelBox === 'panel' &&
                child._simpleTaskbarMonitorIndex === this._monitor.index)
                return child;
        }

        return null;
    }

    _syncMainPanelBox() {
        const panelBox = this._findMainPanelBox();
        if (panelBox === this._mainPanelBox)
            return panelBox;

        if (this._mainPanelBox)
            this._mainPanelBox.disconnectObject(this);
        this._mainPanelBox = panelBox;
        if (panelBox) {
            panelBox.connectObject(
                'notify::allocation', () => this._onPosition(),
                'destroy', () => {
                    this._mainPanelBox = null;
                },
                this
            );
        }

        return panelBox;
    }

    _connectToMainPanel(geometry) {
        if (!this._settings.get_boolean('dock-panel-mode'))
            return;

        const mainPanelBox = this._syncMainPanelBox();
        if (!mainPanelBox)
            return;

        const mainPanelPosition = this._mainPanelSettings.get_string(
            'panel-position'
        );
        const [mainPanelX, mainPanelY] = mainPanelBox.get_position();
        const edgeGap = this.getPanelEdgeGap();

        if (geometry.vertical &&
            (mainPanelPosition === 'top' ||
                mainPanelPosition === 'bottom')) {
            const panelEdge = mainPanelPosition === 'top'
                ? mainPanelY + mainPanelBox.height
                : mainPanelY;
            const maximumLength = mainPanelPosition === 'top'
                ? this._monitor.y + this._monitor.height - panelEdge
                : panelEdge - this._monitor.y;
            geometry.height = Math.min(geometry.height, maximumLength - edgeGap * 2);
            geometry.y = mainPanelPosition === 'top'
                ? panelEdge + edgeGap
                : panelEdge - edgeGap - geometry.height;
        } else if (!geometry.vertical &&
            positionIsVertical(mainPanelPosition)) {
            const panelEdge = mainPanelPosition === 'left'
                ? mainPanelX + mainPanelBox.width
                : mainPanelX;
            const maximumLength = mainPanelPosition === 'left'
                ? this._monitor.x + this._monitor.width - panelEdge
                : panelEdge - this._monitor.x;
            geometry.width = Math.min(geometry.width, maximumLength - edgeGap * 2);
            geometry.x = mainPanelPosition === 'left'
                ? panelEdge + edgeGap
                : panelEdge - edgeGap - geometry.width;
        }
    }
}
