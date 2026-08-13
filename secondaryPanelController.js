// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {
    ApplicationOverflowController,
} from './applicationOverflowController.js';
import {FolderMenuController} from './folderMenuController.js';
import {NotificationAreaController} from './notificationAreaController.js';
import {PanelAutoHideController} from './panelAutoHideController.js';
import {
    PanelButtonPaddingController,
} from './panelButtonPaddingController.js';
import {PanelInteractionController} from './panelInteractionController.js';
import {placePanelItems} from './panelItemOrder.js';
import {createPanelItems} from './panelItems.js';
import {panelIsTop} from './panelPosition.js';
import {
    QuickSettingsPowerController,
} from './quickSettingsPowerController.js';
import {
    QuickSettingsXpIconController,
} from './quickSettingsXpIconController.js';
import {SecondaryPanelActor} from './secondaryPanelActor.js';
import {
    SecondaryPanelIndicatorController,
} from './secondaryPanelIndicatorController.js';
import {StartButtonController} from './startButtonController.js';
import {TaskbarController} from './taskbarController.js';
import {constrainTaskbarWidth} from './taskbarLayout.js';
import {TaskbarViewport} from './taskbarViewport.js';
import {VolumeMixerController} from './volumeMixerController.js';
import {WindowController} from './windowController.js';
import {WindowPreviewController} from './windowPreviewController.js';

const EXTERNAL_PANEL_STYLES = new Set([
    'transparent-panel',
    'light-panel',
    'dark-panel',
    'contrasted-panel',
]);

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
        this._signals = [];
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
            settings
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

        this._taskbarViewport = new TaskbarViewport({
            style_class: 'simple-taskbar-bin',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            enable_mouse_scrolling: true,
            clip_to_allocation: true,
            x_expand: false,
        });
        this._taskbarViewport.add_child(this._taskbarController.actor);
        this._applicationOverflowController =
            new ApplicationOverflowController({
                settings,
                taskbarController: this._taskbarController,
                previewController: this._windowPreviews,
                viewport: this._taskbarViewport,
            });
        this._taskbarBin = this._applicationOverflowController.actor;
        this._taskbarBin.visible =
            !settings.get_boolean('default-gnome-panel');

        this.actor = new SecondaryPanelActor();
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
        Main.layoutManager.addChrome(this.actor, {
            affectsStruts: true,
            trackFullscreen: true,
        });
        this._position();
        this._applyLayout();
        this._syncTheme();
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
            positionActor: this.actor,
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
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];

        this._autoHideController.destroy();
        this._autoHideController = null;
        this._interactionController.destroy();
        this._interactionController = null;
        this._buttonPaddingController.destroy();
        this._buttonPaddingController = null;
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
        this._notificationAreaController.restore(this._rightBox);
        this._notificationAreaController.destroy();
        this._indicatorController.destroy();
        this._indicatorController = null;
        this._folderMenuController.destroy();
        this._folderMenuController = null;
        this._menuManager = null;

        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
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

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _connectSignals() {
        this._connect(Main.panel, 'notify::style-class', () => {
            this._syncTheme();
        });
        this._connect(Main.panel, 'notify::style', () => {
            this._syncTheme();
        });
        for (const box of [
            this._leftBox,
            this._centerBox,
            this._rightBox,
        ]) {
            this._connect(box, 'notify::width', () => {
                this._updateTaskbarWidth();
            });
        }
        this._connect(this._settings, 'changed::icon-size', () => {
            this._iconSize = this._settings.get_int('icon-size');
            this._startButtonController.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._taskbarController.setIconSize(this._iconSize);
            this._updateTaskbarWidth();
        });
        this._connect(this._settings, 'changed::panel-height', () => {
            this._panelHeight = this._settings.get_int('panel-height');
            this._taskbarController.setPanelHeight(this._panelHeight);
            this._position();
        });
        this._connect(this._settings, 'changed::icon-spacing', () => {
            this._applyAppearance();
            this._updateTaskbarWidth();
        });
        this._connect(this._settings, 'changed::default-gnome-panel', () => {
            this._syncTaskbarVisibility();
        });
        this._connect(
            this._settings,
            'changed::windows-xp-theme-enabled',
            () => {
                this._applyLayout();
                this._syncTheme();
            }
        );
        this._connect(this._settings, 'changed::app-alignment', () => {
            this._applyAppearance();
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::start-button-position', () => {
            this._applyLayout();
        });
        this._connect(
            this._settings,
            'changed::start-button-follow-app-alignment',
            () => this._applyLayout()
        );
        for (const key of [
            'windows-start-menu-enabled',
            'gnome-start-button-visible',
        ]) {
            this._connect(this._settings, `changed::${key}`, () => {
                this._applyLayout();
            });
        }
        this._connect(this._settings, 'changed::activities-button-visible', () => {
            this._indicatorController.syncActivitiesVisibility();
            this._updateTaskbarWidth();
        });
        this._connect(this._settings, 'changed::activities-button-position', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::clock-position', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::system-menu-position', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::folder-menu-enabled', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::folder-menu-position', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::panel-item-order', () => {
            this._applyLayout();
        });
        this._connect(this._settings, 'changed::start-button-padding', () => {
            this._startButtonController.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._updateTaskbarWidth();
        });
        for (const signal of ['child-added', 'child-removed']) {
            this._connect(this._taskbarController.actor, signal, () => {
                this._updateTaskbarWidth();
            });
        }
        this._connect(this._settings, 'changed::hide-app-labels', () => {
            this._updateTaskbarWidth();
        });
    }

    _applyAppearance() {
        this._startButtonController.applyAppearance(
            this._iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._taskbarController.applyAppearance();
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
        for (const actor of [
            startButton,
            this._taskbarBin,
            activities,
            quickSettings,
            dateMenu,
            folderMenuButton,
        ])
            actor.get_parent()?.remove_child(actor);

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
        this.actor.set_size(this._monitor.width, this._panelHeight);
        this.actor.x = this._monitor.x;
        if (this._autoHideController)
            this._autoHideController.syncPosition();
        else
            this.actor.y = panelIsTop(this._settings)
                ? this._monitor.y
                : this._monitor.y + this._monitor.height - this._panelHeight;
        this._updateTaskbarWidth();
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
        const availableWidth = constrainTaskbarWidth({
            taskbarBin: this._taskbarBin,
            leftBox: this._leftBox,
            centerBox: this._centerBox,
            rightBox: this._rightBox,
            panelWidth: this._monitor.width,
            panelHeight: this._panelHeight,
            centered: this._appsAreCentered(),
        });
        if (availableWidth !== undefined)
            this._taskbarController.setAvailableWidth(availableWidth);
    }

    _syncTheme() {
        const classes = Main.panel.get_style_class_name()
            .split(/\s+/)
            .filter(style => style && !EXTERNAL_PANEL_STYLES.has(style));
        classes.push('simple-taskbar-panel', 'simple-taskbar-secondary-panel');
        this.actor.set_style_class_name([...new Set(classes)].join(' '));
        this.actor.set_style(Main.panel.get_style());
    }

}
