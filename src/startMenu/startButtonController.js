// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {StartMenuKeybindings} from './startMenuKeybindings.js';
import {StartButtonMenuController} from './startButtonMenuController.js';
import {WindowsXpStartButton} from './windowsXpStartButton.js';
import {clickCameFromKeyboard, isPrimaryPressOrTouch} from '../inputUtils.js';
import {TaskbarItemContainer} from '../taskbar/taskbarItemContainer.js';
import {
    BLUR_MY_SHELL_UUID,
    blurMyShellHasKey,
    getBlurMyShellChildSettings,
    getBlurMyShellSettings,
} from '../shared/blurMyShellUtils.js';
import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {
    taskbarGlassHeight,
    taskbarHighlightLength,
    taskbarIconButtonWidth,
    taskbarCrossAxisParityOffset,
    taskbarPanelHeight,
    taskbarVisualPanelHeight,
    taskbarVerticalItemExtent,
} from '../shared/panelSizing.js';
import {
    CLASSIC_HIGHLIGHT_SETTINGS,
    HIGHLIGHT_LENGTH_SETTING_KEYS,
    HIGHLIGHT_SIZE_SETTING_KEYS,
    TASKBAR_HIGHLIGHT_SETTING_KEYS,
    TASKBAR_HIGHLIGHT_STYLE,
    customClassicHighlightColorStyle,
} from '../shared/classicHighlightSettings.js';
import {normalizePanelItemOrder} from '../shared/panelItemOrder.js';
import {
    RUNNING_INDICATOR_RESERVE_SETTING_KEYS,
    runningIndicatorLeftReserve,
    runningIndicatorReserveOffset,
    runningIndicatorRightReserve,
    runningIndicatorVerticalOffset,
} from '../shared/runningIndicatorSettings.js';
import {
    createTaskbarSeparator,
    resetSeparatorToTarget,
    syncSeparatorGeometry,
    syncSeparatorVisibility,
} from '../taskbar/taskbarSeparator.js';
import {REFLOW_ANIMATION_TIME} from '../taskbar/reflowAnimation.js';
import {startButtonVisible} from '../shared/startButtonLocation.js';
import {bundledStartIconFile, isBundledStartIcon} from '../shared/startIcons.js';
import {setStylePseudoClass} from '../shared/styleUtils.js';
import {
    applyIconRenderScale,
    hoverRenderScale,
    iconRenderScale,
} from '../shared/applicationHoverAnimation.js';
import {
    START_BUTTON_LOCATION_KEY,
    panelApplicationAlignment,
    panelStartButtonPosition,
} from '../shared/panelModeSettings.js';

export class StartButtonController {
    constructor({
        extensionDir,
        settings,
        keybindingSettings = settings,
        iconSize,
        previewController,
        openPreferences,
        closeApp,
        getInterestingWindows,
        manageKeybindings = true,
        toggleFromShortcut = null,
        switcherKeybindings = null,
        toggleDesktop,
        onMenuOpenStateChanged,
        getPanelEdgeGap = () => 0,
        getMonitor,
    }) {
        this._extensionDir = extensionDir;
        this._settings = settings;
        this._previews = previewController;
        this._blurMyShellComponentSettings = [];
        this._positionAnimationStart = null;
        this._parityOffset = 0;
        this._edgePaddingSide = null;
        this._edgePadding = 0;

        this._windowsGIcon = new Gio.FileIcon({
            file: extensionDir
                .get_child('icons')
                .get_child('start')
                .get_child('gnome-start-symbolic.svg'),
        });
        this._powerGIcon = new Gio.FileIcon({
            file: extensionDir
                .get_child('icons')
                .get_child('start')
                .get_child('power-symbolic.svg'),
        });
        this._settingsGIcon = new Gio.FileIcon({
            file: extensionDir
                .get_child('icons')
                .get_child('start')
                .get_child('settings-symbolic.svg'),
        });
        this._gnomeGIcon = new Gio.ThemedIcon({
            name: 'view-app-grid-symbolic',
        });
        this._windowsXpStartButton = new WindowsXpStartButton();
        this._iconSize = iconSize;
        this._icon = new St.Icon({
            gicon: this._currentGIcon(),
            icon_size: iconSize,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._content = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        this._contentContainer = new TaskbarItemContainer();
        this._contentContainer.setSnapChildAllocation(true);
        this._contentContainer.x_align = Clutter.ActorAlign.FILL;
        this._contentContainer.y_align = Clutter.ActorAlign.FILL;
        this._contentContainer.x_expand = true;
        this._contentContainer.y_expand = true;
        this._contentContainer.scale_x = 1;
        this._contentContainer.scale_y = 1;
        this._contentContainer.opacity = 255;
        this._contentContainer.setChild(this._content);
        this._hover = new St.Widget({
            style_class: 'simple-taskbar-start-hover',
            reactive: false,
        });
        this._classicHover = new St.Widget({
            style_class: 'simple-taskbar-start-classic-hover',
            reactive: false,
            visible: false,
        });
        this._highlightRenderScale = 1;
        this._highlightHost = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            reactive: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._highlightHost.add_child(this._hover);
        this._highlightHost.add_child(this._classicHover);
        this._content.add_child(this._highlightHost);
        this._content.add_child(this._icon);
        this.actor = new St.Button({
            style_class: 'panel-button simple-taskbar-start',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: this._accessibleName(),
            child: this._settings.get_boolean('windows-xp-theme-enabled')
                ? this._windowsXpStartButton.actor
                : this._contentContainer,
        });
        const {separator, line} = createTaskbarSeparator();
        this._separator = separator;
        this._separator.visible = false;
        this._separatorLine = line;
        this._separatorVertical = null;
        this.panelActor = new St.BoxLayout({
            reactive: false,
        });
        this.panelActor.add_child(this.actor);
        this.panelActor.add_child(this._separator);
        this.panelActor.connectObject(
            'notify::allocation', () => this._animatePosition(),
            this
        );
        this.actor.connectObject(
            'captured-event', (_actor, event) => this._onButtonEvent(event),
            'clicked', () => {
                if (clickCameFromKeyboard())
                    this._activate();
            },
            'notify::hover', () => this._syncClassicHighlight(),
            'notify::pressed', () => this._syncClassicHighlight(),
            'notify::checked', () => this._syncClassicHighlight(),
            'notify::pseudo-class', () => this._syncClassicHighlight(),
            this
        );
        this._syncWindowsXpStartButton();
        this._syncVisibility();

        this._menuController = new StartButtonMenuController({
            settings,
            actor: this.actor,
            previewController,
            openPreferences,
            openFileManager: () => this._openFileManager(),
            closeApp,
            getInterestingWindows,
            getPanelEdgeGap,
            getMonitor,
            getPanelHeight: () => taskbarPanelHeight(this._settings, this._iconSize),
            toggleFromShortcut,
            toggleDesktop,
            onMenuOpenStateChanged,
            powerGIcon: this._powerGIcon,
            settingsGIcon: this._settingsGIcon,
        });
        this._keybindings = manageKeybindings
            ? new StartMenuKeybindings(
                keybindingSettings,
                () => this._menuController.toggleApplicationsFromShortcut(),
                () => this._menuController.toggleOverviewFromShortcut(),
                () => this._openFileManager(),
                switcherKeybindings
            )
            : null;
        this.applyAppearance(iconSize, settings.get_int('start-button-padding'));
    }

    enable() {
        this._menuController.enable();
        this._connectStateSignals();
        this._connectBlurMyShellSignals();
        this._menuController.syncState();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this.actor.disconnectObject(this);
        this.panelActor.disconnectObject(this);
        Main.uiGroup.disconnectObject(this);
        Main.extensionManager.disconnectObject(this);
        Main.panel.disconnectObject(this);
        St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);
        St.Settings.get().disconnectObject(this);
        for (const componentSettings of this._blurMyShellComponentSettings)
            componentSettings.disconnectObject(this);
        this._blurMyShellComponentSettings = null;

        this._keybindings?.destroy();
        this._keybindings = null;
        this._menuController.destroy();
        this._menuController = null;
        this._windowsXpStartButton.destroy();
        this._windowsXpStartButton = null;
        this.panelActor.destroy();
        this.panelActor = null;
        this.actor = null;

        this._separator = null;
        this._separatorLine = null;
        this._separatorVertical = null;
        this._hover = null;
        this._classicHover = null;
        this._highlightHost = null;
        this._contentContainer = null;
        this._content = null;
        this._icon = null;
        this._windowsGIcon = null;
        this._powerGIcon = null;
        this._settingsGIcon = null;
        this._gnomeGIcon = null;
        this._extensionDir = null;
        this._previews = null;
        this._settings = null;
        this._positionAnimationStart = null;
    }

    get menuIsOpen() {
        return this._menuController.menuIsOpen;
    }

    toggleStartMenu() {
        this._menuController.toggleStartMenu();
    }

    closeMenus() {
        this._menuController.closeMenus();
    }

    syncKeybindings() {
        this._keybindings?.sync();
    }

    setEdgePadding(side, padding) {
        const edgePadding = side ? padding : 0;
        if (side === this._edgePaddingSide && edgePadding === this._edgePadding)
            return;

        this._edgePaddingSide = side;
        this._edgePadding = edgePadding;
        this.applyAppearance(this._iconSize, this._settings.get_int('start-button-padding'));
    }

    applyAppearance(iconSize, padding) {
        this._iconSize = iconSize;
        applyIconRenderScale(this._icon, iconSize, iconRenderScale(this._settings));
        const windowsXpTheme = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const vertical = panelIsVertical(this._settings);
        const floatingDock = this._settings.isDock &&
            !this._settings.get_boolean('dock-panel-mode');
        const glassWidth = windowsXpTheme
            ? this._windowsXpStartButton.width
            : taskbarIconButtonWidth(iconSize);
        const visualPanelHeight = taskbarVisualPanelHeight(
            this._settings,
            taskbarPanelHeight(this._settings, iconSize),
            iconSize,
            floatingDock
        );
        const glassHeight = taskbarGlassHeight(
            this._settings,
            visualPanelHeight,
            windowsXpTheme,
            iconSize
        );
        const iconSpacing = windowsXpTheme
            ? 0
            : Math.max(this._settings.get_int('icon-spacing'), 0);
        const indicatorPosition = this._settings.get_string(
            'running-indicator-position'
        );
        const leftReserve = runningIndicatorLeftReserve(
            this._settings,
            indicatorPosition
        );
        const rightReserve = runningIndicatorRightReserve(
            this._settings,
            indicatorPosition
        );
        const glassMainExtent = vertical
            ? Math.max(
                taskbarVerticalItemExtent(
                    this._settings,
                    iconSize,
                    indicatorPosition
                ),
                taskbarHighlightLength(this._settings, iconSize)
            )
            : Math.max(
                glassWidth + leftReserve + rightReserve,
                taskbarHighlightLength(this._settings, iconSize)
            );
        const glassCrossExtent = glassHeight;
        const width = windowsXpTheme
            ? this._windowsXpStartButton.width
            : glassMainExtent + iconSpacing;
        const highlightWidth = vertical ? glassCrossExtent : glassMainExtent;
        const highlightHeight = vertical ? glassMainExtent : glassCrossExtent;
        this._highlightRenderScale = hoverRenderScale(this._settings);
        this._highlightHost.set_size(highlightWidth, highlightHeight);
        for (const layer of [this._hover, this._classicHover]) {
            layer.set_position(0, 0);
            layer.set_size(
                highlightWidth * this._highlightRenderScale,
                highlightHeight * this._highlightRenderScale
            );
            layer.set_scale(1 / this._highlightRenderScale, 1 / this._highlightRenderScale);
        }
        this._syncClassicHighlight();
        this._parityOffset = vertical
            ? taskbarCrossAxisParityOffset(
                this._settings,
                visualPanelHeight,
                iconSize
            )
            : 0;
        this._content.translation_x = this._parityOffset;
        this._icon.translation_x = vertical
            ? 0
            : runningIndicatorReserveOffset(leftReserve, rightReserve);
        this._icon.translation_y = vertical
            ? runningIndicatorVerticalOffset(this._settings, indicatorPosition)
            : 0;
        const startButtonPosition = panelStartButtonPosition(this._settings);
        const leadingPadding = (!windowsXpTheme &&
            startButtonPosition === 'left'
            ? padding
            : 0) + (this._edgePaddingSide === (vertical ? 'top' : 'left') ? this._edgePadding : 0);
        const trailingPadding = (!windowsXpTheme &&
            startButtonPosition === 'right'
            ? padding
            : 0) + (this._edgePaddingSide === (vertical ? 'bottom' : 'right') ? this._edgePadding : 0);
        if (vertical) {
            this._content.set_width(-1);
            this._content.set_height(width);
            this.actor.set_width(-1);
            this.actor.set_height(width + leadingPadding + trailingPadding);
            this.actor.set_style(
                `min-width: 0; margin: 0; padding: ${leadingPadding}px 0 ${trailingPadding}px 0;` +
                `margin-right: ${windowsXpTheme ? 6 : 0}px;`
            );
            this._syncSeparator(false);
            return;
        }

        this._content.set_height(
            visualPanelHeight
        );
        this.actor.set_height(visualPanelHeight);
        this._content.set_width(width);
        this.actor.set_width(width + leadingPadding + trailingPadding);
        const borderStyle = windowsXpTheme ? '' : ' border-width: 0;';
        this.actor.set_style(
            `min-width: 0; margin: 0;${borderStyle}` +
                ` padding: 0 ${trailingPadding}px 0 ${leadingPadding}px;`
        );
        this._syncSeparator(false);
    }

    preparePositionAnimation() {
        if (!St.Settings.get().enable_animations ||
            !this.panelActor.has_allocation()) {
            return;
        }

        const [x, y] = this.panelActor.get_transformed_position();
        this._positionAnimationStart = {x, y};
    }

    _animatePosition() {
        if (!this._positionAnimationStart)
            return;

        const start = this._positionAnimationStart;
        this._positionAnimationStart = null;
        this.panelActor.remove_transition('translation-x');
        this.panelActor.remove_transition('translation-y');
        this.panelActor.translation_x = 0;
        this.panelActor.translation_y = 0;
        const [targetX, targetY] =
            this.panelActor.get_transformed_position();
        const translationX = start.x - targetX;
        const translationY = start.y - targetY;
        if (translationX === 0 && translationY === 0)
            return;

        this.panelActor.translation_x = translationX;
        this.panelActor.translation_y = translationY;
        this.panelActor.ease({
            translation_x: 0,
            translation_y: 0,
            duration: REFLOW_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    _connectBlurMyShellSignals() {
        Main.uiGroup.connectObject('notify::style-class', () => {
            this._menuController.startMenu?.queueTransparencySync();
        }, this);
        Main.extensionManager.connectObject(
            'extension-state-changed',
            (_manager, extension) => {
                if (extension.uuid === BLUR_MY_SHELL_UUID)
                    this._menuController.startMenu?.queueTransparencySync();
            },
            this
        );

        const settings = getBlurMyShellSettings();
        if (!settings)
            return;

        const popupSettings = getBlurMyShellChildSettings(settings, 'popup');
        const panelSettings = getBlurMyShellChildSettings(settings, 'panel');
        this._blurMyShellComponentSettings = [popupSettings, panelSettings]
            .filter(componentSettings => componentSettings);
        for (const [componentSettings, key] of [
            [popupSettings, 'blur'],
            [popupSettings, 'override-background'],
            [popupSettings, 'style-popup'],
            [popupSettings, 'menu-corner-radius'],
            [panelSettings, 'blur'],
        ]) {
            if (!componentSettings ||
                !blurMyShellHasKey(componentSettings, key)) {
                continue;
            }
            componentSettings.connectObject(
                `changed::${key}`,
                () => this._menuController.startMenu?.queueTransparencySync(),
                this
            );
        }
    }

    _connectStateSignals() {
        this._settings.connectObject('changed::windows-start-menu-enabled', () => {
            this._menuController.startMenu?.close();
            if (this._menuController.windowsModeEnabled)
                this._menuController.ensureStartMenuController();
            this._menuController.contextMenu.close();
            this._menuController.resetOverviewOrigin();
            this._icon.gicon = this._currentGIcon();
            this.actor.accessible_name = this._accessibleName();
            this._syncVisibility();
            this._menuController.syncState();
            this._menuController.notifyMenuOpenStateChanged();
            this._keybindings?.sync();
        }, this);
        this._settings.connectObject('changed::windows-xp-theme-enabled', () => {
            this._menuController.startMenu?.close();
            this._menuController.contextMenu.close();
            this._syncWindowsXpStartButton();
            this.applyAppearance(
                this._iconSize,
                this._settings.get_int('start-button-padding')
            );
            this._syncVisibility();
            this._menuController.syncState();
            this._menuController.notifyMenuOpenStateChanged();
        }, this);
        const syncAppearance = () => this.applyAppearance(
            this._iconSize,
            this._settings.get_int('start-button-padding')
        );
        this._settings.connectObject(
            'changed::app-alignment', syncAppearance,
            'changed::start-button-position', syncAppearance,
            'changed::start-button-follow-app-alignment', syncAppearance,
            'changed::default-panel-start-button-position', syncAppearance,
            'changed::default-panel-start-button-follow-app-alignment', syncAppearance,
            'changed::panel-item-order', syncAppearance,
            'changed::panel-position', syncAppearance,
            'changed::panel-height', syncAppearance,
            'changed::panel-height-follow-icon-size', syncAppearance,
            'changed::dock-panel-mode', syncAppearance,
            'changed::running-indicator-position', syncAppearance,
            this
        );
        for (const key of [
            ...RUNNING_INDICATOR_RESERVE_SETTING_KEYS,
            ...HIGHLIGHT_SIZE_SETTING_KEYS,
            ...HIGHLIGHT_LENGTH_SETTING_KEYS,
        ]) {
            this._settings.connectObject(
                `changed::${key}`,
                syncAppearance,
                this
            );
        }
        for (const key of TASKBAR_HIGHLIGHT_SETTING_KEYS) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this._syncClassicHighlight(),
                this
            );
        }
        this._settings.connectObject(
            'changed::show-start-button-separator',
            () => this._syncSeparator(true),
            this
        );
        for (const key of [
            'start-menu-recommended-apps',
            'start-menu-hide-pinned-app-titles',
            'start-menu-app-categories',
        ]) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this._menuController.startMenu?.refresh(),
                this
            );
        }
        this._settings.connectObject(
            'changed::start-menu-power-options-enabled',
            () => this._menuController.startMenu?.syncPowerOptions(),
            this
        );
        this._settings.connectObject(
            'changed::start-menu-show-profile-picture',
            () => this._menuController.startMenu?.syncUserAvatar(),
            this
        );
        this._settings.connectObject(
            'changed::start-menu-open-all-apps',
            () => this._menuController.startMenu?.refreshDefaultView(),
            this
        );
        this._settings.connectObject(
            'changed::animate-appicon-hover-animation-type', syncAppearance,
            'changed::application-click-animation', syncAppearance,
            this
        );
        this._settings.connectObject('changed::start-button-custom-icon', () => {
            this._icon.gicon = this._currentGIcon();
        }, this);
        this._settings.connectObject('changed::gnome-start-button-visible', () => {
            this._syncVisibility();
        }, this);
        for (const key of ['default-gnome-panel', START_BUTTON_LOCATION_KEY]) {
            this._settings.connectObject(`changed::${key}`, () => {
                this._menuController.startMenu?.close();
                this._menuController.contextMenu.close();
                this._syncVisibility();
                this._keybindings?.sync();
            }, this);
        }
        for (const key of [
            'dock-mode',
            'start-menu-super-key',
            'start-menu-super-tab',
            'super-e-file-manager-enabled',
            'grid-alt-tab-enabled',
        ]) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this._keybindings?.sync(),
                this
            );
        }
        for (const key of ['start-menu-custom-hotkey', 'overview-custom-hotkey']) {
            this._settings.connectObject(`changed::${key}`, () => {
                this._keybindings?.customAcceleratorChanged(key);
            }, this);
        }
        const syncStartMenuTheme = () => {
            this._menuController.startMenu?.syncTheme();
        };
        this._settings.connectObject(
            'changed::start-menu-theme', syncStartMenuTheme,
            'changed::start-menu-follow-panel-theme',
            syncStartMenuTheme,
            'changed::panel-theme-follow-system', syncStartMenuTheme,
            'changed::panel-theme', syncStartMenuTheme,
            'changed::windows-10-theme-enabled',
            () => this._menuController.startMenu?.syncTheme(true),
            this
        );
        for (const key of [
            'start-menu-follow-panel-transparency',
            'transparency-enabled',
            'transparency-level',
        ]) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this._menuController.startMenu?.syncTransparency(),
                this
            );
        }
        Main.panel.connectObject('notify::style-class', () => {
            if (this._settings.get_boolean(
                'start-menu-follow-panel-theme'
            )) {
                syncStartMenuTheme();
            }
        }, this);
        St.ThemeContext.get_for_stage(global.stage).connectObject(
            'changed', syncStartMenuTheme,
            this
        );
        St.Settings.get().connectObject(
            'notify::color-scheme', syncStartMenuTheme,
            this
        );
    }

    _onButtonEvent(event) {
        if (isPrimaryPressOrTouch(event))
            this._activate();
        return Clutter.EVENT_PROPAGATE;
    }

    _activate() {
        this.actor.checked = !this.actor.checked;
        this._menuController.toggleApplications();
    }

    _openFileManager() {
        const app = Gio.app_info_get_default_for_type(
            'inode/directory',
            false
        );
        if (!app)
            return;

        this.closeMenus();
        this._previews.hideTooltip(false);
        this._previews.hide();
        const home = Gio.File.new_for_path(GLib.get_home_dir());
        app.launch([home], global.create_app_launch_context(0, -1));
    }

    _syncWindowsXpStartButton() {
        const enabled = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        this.actor.child = enabled
            ? this._windowsXpStartButton.actor
            : this._contentContainer;
        this._icon.visible = !enabled;
        this._syncClassicHighlight();
    }

    _syncClassicHighlight() {
        const classic = this._settings.get_string(
            'taskbar-highlight-style'
        ) === TASKBAR_HIGHLIGHT_STYLE.CLASSIC;
        const windowsXpTheme = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        );
        const enabled = classic && !windowsXpTheme;
        this._hover.visible = !classic && !windowsXpTheme;
        this._classicHover.visible = enabled;
        this._classicHover.opacity = 0;
        const radius = this._settings.get_int(
            CLASSIC_HIGHLIGHT_SETTINGS.borderRadius
        ) * this._highlightRenderScale;
        const pressed = this.actor.pressed || this.actor.checked;
        const colorKey = pressed
            ? CLASSIC_HIGHLIGHT_SETTINGS.pressedColor
            : CLASSIC_HIGHLIGHT_SETTINGS.hoverColor;
        this._classicHover.set_style(
            `${customClassicHighlightColorStyle(
                this._settings,
                colorKey
            )}border-radius: ${radius}px;`
        );
        setStylePseudoClass(this._classicHover, 'active', pressed);
        const hovered = this.actor.hover ||
            this.actor.has_style_pseudo_class('hover') ||
            this.actor.has_style_pseudo_class('focus');
        const hoverEnabled = this._settings.get_boolean(
            CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled
        );
        this._hover.set_style(`border-radius: ${radius}px; border-width: ${this._highlightRenderScale}px;`);
        this._hover.opacity = !hoverEnabled && (hovered || pressed) ? 0 : 255;
        if (windowsXpTheme)
            return;

        const active = hoverEnabled && (hovered || pressed);
        this._classicHover.opacity = active && classic ? 255 : 0;
    }

    _currentGIcon() {
        const customIcon = this._getCustomGIcon();
        if (customIcon)
            return customIcon;

        return this._settings.get_boolean('windows-start-menu-enabled')
            ? this._windowsGIcon
            : this._gnomeGIcon;
    }

    _getCustomGIcon() {
        const location = this._settings.get_string(
            'start-button-custom-icon'
        );
        if (!location)
            return null;

        if (location === 'theme:app-grid')
            return this._gnomeGIcon;
        if (isBundledStartIcon(location)) {
            const file = bundledStartIconFile(this._extensionDir, location);
            return file ? new Gio.FileIcon({file}) : null;
        }

        const file = location.includes('://')
            ? Gio.File.new_for_uri(location)
            : Gio.File.new_for_path(location);
        return file.query_exists(null) ? new Gio.FileIcon({file}) : null;
    }

    _syncVisibility() {
        this.actor.visible = startButtonVisible(this._settings);
        this.panelActor.visible = this.actor.visible;
        this._syncSeparator(false);
    }

    _syncSeparator(animate) {
        const vertical = panelIsVertical(this._settings);
        const orientationChanged = this._separatorVertical !== vertical;
        this._separatorVertical = vertical;
        this.panelActor.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        this.panelActor.x_align = vertical
            ? Clutter.ActorAlign.FILL
            : Clutter.ActorAlign.CENTER;
        this.panelActor.x_expand = vertical;
        this.panelActor.y_align = vertical
            ? Clutter.ActorAlign.CENTER
            : Clutter.ActorAlign.FILL;
        this.panelActor.y_expand = !vertical;
        syncSeparatorGeometry(
            this._separator,
            this._separatorLine,
            vertical,
            this._iconSize,
            this._parityOffset
        );
        if (orientationChanged)
            resetSeparatorToTarget(this._separator, vertical);
        this.panelActor.set_child_at_index(
            this._separator,
            this._separatorFollowsButton() ? 1 : 0
        );

        const visible = this.actor.visible &&
            !this._settings.get_boolean('windows-xp-theme-enabled') &&
            this._settings.get_boolean('show-start-button-separator');
        syncSeparatorVisibility(this._separator, vertical, visible, animate);
    }

    _separatorFollowsButton() {
        const startPosition = panelStartButtonPosition(this._settings);
        const appPosition = panelApplicationAlignment(this._settings);
        if (startPosition !== appPosition) {
            const positions = ['left', 'center', 'right'];
            return positions.indexOf(startPosition) <
                positions.indexOf(appPosition);
        }

        const order = normalizePanelItemOrder(
            this._settings.get_strv('panel-item-order')
        );
        return order.indexOf('start-button') <
            order.indexOf('applications');
    }

    _accessibleName() {
        return this._settings.get_boolean('windows-start-menu-enabled') ? _('Start') : _('Applications');
    }
}
