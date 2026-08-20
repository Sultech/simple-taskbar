// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {BLUR_MY_SHELL_PANEL_STYLES} from '../shared/blurMyShellUtils.js';
import {panelBlurIsActive} from '../integration/blurMyShellRuntime.js';
import {panelBackgroundStyle} from '../panel/panelBackgroundStyle.js';
import {
    PANEL_BLUR_CLASSES,
    syncPanelBlurClasses,
} from '../panel/panelBlurClasses.js';
import {FolderMenuController} from '../folderMenuController.js';
import {NotificationAreaController} from '../integration/notificationAreaController.js';
import {PanelAutoHideController} from '../panel/panelAutoHideController.js';
import {
    PanelActivitiesController,
} from '../panel/panelActivitiesController.js';
import {
    PanelButtonPaddingController,
} from '../panel/panelButtonPaddingController.js';
import {PanelClockController} from '../panel/panelClockController.js';
import {PanelInteractionController} from '../panel/panelInteractionController.js';
import {
    PanelVerticalItemsController,
} from '../panel/panelVerticalItemsController.js';
import {placePanelItems} from '../shared/panelItemOrder.js';
import {createPanelItems} from '../panel/panelItems.js';
import {panelGeometry} from '../panel/panelGeometry.js';
import {panelIsVertical} from '../panel/panelPosition.js';
import {
    QuickSettingsIndicatorsController,
} from '../panel/quickSettingsIndicatorsController.js';
import {
    QuickSettingsPowerController,
} from '../integration/quickSettingsPowerController.js';
import {
    QuickSettingsXpIconController,
} from '../integration/quickSettingsXpIconController.js';
import {SecondaryPanelActor} from './secondaryPanelActor.js';
import {
    SecondaryPanelIndicatorController,
} from './secondaryPanelIndicatorController.js';
import {StartButtonController} from '../startMenu/startButtonController.js';
import {TaskbarController} from '../taskbar/taskbarController.js';
import {constrainTaskbarSize} from '../taskbar/taskbarLayout.js';
import {createTaskbarViewport} from '../taskbar/taskbarViewportFactory.js';
import {VolumeMixerController} from '../integration/volumeMixerController.js';
import {WindowController} from '../taskbar/windowController.js';
import {WindowPreviewController} from '../taskbar/windowPreviewController.js';

const EXTERNAL_PANEL_STYLES = new Set(BLUR_MY_SHELL_PANEL_STYLES);
const OWN_BLUR_CLASSES = new Set(PANEL_BLUR_CLASSES);

export class SecondaryPanelController {
    constructor({
        extensionDir,
        settings,
        appSystem,
        tracker,
        favorites,
        spreadAppWindows,
        monitor,
        openPreferences,
    }) {
        this._settings = settings;
        this._extensionDir = extensionDir;
        this._monitor = monitor;
        this._openPreferencesCallback = openPreferences;
        this._signalHolder = new TransientSignalHolder();
        this._panelHeight = settings.get_int('panel-height');
        this._iconSize = settings.get_int('icon-size');

        this._windowController = new WindowController(tracker, {
            settings,
            spreadAppWindows,
            getMonitor: () => this._monitor,
            getTaskbarController: () => this._taskbarController,
            getPreviewController: () => this._windowPreviews,
        });
        this._taskbarController = new TaskbarController({
            settings,
            appSystem,
            tracker,
            favorites,
            iconSize: this._iconSize,
            panelHeight: this._panelHeight,
            getInterestingWindows: app =>
                this._windowController.getInterestingWindows(app),
            onAppClicked: (item, app) =>
                this._windowController.handleAppClicked(item, app),
            onWindowClicked: window =>
                this._windowController.handleWindowClicked(window),
            openNewWindow: app => this._windowController.openNewWindow(app),
            getPreviewController: () => this._windowPreviews,
        });
        this._windowPreviews = new WindowPreviewController(
            () => this._taskbarController.getItems(),
            app => this._windowController.getInterestingWindows(app),
            settings,
            () => this._applicationOverflowController.closeWithAnimation()
        );
        this._startButtonController = new StartButtonController({
            extensionDir,
            settings,
            iconSize: this._iconSize,
            previewController: this._windowPreviews,
            openPreferences,
            closeApp: (app, timestamp) =>
                this._taskbarController.closeApp(app, timestamp),
            getInterestingWindows: app =>
                this._windowController.getInterestingWindows(app),
            manageKeybindings: false,
            onMenuOpenStateChanged: open => {
                this._taskbarController.setStartMenuOpen(open);
                this._autoHideController.setMenuOpen(open);
                if (open)
                    this._applicationOverflowController.close();
            },
        });
        this._folderMenuController = new FolderMenuController(settings);

        const {viewport, overflowController} = createTaskbarViewport({
            settings,
            taskbarController: this._taskbarController,
            previewController: this._windowPreviews,
        });
        this._taskbarViewport = viewport;
        this._applicationOverflowController = overflowController;
        this._taskbarBin = overflowController.actor;

        this._panelBox = new St.Widget({name: 'panelBox'});
        this.actor = new SecondaryPanelActor();
        this._panelBox.add_child(this.actor);
        this._leftBox = this.actor.leftBox;
        this._centerBox = this.actor.centerBox;
        this._rightBox = this.actor.rightBox;
        this._buttonPaddingController = new PanelButtonPaddingController(
            settings,
            this.actor,
            [this._leftBox, this._centerBox, this._rightBox]
        );
        this._taskbarController.setAlignmentActor(this._centerBox);
        this._interactionController = null;
        this._autoHideController = null;
        this._menuManager = null;
        this._indicatorController = null;
        this._volumeMixerController = null;
        this._quickSettingsPowerController = null;
        this._quickSettingsXpIconController = null;
        this._notificationAreaController = new NotificationAreaController();
        this._quickSettingsIndicatorsController = null;
        this._activitiesController = null;
        this._clockController = null;
        this._verticalItemsController = new PanelVerticalItemsController(
            settings,
            [this._leftBox, this._centerBox, this._rightBox],
            () => this._panelHeight,
            () => this._buttonPaddingController.effectivePadding()
        );
    }

    enable() {
        this._menuManager = new PopupMenu.PopupMenuManager(this.actor);
        this._folderMenuController.enable(this._menuManager);
        this._indicatorController =
            new SecondaryPanelIndicatorController(
                this._settings,
                this._menuManager
            );
        this._indicatorController.acquire();
        const quickSettings = this._indicatorController.get('quickSettings');
        const activities = this._indicatorController.get('activities');
        const dateMenu = this._indicatorController.get('dateMenu');
        this._quickSettingsIndicatorsController =
            new QuickSettingsIndicatorsController(quickSettings._indicators);
        this._syncQuickSettingsIndicators();
        this._activitiesController = new PanelActivitiesController(
            this._settings,
            activities
        );
        this._activitiesController.enable();
        this._clockController = new PanelClockController(
            this._settings,
            dateMenu,
            () => this._panelHeight
        );
        this._clockController.enable();
        this._volumeMixerController = new VolumeMixerController(
            this._settings,
            quickSettings
        );
        this._volumeMixerController.enable();
        this._quickSettingsPowerController = new QuickSettingsPowerController(
            this._settings,
            quickSettings
        );
        this._quickSettingsPowerController.enable();
        this._quickSettingsXpIconController =
            new QuickSettingsXpIconController(
                this._settings,
                this._extensionDir,
                quickSettings
            );
        this._quickSettingsXpIconController.enable();
        Main.layoutManager.addChrome(this._panelBox, {
            affectsStruts: true,
            trackFullscreen: true,
        });
        this._position();
        this._applyLayout();
        this.syncTheme();
        this._buttonPaddingController.enable();
        this._startButtonController.enable();
        this._applicationOverflowController.enable();
        this._taskbarController.enable();
        this._interactionController = new PanelInteractionController({
            settings: this._settings,
            taskbarController: this._taskbarController,
            taskbarBin: this._taskbarViewport,
            taskbarContainer: this._taskbarBin,
            previewController: this._windowPreviews,
            openPreferences: this._openPreferencesCallback,
            panelActor: this.actor,
            panelBoxes: [this._leftBox, this._centerBox, this._rightBox],
        });
        this._interactionController.enable();
        this._autoHideController = new PanelAutoHideController({
            settings: this._settings,
            panelActor: this.actor,
            positionActor: this._panelBox,
            getMonitor: () => this._monitor,
            getPanelHeight: () => this._panelHeight,
            isBlocked: () => this._autoHideIsBlocked(),
        });
        this._autoHideController.enable();
        this._connectSignals();
    }

    containsPoint(x, y) {
        return x >= this._monitor.x &&
            x < this._monitor.x + this._monitor.width &&
            y >= this._monitor.y &&
            y < this._monitor.y + this._monitor.height;
    }

    toggleStartMenu() {
        this._startButtonController.toggleStartMenu();
    }

    closeStartMenus() {
        this._startButtonController.closeMenus();
    }

    closePanelMenu() {
        this._menuManager.activeMenu?.close();
        this._applicationOverflowController.close();
    }

    destroy() {
        this._signalHolder.destroy();
        this._signalHolder = null;

        this._autoHideController.destroy();
        this._autoHideController = null;
        this._interactionController.destroy();
        this._interactionController = null;
        this._buttonPaddingController.destroy();
        this._buttonPaddingController = null;
        this._verticalItemsController.destroy();
        this._verticalItemsController = null;
        this._activitiesController.destroy();
        this._activitiesController = null;
        this._clockController.destroy();
        this._clockController = null;
        this._startButtonController.destroy();
        this._startButtonController = null;
        this._windowController.destroy();
        this._applicationOverflowController.destroy();
        this._applicationOverflowController = null;
        this._taskbarController.destroy();
        this._windowPreviews.destroy();
        this._windowPreviews = null;
        this._taskbarController = null;
        this._windowController = null;
        this._taskbarViewport.destroy();
        this._taskbarViewport = null;
        this._volumeMixerController.destroy();
        this._volumeMixerController = null;
        this._quickSettingsXpIconController.destroy();
        this._quickSettingsXpIconController = null;
        this._quickSettingsPowerController.destroy();
        this._quickSettingsPowerController = null;
        this._notificationAreaController.destroy();
        this._quickSettingsIndicatorsController.destroy();
        this._quickSettingsIndicatorsController = null;
        this._indicatorController.destroy();
        this._indicatorController = null;
        this._folderMenuController.destroy();
        this._folderMenuController = null;
        this._menuManager = null;

        Main.layoutManager.removeChrome(this._panelBox);
        this._panelBox.destroy();
        this._panelBox = null;
        this.actor = null;
        this._leftBox = null;
        this._centerBox = null;
        this._rightBox = null;
        this._notificationAreaController = null;
        this._taskbarBin = null;
        this._monitor = null;
        this._extensionDir = null;
        this._openPreferencesCallback = null;
        this._settings = null;
    }

    _connectSignals() {
        Main.panel.connectObject('notify::style-class', () => {
            this.syncTheme();
        }, this._signalHolder);
        Main.panel.connectObject('notify::style', () => {
            this.syncTheme();
        }, this._signalHolder);
        for (const box of [
            this._leftBox,
            this._centerBox,
            this._rightBox,
        ]) {
            box.connectObject(
                'notify::width', () => this._updateTaskbarWidth(),
                'notify::height', () => this._updateTaskbarWidth(),
                this._signalHolder
            );
        }
        this._settings.connectObject('changed::icon-size', () => {
            this._iconSize = this._settings.get_int('icon-size');
            this._startButtonController.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._taskbarController.setIconSize(this._iconSize);
            this._verticalItemsController.sync();
            this._updateTaskbarWidth();
        }, this._signalHolder);
        this._settings.connectObject('changed::panel-height', () => {
            this._panelHeight = this._settings.get_int('panel-height');
            this._taskbarController.setPanelHeight(this._panelHeight);
            this._position();
        }, this._signalHolder);
        this._settings.connectObject('changed::icon-spacing', () => {
            this._applyAppearance();
            this._updateTaskbarWidth();
        }, this._signalHolder);
        this._settings.connectObject('changed::default-gnome-panel', () => {
            this._syncTaskbarVisibility();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::windows-xp-theme-enabled',
            () => {
                this._applyLayout();
                this.syncTheme();
            },
            this._signalHolder
        );
        this._settings.connectObject('changed::app-alignment', () => {
            this._applyAppearance();
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::start-button-position', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::start-button-follow-app-alignment',
            () => this._applyLayout(),
            this._signalHolder
        );
        for (const key of [
            'windows-start-menu-enabled',
            'gnome-start-button-visible',
        ]) {
            this._settings.connectObject(`changed::${key}`, () => {
                this._applyLayout();
            }, this._signalHolder);
        }
        this._settings.connectObject('changed::activities-button-visible', () => {
            this._indicatorController.syncActivitiesVisibility();
            this._updateTaskbarWidth();
        }, this._signalHolder);
        this._settings.connectObject('changed::activities-button-position', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::clock-position', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::system-menu-position', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::folder-menu-enabled', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::folder-menu-position', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::panel-item-order', () => {
            this._applyLayout();
        }, this._signalHolder);
        this._settings.connectObject('changed::start-button-padding', () => {
            this._startButtonController.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._verticalItemsController.sync();
            this._updateTaskbarWidth();
        }, this._signalHolder);
        for (const signal of ['child-added', 'child-removed']) {
            this._taskbarController.actor.connectObject(signal, () => {
                this._updateTaskbarWidth();
            }, this._signalHolder);
        }
        this._settings.connectObject('changed::hide-app-labels', () => {
            this._updateTaskbarWidth();
        }, this._signalHolder);
        this._settings.connectObject('changed::panel-button-padding', () => {
            this._syncQuickSettingsIndicators();
            this._updateTaskbarWidth();
        }, this._signalHolder);
    }

    _applyAppearance() {
        this._startButtonController.applyAppearance(
            this._iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._taskbarController.applyAppearance();
        this._verticalItemsController.sync();
    }

    _syncTaskbarVisibility() {
        const visible = !this._settings.get_boolean('default-gnome-panel');
        this._taskbarBin.visible = visible;
        if (!visible) {
            this._windowPreviews.hideTooltip(false);
            this._windowPreviews.hide();
        }
        this._applyLayout();
    }

    _applyLayout() {
        this.actor.adaptiveCenter =
            this._taskbarBin.visible && this._appsAreCentered();
        this.actor.expandedSide =
            this._taskbarBin.visible && !this._appsAreCentered();
        const startButton = this._startButtonController.actor;
        const activities = this._indicatorController.get('activities').container;
        const quickSettings = this._indicatorController.get('quickSettings').container;
        const dateMenu = this._indicatorController.get('dateMenu').container;
        const folderMenuButton = this._folderMenuController.actor;

        const windowsXpThemeEnabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        this._notificationAreaController.sync(
            windowsXpThemeEnabled ? [quickSettings, dateMenu] : [],
            dateMenu,
            windowsXpThemeEnabled
        );
        this._indicatorController.syncPopupOffsets();

        const boxes = {
            left: this._leftBox,
            center: this._centerBox,
            right: this._rightBox,
        };
        const items = createPanelItems({
            settings: this._settings,
            windowsXpThemeEnabled,
            actors: {
                startButton,
                activities,
                taskbar: this._taskbarBin,
                folderMenu: folderMenuButton,
                quickSettings,
                dateMenu,
                notificationArea: this._notificationAreaController.actor,
            },
            includeTrayOverflow: false,
            includeShowDesktop: false,
        });
        placePanelItems(
            boxes,
            items,
            this._settings.get_strv('panel-item-order')
        );
        this._notificationAreaController.syncRightBoxActors(
            this._rightBox,
            new Set(items.map(item => item.actor)),
            new Set([folderMenuButton]),
            windowsXpThemeEnabled
        );
        this._indicatorController.syncActivitiesVisibility();
        this._applyAppearance();
        this._updateTaskbarWidth();
    }

    _appsAreCentered() {
        return this._settings.get_string('app-alignment') === 'center';
    }

    _position() {
        const geometry = panelGeometry(
            this._settings,
            this._monitor,
            this._panelHeight
        );
        this._panelBox.set_size(geometry.width, geometry.height);
        this.actor.set_size(geometry.width, geometry.height);
        this._panelBox.set_position(geometry.x, geometry.y);
        this.actor.vertical = geometry.vertical;
        const orientation = geometry.vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        for (const box of [this._leftBox, this._centerBox, this._rightBox])
            box.orientation = orientation;
        this._syncQuickSettingsIndicators();
        this._verticalItemsController.sync();
        if (this._autoHideController)
            this._autoHideController.syncPosition();
        this._updateTaskbarWidth();
    }

    _syncQuickSettingsIndicators() {
        this._quickSettingsIndicatorsController.sync(
            panelIsVertical(this._settings),
            this._buttonPaddingController.effectivePadding()
        );
    }

    _autoHideIsBlocked() {
        return Boolean(
            this._interactionController.menuIsOpen ||
            this._startButtonController.menuIsOpen ||
            this._folderMenuController.menuIsOpen ||
            this._applicationOverflowController.menuIsOpen ||
            this._windowPreviews.isOpen ||
            this._taskbarController.isDragging ||
            this._taskbarController.hasOpenMenu() ||
            this._menuManager.activeMenu?.isOpen
        );
    }

    _updateTaskbarWidth() {
        const vertical = panelIsVertical(this._settings);
        const availableWidth = constrainTaskbarSize({
            taskbarBin: this._taskbarBin,
            leftBox: this._leftBox,
            centerBox: this._centerBox,
            rightBox: this._rightBox,
            panelLength: vertical
                ? this._monitor.height
                : this._monitor.width,
            panelThickness: this._panelHeight,
            centered: this._appsAreCentered(),
            vertical,
        });
        if (availableWidth !== undefined)
            this._taskbarController.setAvailableWidth(availableWidth);
    }

    syncTheme() {
        const classes = Main.panel.get_style_class_name()
            .split(/\s+/)
            .filter(style => style && !EXTERNAL_PANEL_STYLES.has(style) &&
                !OWN_BLUR_CLASSES.has(style));
        const externalStyles = this.actor.get_style_class_name()
            .split(/\s+/)
            .filter(style => EXTERNAL_PANEL_STYLES.has(style));
        classes.push(...externalStyles);
        classes.push('simple-taskbar-panel', 'simple-taskbar-secondary-panel');
        this.actor.set_style_class_name([...new Set(classes)].join(' '));
        if (this._settings.get_boolean('windows-xp-theme-enabled')) {
            this.actor.set_style(Main.panel.get_style());
            return;
        }

        const light = Main.panel.has_style_class_name(
            'simple-taskbar-theme-light'
        );
        const blurActive = panelBlurIsActive(this.actor);
        syncPanelBlurClasses(this.actor, blurActive, light);
        if (blurActive) {
            this.actor.set_style('');
            return;
        }
        this.actor.set_style(panelBackgroundStyle(
            this._settings,
            light,
            !Main.panel.has_style_class_name('simple-taskbar-border-disabled')
        ));
    }

}
