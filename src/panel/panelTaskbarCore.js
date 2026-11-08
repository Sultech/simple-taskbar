// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {PanelInteractionController} from './panelInteractionController.js';
import {StartButtonController} from '../startMenu/startButtonController.js';
import {PanelIconSizer} from './panelIconSizer.js';
import {TaskbarController} from '../taskbar/taskbarController.js';
import {getTaskbarHoverAnimationNeighbours} from '../taskbar/taskbarHoverAnimationUtils.js';
import {createTaskbarViewport} from '../taskbar/taskbarViewportFactory.js';
import {TaskbarWindowController} from '../taskbar/taskbarWindowController.js';
import {WindowPreviewController} from '../taskbar/windowPreviewController.js';

export class PanelTaskbarCore {
    constructor({
        extensionDir,
        settings,
        appSystem,
        tracker,
        favorites,
        overlayModel,
        spreadAppWindows,
        openPreferences,
        getMonitor,
        getPositionActor,
        boxes,
        getPanelEdgeGap,
        panelHeight,
        iconSize,
        maximumIconSize,
        getConfiguredIconSize,
        isAdaptive,
        prepareEveryChange = false,
        beforeIconSizeApply,
        afterIconSizeApply,
        syncVerticalItems,
        syncPanelHeight,
        isPanelMenuOpen,
        isAutoHideHidden,
        onHoverAnimationReserveChanged,
        onHoverAnimationExtentsChanged,
        onRedisplay,
        onStartMenuOpenChanged,
        taskbarOptions = {},
        startButtonOptions = {},
    }) {
        this._isPanelMenuOpen = isPanelMenuOpen;
        this.interactionController = null;
        this.windowController = new TaskbarWindowController(tracker, {
            settings,
            spreadAppWindows,
            getMonitor,
            getTaskbarController: () => this.taskbarController,
            getPreviewController: () => this.windowPreviews,
        });
        this.taskbarController = new TaskbarController({
            settings,
            appSystem,
            tracker,
            favorites,
            overlayModel,
            iconSize,
            panelHeight,
            getInterestingWindows: app => this.windowController.getInterestingWindows(app),
            onAppClicked: (item, app, action) => this.windowController.handleAppClicked(item, app, action),
            onWindowClicked: window => this.windowController.handleWindowClicked(window),
            openNewWindow: app => this.windowController.openNewWindow(app),
            getPreviewController: () => this.windowPreviews,
            onRedisplay: () => {
                onRedisplay();
                this.overflowController.sync();
            },
            getPositionActor,
            getHoverAnimationMonitor: getMonitor,
            getPanelInteractionController: () => this.interactionController,
            getHoverAnimationNeighbours: () => getTaskbarHoverAnimationNeighbours(
                this.taskbarBin, this.startButtonController.panelActor, this.taskbarViewport, boxes),
            getHoverAnimationStartButton: () => this.startButtonController.actor,
            onHoverAnimationReserveChanged,
            onHoverAnimationExtentsChanged,
            isHoverAnimationBlocked: () => this.isInteractionBlocked(false) || isAutoHideHidden(),
            ...taskbarOptions,
        });
        this.taskbarController.setAlignmentActor(boxes[1]);
        this.windowPreviews = new WindowPreviewController(
            () => this.taskbarController.getItems(),
            app => this.windowController.getInterestingWindows(app),
            settings,
            () => this.overflowController.closeWithAnimation(),
            () => this.taskbarController.getHoverAnimationOutwardReserve(),
            () => this.taskbarController.isPointerInMagnifyBounds()
        );
        this.startButtonController = new StartButtonController({
            extensionDir,
            settings,
            iconSize,
            previewController: this.windowPreviews,
            getPanelEdgeGap,
            getMonitor,
            openPreferences,
            closeApp: (app, timestamp) => this.taskbarController.closeApp(app, timestamp),
            getInterestingWindows: app => this.windowController.getInterestingWindows(app),
            toggleDesktop: () => this.windowController.toggleDesktop(),
            onMenuOpenStateChanged: open => {
                this.taskbarController.setStartMenuOpen(open);
                onStartMenuOpenChanged(open);
                if (!open)
                    return;

                if (this.startButtonController.menuIsOpen)
                    this.taskbarController.dropHoverAnimations();
                this.overflowController.close();
            },
            ...startButtonOptions,
        });
        const {viewport, overflowController} = createTaskbarViewport({
            settings,
            taskbarController: this.taskbarController,
            previewController: this.windowPreviews,
        });
        this.taskbarViewport = viewport;
        this.overflowController = overflowController;
        this.taskbarBin = overflowController.actor;
        this.iconSizer = new PanelIconSizer({
            settings,
            taskbarController: this.taskbarController,
            startButtonController: this.startButtonController,
            overflowController,
            boxes,
            maximumIconSize,
            iconSize,
            getConfiguredIconSize,
            isAdaptive,
            prepareEveryChange,
            beforeApply: beforeIconSizeApply,
            afterApply: afterIconSizeApply,
            syncVerticalItems,
            syncPanelHeight,
        });
        this._settings = settings;
        this._openPreferences = openPreferences;
    }

    createInteractionController(options) {
        this.interactionController = new PanelInteractionController({
            settings: this._settings,
            taskbarController: this.taskbarController,
            taskbarBin: this.taskbarViewport,
            taskbarContainer: this.taskbarBin,
            previewController: this.windowPreviews,
            openPreferences: this._openPreferences,
            onAppScrolled: (item, direction) => this.windowController.handleAppScrolled(item, direction),
            onPanelScrolled: direction => this.windowController.handlePanelScrolled(direction),
            ...options,
        });
        return this.interactionController;
    }

    isInteractionBlocked(includeWindowPreviews) {
        return Boolean(
            this.interactionController.menuIsOpen ||
            this.startButtonController.menuIsOpen ||
            this.overflowController.menuIsOpen ||
            this._isPanelMenuOpen() ||
            (includeWindowPreviews && this.windowPreviews.isOpen) ||
            this.taskbarController.isDragging ||
            this.taskbarController.hasOpenMenu()
        );
    }

    onPanelHidden() {
        this.taskbarController.dropHoverAnimations();
        this.windowPreviews.hideTooltip(false);
    }

    applyAppearance() {
        this.startButtonController.applyAppearance(
            this.iconSizer.iconSize,
            this._settings.get_int('start-button-padding')
        );
        this.taskbarController.applyAppearance();
    }

    destroyInteractionController() {
        this.interactionController.destroy();
        this.interactionController = null;
    }

    destroy() {
        this.startButtonController.destroy();
        this.startButtonController = null;
        this.overflowController.destroy();
        this.overflowController = null;
        this.taskbarController.destroy();
        this.windowController.destroy();
        this.windowPreviews.destroy();
        this.windowPreviews = null;
        this.taskbarController = null;
        this.windowController = null;
        this.taskbarViewport.destroy();
        this.taskbarViewport = null;
        this.taskbarBin = null;
        this.iconSizer.destroy();
        this.iconSizer = null;
        this._isPanelMenuOpen = null;
        this._settings = null;
        this._openPreferences = null;
    }
}
