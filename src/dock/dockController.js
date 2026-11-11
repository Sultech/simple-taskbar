// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
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
    dynamicPanelBackgroundStyle,
    panelBorderStyle,
    panelBorderWidth,
} from '../panel/panelBackgroundStyle.js';
import {syncPanelBlurClasses} from '../panel/panelBlurClasses.js';
import {
    BLUR_MY_SHELL_PANEL_CLASSES,
    actorStyleClasses,
    syncSecondaryPanelClasses,
} from '../panel/secondaryPanelClasses.js';
import {dockFloatingEnabled} from '../shared/panelModeSettings.js';
import {FloatingPanelLayout} from '../panel/floatingPanelLayout.js';
import {floatingPanelEdgeGap, panelGeometry} from '../panel/panelGeometry.js';
import {panelIsVertical, positionIsVertical} from '../shared/panelPositionUtils.js';
import {panelButtonHoverInset, syncPanelSidePadding} from '../panel/panelButtonPaddingController.js';
import {PanelButtonCornerRadiusController} from '../panel/panelButtonCornerRadiusController.js';
import {PanelButtonHighlightLayer} from '../panel/panelButtonHighlightLayer.js';
import {constrainTaskbarSize, fitTaskbarToAvailableLength} from '../panel/panelLayout.js';
import {connectPanelAppearanceSignals} from '../panel/panelSettingsSignals.js';
import {panelUsesLightTheme} from '../themeUtils.js';

const EXTERNAL_DOCK_STYLES = new Set(BLUR_MY_SHELL_DOCK_STYLES);
const DOCK_BACKGROUND_CLASS = 'dash-background';
const DEFAULT_BUTTON_PADDING_CLASS =
    'simple-taskbar-default-panel-button-padding';
const HOVER_INSET_CLASS_PREFIX =
    'simple-taskbar-panel-button-hover-inset-';
const PANEL_APPEARANCE_CLASSES = new Set([
    'simple-taskbar-theme-light',
    'simple-taskbar-theme-dark',
    'simple-taskbar-border-disabled',
]);

export class DockController {
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
        getPanelHeight,
        iconSizer,
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
        this._highlightLayer = new PanelButtonHighlightLayer(
            settings, this._boxes, () => this._getPanelHeight(), () => this._iconSizer.iconSize
        );
        actor.insert_child_below(this._highlightLayer, null);
        this._cornerRadiusController = new PanelButtonCornerRadiusController(
            mainPanelSettings, this._boxes, () => panelButtonHoverInset(
                panelIsVertical(this._mainPanelSettings) ? Main.panel.width : Main.panel.height
            ),
            (button, highlighted) => this._highlightLayer.setTracked(button, highlighted),
            () => true
        );
        this._taskbarBin = taskbarBin;
        this._taskbarController = taskbarController;
        this._startButtonController = startButtonController;
        this._getPanelHeight = getPanelHeight;
        this._iconSizer = iconSizer;
        this._onPosition = onPosition;
        this._isCentered = isCentered;
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
        this._cornerRadiusController.enable();
        const thicknessProperty = panelIsVertical(this._mainPanelSettings) ? 'width' : 'height';
        Main.panel.connectObject(`notify::${thicknessProperty}`, () => this._cornerRadiusController.sync(), this);
        this._layout.enable(!this._settings.get_boolean('dock-panel-mode') ||
            dockFloatingEnabled(this._settings));
        this._connectSignals();
        this.syncSidePadding();
    }

    destroy() {
        Main.panel.disconnectObject(this);
        this._settings.disconnectObject(this);
        St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);
        St.Settings.get().disconnectObject(this);
        if (this._mainPanelBox)
            this._mainPanelBox.disconnectObject(this);
        this._cornerRadiusController.destroy();
        this._cornerRadiusController = null;
        this._highlightLayer.destroy();
        this._highlightLayer = null;
        this._layout.destroy();
        this._layout = null;

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
        this._getPanelHeight = null;
        this._iconSizer = null;
        this._onPosition = null;
        this._isCentered = null;
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
        const state = this._layout.getPositionState(animateEdgeGapRequested);
        if (state.edgeGapChanged)
            this.syncSidePadding();
        return state;
    }

    syncStrut() {
        this._layout.syncStrut();
    }

    syncSidePadding() {
        const padding = this._settings.get_int(
            !this._settings.get_boolean('dock-panel-mode') || this.getPanelEdgeGap() > 0
                ? 'taskbar-side-padding'
                : 'taskbar-full-width-side-padding'
        );
        syncPanelSidePadding(this._boxes, this._startButtonController, panelIsVertical(this._settings), padding,
            (box, side, _item, sidePadding) => box.set_style(`padding-${side}: ${sidePadding}px;`));
    }

    updateTaskbarWidth() {
        this._layout.updateContent();
    }

    queueTaskbarWidth() {
        this._layout.queueContentUpdate();
    }

    resetIconSize() {
        this._iconSizer.reset();
    }

    syncTheme() {
        const dockFloating = this._isShorterThanEdge();
        const dockBlurActive = dockBlurIsActive(this._actor);
        const panelBlurActive = panelBlurIsActive(this._actor);
        const cornerRadius = this._cornerRadius();
        const cornerRadiusStyle = dockFloating
            ? `border-radius: ${cornerRadius}px;`
            : '';
        const light = panelUsesLightTheme(this._settings);
        const borderEnabled = this._settings.get_boolean(
            light
                ? 'panel-border-light-enabled'
                : 'panel-border-enabled'
        );
        let keptClasses = [];
        if (dockBlurActive)
            keptClasses = [DOCK_BACKGROUND_CLASS, ...actorStyleClasses(this._actor, EXTERNAL_DOCK_STYLES)];
        else if (panelBlurActive)
            keptClasses = actorStyleClasses(this._actor, BLUR_MY_SHELL_PANEL_CLASSES);
        syncSecondaryPanelClasses(this._actor, this._settings, {
            isExcluded: style => style === DEFAULT_BUTTON_PADDING_CLASS ||
                style.startsWith(HOVER_INSET_CLASS_PREFIX) ||
                PANEL_APPEARANCE_CLASSES.has(style) ||
                EXTERNAL_DOCK_STYLES.has(style) ||
                style === DOCK_BACKGROUND_CLASS ||
                style === 'simple-taskbar-floating',
            keptClasses,
            extraClasses: [
                ...dockFloating ? ['simple-taskbar-dock-floating'] : [],
                light ? 'simple-taskbar-theme-light' : 'simple-taskbar-theme-dark',
                ...borderEnabled ? [] : ['simple-taskbar-border-disabled'],
            ],
        });
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
        this._actor.set_style(dynamicPanelBackgroundStyle(this._settings, {
            monitor: this._monitor,
            getGeometry: () => this.getGeometry(),
            dynamic: this._settings.get_boolean('transparency-on-unmaximized'),
            light,
            borderEnabled,
            baseStyle: cornerRadiusStyle,
            fullBorder: dockFloating,
            borderWidth: panelBorderWidth(this._monitor.geometry_scale),
        }));
    }

    _connectSignals() {
        this._settings.connectObject(
            'changed::icon-size',
            () => {
                if (!this._iconSizer.syncMaximum())
                    this.updateTaskbarWidth();
                this._onPosition();
            },
            'changed::windows-xp-theme-enabled',
            () => this.resetIconSize(),
            this
        );
        connectPanelAppearanceSignals({
            settings: this._settings,
            owner: this,
            cornerRadiusKey: 'dock-corner-radius',
            onBackgroundChanged: () => this.syncTheme(),
        });
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
            () => this.syncSidePadding(),
            'changed::taskbar-full-width-side-padding',
            () => this.syncSidePadding(),
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
        fitTaskbarToAvailableLength(this._iconSizer, availableWidth, {
            onIconSizeChanged: () => {
                this._onPosition(false);
                this._layout.queueContentUpdate();
            },
            updateLength: () => {
                if (!this._settings.get_boolean('dock-panel-mode'))
                    this._layout.updateLength(vertical ? geometry.height : geometry.width, vertical);
            },
        });
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
