// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {BLUR_MY_SHELL_PANEL_STYLES} from '../shared/blurMyShellUtils.js';
import {
    panelBlurIsActive,
    syncPanelBlurCornerRadius,
} from '../integration/blurMyShellRuntime.js';
import {
    panelBackgroundStyle,
    panelBorderStyle,
} from '../panel/panelBackgroundStyle.js';
import {
    PANEL_BLUR_CLASSES,
    syncPanelBlurClasses,
} from '../panel/panelBlurClasses.js';
import {DOCK_EDGE_GAP} from '../shared/panelSizing.js';
import {panelGeometry} from '../panel/panelGeometry.js';
import {
    panelIsVertical,
    panelPosition,
} from '../panel/panelPosition.js';
import {
    constrainTaskbarSize,
    PANEL_ITEM_GAP,
} from '../taskbar/taskbarLayout.js';
import {TaskbarWidthUpdater} from '../taskbar/taskbarWidthUpdater.js';
import {panelUsesLightTheme} from '../themeUtils.js';

const EXTERNAL_PANEL_STYLES = new Set(BLUR_MY_SHELL_PANEL_STYLES);
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
        mainPanelPosition,
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
    }) {
        this._settings = settings;
        this._monitor = monitor;
        this._mainPanelPosition = mainPanelPosition;
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
        this._signalHolder = new TransientSignalHolder();
        this._configuredIconSize = settings.getConfiguredIconSize();
        this._dockPanelLength = null;
        this._taskbarWidthUpdater = new TaskbarWidthUpdater(
            () => this._updateTaskbarWidthInternal()
        );
        this._dockStrutActor = null;
        this._activeWorkspace = null;
        this._workspaceWindows = new Set();
        this._lastPanelEdgeGap = null;
    }

    get strutActor() {
        return this._dockStrutActor;
    }

    enable() {
        this._syncWorkspaceWindows();
        this._createStrutActor();
        this._connectSignals();
    }

    destroy() {
        this._taskbarWidthUpdater.destroy();
        this._taskbarWidthUpdater = null;

        this._signalHolder.destroy();
        this._signalHolder = null;
        this._workspaceWindows.clear();
        this._activeWorkspace = null;

        if (this._dockStrutActor) {
            Main.layoutManager.removeChrome(this._dockStrutActor);
            this._dockStrutActor.destroy();
            this._dockStrutActor = null;
        }

        this._settings = null;
        this._monitor = null;
        this._mainPanelPosition = null;
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
        this._dockPanelLength = null;
    }

    getPanelLengthPercentage() {
        if (this._settings.get_boolean('dock-panel-mode'))
            return null;

        return this._settings.get_int('dock-max-length');
    }

    getPanelLengthOverride() {
        if (this._settings.get_boolean('dock-panel-mode'))
            return null;

        return this._dockPanelLength;
    }

    getPanelEdgeGap() {
        if (this._settings.get_boolean('dock-panel-mode'))
            return 0;

        if (Main.overview.visibleTarget)
            return DOCK_EDGE_GAP;

        if (!this._settings.get_boolean('panel-autohide-enabled') &&
            !this._settings.get_boolean('panel-dodge-windows-enabled') &&
            this._hasVisibleMaximizedWindowOnMonitor()) {
            return 0;
        }

        return DOCK_EDGE_GAP;
    }

    getLimitRevealToPanel() {
        return !this._settings.get_boolean('dock-panel-mode') &&
            this._settings.get_boolean('edge-reveal-enabled');
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
            this.getPanelLengthPercentage()
        );
        this._connectToMainPanel(geometry);
        return geometry;
    }

    getPositionState(animateEdgeGapRequested) {
        const edgeGap = this.getPanelEdgeGap();
        const edgeGapChanged = this._lastPanelEdgeGap !== null &&
            this._lastPanelEdgeGap !== edgeGap;
        const animateEdgeGap = animateEdgeGapRequested &&
            edgeGapChanged &&
            !this._settings.get_boolean('panel-autohide-enabled');
        this._lastPanelEdgeGap = edgeGap;
        return {
            geometry: this.getGeometry(),
            edgeGapChanged,
            animateEdgeGap,
            shouldSyncAutoHide: !animateEdgeGapRequested || edgeGapChanged,
        };
    }

    syncStrut() {
        if (!this._dockStrutActor)
            return;

        const strutGeometry = panelGeometry(
            this._settings,
            this._monitor,
            this._getPanelHeight() + this.getPanelEdgeGap(),
            0,
            100
        );
        this._dockStrutActor.set_position(
            strutGeometry.x,
            strutGeometry.y
        );
        this._dockStrutActor.set_size(
            strutGeometry.width,
            strutGeometry.height
        );
        Main.layoutManager._queueUpdateRegions();
    }

    updateTaskbarWidth() {
        this._taskbarWidthUpdater.update();
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

    syncTheme() {
        const dockFloating = !this._settings.get_boolean('dock-panel-mode');
        const cornerRadius = dockFloating
            ? this._settings.get_int('dock-corner-radius')
            : 0;
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
                !OWN_BLUR_CLASSES.has(style));
        const externalStyles = this._actor.get_style_class_name()
            .split(/\s+/)
            .filter(style => EXTERNAL_PANEL_STYLES.has(style));
        classes.push(...externalStyles);
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

        const blurActive = panelBlurIsActive(this._actor);
        syncPanelBlurClasses(this._actor, blurActive, light);
        syncPanelBlurCornerRadius(this._actor, cornerRadius);
        if (blurActive) {
            const borderStyle = panelBorderStyle(
                this._settings,
                light,
                borderEnabled,
                dockFloating,
                true
            );
            this._actor.set_style(
                cornerRadiusStyle
                    ? `${cornerRadiusStyle} ${borderStyle}`
                    : borderStyle
            );
            return;
        }
        this._actor.set_style(panelBackgroundStyle(
            this._settings,
            light,
            borderEnabled,
            cornerRadiusStyle,
            dockFloating
        ));
    }

    _createStrutActor() {
        if (this._settings.get_boolean('dock-panel-mode'))
            return;

        const strutGeometry = panelGeometry(
            this._settings,
            this._monitor,
            this._getPanelHeight() + this.getPanelEdgeGap(),
            0,
            100
        );
        this._dockStrutActor = new St.Widget({
            name: 'simple-taskbar-dock-strut',
            reactive: false,
            opacity: 0,
            x: strutGeometry.x,
            y: strutGeometry.y,
            width: strutGeometry.width,
            height: strutGeometry.height,
        });
        Shell.util_set_hidden_from_pick(this._dockStrutActor, true);
        Main.layoutManager.addChrome(this._dockStrutActor, {
            affectsStruts: true,
            trackFullscreen: true,
        });
    }

    _connectSignals() {
        global.workspace_manager.connectObject(
            'active-workspace-changed',
            () => {
                this._syncWorkspaceWindows();
                this._onPosition(true, true);
            },
            this._signalHolder
        );
        global.display.connectObject(
            'notify::focus-window',
            () => this._onPosition(true, true),
            'window-entered-monitor',
            () => this._onPosition(true, true),
            'window-left-monitor',
            () => this._onPosition(true, true),
            this._signalHolder
        );
        Main.overview.connectObject(
            'showing', () => this._onPosition(true, true),
            'hiding', () => this._onPosition(true, true),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::panel-autohide-enabled',
            () => this._onPosition(),
            'changed::panel-dodge-windows-enabled',
            () => this._onPosition(),
            'changed::icon-size',
            () => {
                this.resetIconSize();
                this._onPosition();
            },
            'changed::windows-xp-theme-enabled',
            () => this.resetIconSize(),
            this._signalHolder
        );
        if (this._settings.get_boolean('dock-panel-mode')) {
            Main.layoutManager.panelBox.connectObject(
                'notify::allocation', () => this._onPosition(),
                this._signalHolder
            );
        }
        for (const key of [
            'transparency-enabled',
            'transparency-level',
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
                this._signalHolder
            );
        }
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        themeContext.connectObject(
            'changed',
            () => this.syncTheme(),
            this._signalHolder
        );
        const stSettings = St.Settings.get();
        stSettings.connectObject(
            'notify::color-scheme',
            () => this.syncTheme(),
            this._signalHolder
        );
        this._settings.connectObject(
            'changed::dock-max-length',
            () => {
                this._dockPanelLength = null;
                this.updateTaskbarWidth();
            },
            'changed::dock-min-icon-size',
            () => {
                this.resetIconSize();
                this._onPosition();
            },
            this._signalHolder
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
                this._taskbarWidthUpdater.queue();
                return;
            }
        }

        if (this._settings.get_boolean('dock-panel-mode'))
            return;

        const requiredLength = this._panelContentLength(vertical);
        const maximumLength = vertical ? geometry.height : geometry.width;
        const panelLength = Math.min(
            maximumLength,
            Math.max(1, Math.ceil(requiredLength))
        );
        if (panelLength === this._dockPanelLength)
            return;

        this._dockPanelLength = panelLength;
        this._onPosition(false);
        this._taskbarWidthUpdater.queue();
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

    _syncWorkspaceWindows() {
        const workspace = global.workspace_manager.get_active_workspace();
        if (workspace === this._activeWorkspace)
            return;

        if (this._activeWorkspace)
            this._activeWorkspace.disconnectObject(this._signalHolder);
        for (const window of this._workspaceWindows)
            window.disconnectObject(this._signalHolder);
        this._workspaceWindows.clear();
        this._activeWorkspace = workspace;
        workspace.connectObject(
            'window-added',
            (_workspace, window) => {
                this._trackWorkspaceWindow(window);
                this._onPosition(true, true);
            },
            'window-removed',
            (_workspace, window) => {
                this._untrackWorkspaceWindow(window);
                this._onPosition(true, true);
            },
            this._signalHolder
        );
        for (const window of workspace.list_windows())
            this._trackWorkspaceWindow(window);
    }

    _trackWorkspaceWindow(window) {
        if (this._workspaceWindows.has(window))
            return;

        this._workspaceWindows.add(window);
        window.connectObject(
            'notify::maximized-horizontally',
            () => this._onPosition(true, true),
            'notify::maximized-vertically',
            () => this._onPosition(true, true),
            'notify::minimized',
            () => this._onPosition(true, true),
            this._signalHolder
        );
    }

    _untrackWorkspaceWindow(window) {
        if (!this._workspaceWindows.delete(window))
            return;

        window.disconnectObject(this._signalHolder);
    }

    _hasVisibleMaximizedWindowOnMonitor() {
        for (const window of this._workspaceWindows) {
            if (window.get_window_type() !== Meta.WindowType.DESKTOP &&
                window.get_monitor() === this._monitor.index &&
                !window.minimized &&
                window.maximized_horizontally &&
                window.maximized_vertically) {
                return true;
            }
        }

        return false;
    }

    _panelContentLength(vertical) {
        const crossSize = this._getPanelHeight();
        const contentLength = this._boxes.reduce((length, box) => {
            box.queue_relayout();
            return length + (vertical
                ? box.get_preferred_height(crossSize)[1]
                : box.get_preferred_width(crossSize)[1]);
        }, 0);
        return contentLength + PANEL_ITEM_GAP * 2;
    }

    _connectToMainPanel(geometry) {
        if (!this._settings.get_boolean('dock-panel-mode') ||
            !this._mainPanelPosition ||
            this._monitor !== Main.layoutManager.primaryMonitor) {
            return;
        }

        const panelBox = Main.layoutManager.panelBox;
        const [panelX, panelY] = panelBox.get_position();
        const panelWidth = panelBox.width;
        const panelHeight = panelBox.height;
        if (geometry.vertical &&
            (this._mainPanelPosition === 'top' ||
                this._mainPanelPosition === 'bottom')) {
            const panelEdge = this._mainPanelPosition === 'top'
                ? panelY + panelHeight
                : panelY;
            const maximumLength = this._mainPanelPosition === 'top'
                ? this._monitor.y + this._monitor.height - panelEdge
                : panelEdge - this._monitor.y;
            geometry.height = Math.min(geometry.height, maximumLength);
            geometry.y = this._mainPanelPosition === 'top'
                ? panelEdge
                : panelEdge - geometry.height;
        } else if (!geometry.vertical &&
            (this._mainPanelPosition === 'left' ||
                this._mainPanelPosition === 'right')) {
            const panelEdge = this._mainPanelPosition === 'left'
                ? panelX + panelWidth
                : panelX;
            const maximumLength = this._mainPanelPosition === 'left'
                ? this._monitor.x + this._monitor.width - panelEdge
                : panelEdge - this._monitor.x;
            geometry.width = Math.min(geometry.width, maximumLength);
            geometry.x = this._mainPanelPosition === 'left'
                ? panelEdge
                : panelEdge - geometry.width;
        }
    }
}
