// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {
    panelArrowSide,
    panelIsVertical,
    panelPosition,
    syncMenuArrowSide,
} from '../panel/panelPosition.js';
import {closePopupMenu} from '../shared/popupMenuUtils.js';
import {shellMenusUseLightTheme} from '../themeUtils.js';

export const TRAY_OVERFLOW_ROLE = 'simple-taskbar-tray-overflow';
const TRAY_ROLE_PREFIXES = ['appindicator-', 'ubuntu-appindicator-'];
const TRAY_TYPE_NAMES = ['IndicatorStatusIcon', 'IndicatorTrayIcon'];
const RESCAN_DELAY = 120;
const GRID_MAX_COLUMNS = 5;
const LIGHT_MENU_CLASS = 'simple-taskbar-tray-overflow-light';
const XP_POPUP_OFFSET_CLASS = 'simple-taskbar-xp-popup-offset';
const TRAY_INDICATOR_STYLE =
    '-natural-hpadding: 0px; -minimum-hpadding: 0px;';

export class TrayOverflowController {
    constructor(settings) {
        this._settings = settings;
        this._signalHolder = new TransientSignalHolder();
        this._menuManager = null;
        this._menu = null;
        this._grid = null;
        this._button = null;
        this._icon = null;
        this._rescanId = 0;
        this._relayoutId = 0;
        this._menuRaiseId = 0;
        this._activationCloseId = 0;
        this._alignId = 0;
        this._menuRaiseIndicator = null;
        this._stashed = new Map();
    }

    enable() {
        this._createButton();
        this._menuManager = new PopupMenu.PopupMenuManager(this._button);
        this._overrideOutsideClicks();

        this._menu = new PopupMenu.PopupMenu(
            this._button,
            0.5,
            panelArrowSide(this._settings)
        );
        this._menu.actor.add_style_class_name('panel-menu');
        this._menu.actor.add_style_class_name('simple-taskbar-tray-overflow-menu');

        const section = new PopupMenu.PopupMenuSection();
        this._grid = new St.BoxLayout({
            style_class: 'simple-taskbar-tray-overflow-grid',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        section.actor.add_child(this._grid);
        this._menu.addMenuItem(section);
        this._menu.actor.hide();
        Main.uiGroup.add_child(this._menu.actor);
        this._menuManager.addMenu(this._menu);

        this._menu.connectObject('open-state-changed', (_menu, open) => {
            if (open) {
                this._button.add_style_pseudo_class('active');
                this._syncTheme();
                this._queueMenuArrowAlignment();
            } else {
                this._button.remove_style_pseudo_class('active');
                this._closeStashedMenus();
            }
        }, this._signalHolder);
        this._settings.connectObject(
            'changed::tray-overflow-enabled', () => this._sync(),
            'changed::windows-xp-theme-enabled',
            () => this._syncPanelPosition(),
            this._signalHolder
        );
        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ]) {
            box.connectObject(
                'child-added',
                (_box, container) => this._onPanelChildAdded(container),
                this._signalHolder
            );
        }

        this._syncPanelPosition();
        this._hidePanelTrayIndicators();
        this._syncButtonVisibility(false);
        this._queueRescan();
    }

    close() {
        closePopupMenu(this._menu, false);
    }

    get menuIsOpen() {
        if (this._menu.isOpen)
            return true;

        return [...this._stashed.values()].some(
            ({indicator}) => indicator.menu.isOpen
        );
    }

    _syncButtonVisibility(visible) {
        this._button.visible = visible;
        this._button.container.visible = visible;
    }

    _syncTheme() {
        this._menu.actor.remove_style_class_name(LIGHT_MENU_CLASS);
        if (shellMenusUseLightTheme())
            this._menu.actor.add_style_class_name(LIGHT_MENU_CLASS);
    }

    _queueMenuArrowAlignment() {
        if (this._alignId)
            return;

        this._alignId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this._alignId = 0;
            this._alignMenuArrow();
            return GLib.SOURCE_REMOVE;
        });
    }

    _alignMenuArrow() {
        const boxPointer = this._menu._boxPointer;
        if (boxPointer._arrowSide !== St.Side.LEFT &&
            boxPointer._arrowSide !== St.Side.RIGHT)
            return;

        const allocation = boxPointer.get_allocation_box();
        const height = allocation.y2 - allocation.y1;
        const [, , , naturalHeight] = boxPointer.get_preferred_size();
        if (height === naturalHeight)
            return;

        const themeNode = boxPointer.get_theme_node();
        const margin = 4 * themeNode.get_length('-arrow-border-radius') +
            themeNode.get_length('-arrow-border-width') +
            themeNode.get_length('-arrow-base');
        const span = naturalHeight - margin;
        if (span <= 0)
            return;

        const alignment = Math.clamp((height - margin) / (2 * span), 0, 1);
        if (alignment === boxPointer._arrowAlignment)
            return;

        boxPointer.setPosition(this._button, alignment);
    }

    _syncPanelPosition() {
        syncMenuArrowSide(this._menu, this._settings);
        this._menu._boxPointer.setPosition(this._button, 0.5);
        const xpPopupOffset = this._settings.get_boolean(
            'windows-xp-theme-enabled'
        ) && panelPosition(this._settings) === 'bottom';
        if (xpPopupOffset)
            this._menu._boxPointer.add_style_class_name(XP_POPUP_OFFSET_CLASS);
        else
            this._menu._boxPointer.remove_style_class_name(XP_POPUP_OFFSET_CLASS);
        const position = panelPosition(this._settings);
        if (position === 'top') {
            this._icon.icon_name = 'pan-down-symbolic';
            this._menu.actor.remove_style_class_name(
                'simple-taskbar-bottom-panel-menu'
            );
        } else if (position === 'bottom') {
            this._icon.icon_name = 'pan-up-symbolic';
            this._menu.actor.add_style_class_name(
                'simple-taskbar-bottom-panel-menu'
            );
        } else {
            this._icon.icon_name = position === 'left'
                ? 'pan-end-symbolic'
                : 'pan-start-symbolic';
            this._menu.actor.remove_style_class_name(
                'simple-taskbar-bottom-panel-menu'
            );
        }
    }

    destroy() {
        if (this._rescanId) {
            GLib.Source.remove(this._rescanId);
            this._rescanId = 0;
        }
        if (this._relayoutId) {
            GLib.Source.remove(this._relayoutId);
            this._relayoutId = 0;
        }
        if (this._menuRaiseId) {
            GLib.Source.remove(this._menuRaiseId);
            this._menuRaiseId = 0;
        }
        if (this._activationCloseId) {
            GLib.Source.remove(this._activationCloseId);
            this._activationCloseId = 0;
        }
        if (this._alignId) {
            GLib.Source.remove(this._alignId);
            this._alignId = 0;
        }
        this._menuRaiseIndicator = null;
        this._signalHolder.destroy();
        this._signalHolder = null;

        this._releaseAll();

        if (this._menu) {
            this._menuManager.removeMenu(this._menu);
            this._menu.destroy();
        }
        this._menu = null;
        this._menuManager = null;
        this._grid = null;

        if (this._button) {
            delete Main.panel.statusArea[TRAY_OVERFLOW_ROLE];
            this._button.destroy();
        }
        this._button = null;
        this._icon = null;
        this._settings = null;
    }

    _createButton() {
        this._button = new PanelMenu.Button(0.5, _('Tray icons'), true);
        this._button.add_style_class_name('simple-taskbar-tray-overflow');
        this._icon = new St.Icon({
            icon_name: 'pan-up-symbolic',
            style_class: 'system-status-icon',
        });
        this._button.add_child(this._icon);
        this._button.connect('button-press-event', () => {
            this._menu.toggle();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea(
            TRAY_OVERFLOW_ROLE,
            this._button,
            0,
            this._settings.get_string('tray-overflow-position')
        );
    }

    _overrideOutsideClicks() {
        const manager = this._menuManager;
        const inherited = manager._onCapturedEvent.bind(manager);
        manager._onCapturedEvent = (actor, event) => {
            const type = event.type();
            const isPress = type === Clutter.EventType.BUTTON_PRESS ||
                type === Clutter.EventType.TOUCH_BEGIN;
            if (isPress && this._eventInStashedMenu(event))
                return Clutter.EVENT_PROPAGATE;
            return inherited(actor, event);
        };
    }

    _eventInStashedMenu(event) {
        const target = global.stage.get_event_actor(event);
        if (!target)
            return false;

        for (const {indicator} of this._stashed.values()) {
            const menuActor = indicator.menu.actor;
            if (menuActor === target || menuActor.contains(target))
                return true;
        }
        return false;
    }

    _closeStashedMenus() {
        for (const {indicator} of this._stashed.values())
            closePopupMenu(indicator.menu, false);
    }

    _queueRescan() {
        if (this._rescanId)
            return;

        this._rescanId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            RESCAN_DELAY,
            () => {
                this._rescanId = 0;
                this._sync();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _onPanelChildAdded(container) {
        if (!this._settings.get_boolean('tray-overflow-enabled'))
            return;

        for (const [role, indicator] of Object.entries(Main.panel.statusArea)) {
            if (this._isTrayIndicator(role, indicator) &&
                indicator.container === container) {
                container.hide();
                break;
            }
        }
        this._queueRescan();
    }

    _hidePanelTrayIndicators() {
        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ]) {
            for (const container of box.get_children())
                this._onPanelChildAdded(container);
        }
    }

    _queueRelayout() {
        if (this._relayoutId) {
            GLib.Source.remove(this._relayoutId);
            this._relayoutId = 0;
        }
        this._relayoutId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._relayoutId = 0;
            this._relayoutGrid();
            return GLib.SOURCE_REMOVE;
        });
    }

    _queueActivationMenuClose() {
        if (this._activationCloseId)
            return;

        this._activationCloseId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._activationCloseId = 0;
                closePopupMenu(this._menu);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _indicatorSupportsActivation(indicator) {
        if (indicator.constructor.name !== 'IndicatorStatusIcon')
            return true;
        return indicator._indicator.supportsActivation !== false;
    }

    _handleIndicatorCapturedEvent(entry, event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
            event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        const time = event.get_time();
        const {doubleClickDistance, doubleClickTime} =
            global.stage.context.get_settings();
        if (time > entry.lastClickTime + doubleClickTime ||
            Math.abs(x - entry.lastClickX) > doubleClickDistance ||
            Math.abs(y - entry.lastClickY) > doubleClickDistance)
            entry.clickCount = 0;

        entry.lastClickTime = time;
        entry.lastClickX = x;
        entry.lastClickY = y;
        entry.clickCount = (entry.clickCount % 2) + 1;

        if (entry.clickCount === 2 &&
            this._indicatorSupportsActivation(entry.indicator))
            this._queueActivationMenuClose();

        return Clutter.EVENT_PROPAGATE;
    }

    _syncIndicatorMenuStacking(indicator, open) {
        if (!open && this._menuRaiseIndicator !== indicator)
            return;

        if (this._menuRaiseId) {
            GLib.Source.remove(this._menuRaiseId);
            this._menuRaiseId = 0;
        }
        this._menuRaiseIndicator = null;
        if (!open || indicator.menu.actor.get_parent() !== Main.uiGroup)
            return;

        const [overflowX, overflowY] =
            this._menu.actor.get_transformed_position();
        const [overflowWidth, overflowHeight] =
            this._menu.actor.get_transformed_size();
        const [indicatorX, indicatorY] = indicator.get_transformed_position();
        const [indicatorWidth, indicatorHeight] = indicator.get_transformed_size();
        const sourceAlignment = panelIsVertical(this._settings)
            ? (indicatorY + indicatorHeight / 2 - overflowY) / overflowHeight
            : (indicatorX + indicatorWidth / 2 - overflowX) / overflowWidth;
        indicator.menu._boxPointer.setPosition(this._menu.actor, 0.5);
        indicator.menu.setSourceAlignment(sourceAlignment);

        this._menuRaiseIndicator = indicator;
        this._menuRaiseId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._menuRaiseId = 0;
            this._menuRaiseIndicator = null;
            Main.uiGroup.set_child_above_sibling(indicator.menu.actor, null);
            return GLib.SOURCE_REMOVE;
        });
    }

    _handleIndicatorMenuCapturedEvent(entry, actor, event) {
        const type = event.type();
        const isPress = type === Clutter.EventType.BUTTON_PRESS ||
            type === Clutter.EventType.TOUCH_BEGIN;
        if (!isPress)
            return Clutter.EVENT_PROPAGATE;

        const target = global.stage.get_event_actor(event);
        if (target && actor.contains(target))
            return Clutter.EVENT_PROPAGATE;

        const sameIndicator = target &&
            (entry.indicator === target || entry.indicator.contains(target));
        if (type === Clutter.EventType.BUTTON_PRESS && sameIndicator &&
            (event.get_button() === Clutter.BUTTON_PRIMARY ||
             event.get_button() === Clutter.BUTTON_SECONDARY))
            return Clutter.EVENT_PROPAGATE;

        closePopupMenu(this._menu);
        return Clutter.EVENT_PROPAGATE;
    }

    _isTrayIndicator(role, indicator) {
        if (role === TRAY_OVERFLOW_ROLE)
            return false;
        const typeName = indicator.constructor.name;
        if (typeName === 'IndicatorStatusIcon' &&
            (!indicator.icon || !indicator.icon._indicator))
            return false;
        if (typeName === 'IndicatorTrayIcon' && !indicator.isReady())
            return false;
        if (TRAY_ROLE_PREFIXES.some(prefix => role.startsWith(prefix)))
            return true;
        return TRAY_TYPE_NAMES.includes(typeName);
    }

    _sync() {
        if (!this._settings.get_boolean('tray-overflow-enabled')) {
            this._releaseAll();
            this._syncButtonVisibility(false);
            return;
        }

        const panelBoxes = [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ];
        for (const entry of this._stashed.values()) {
            const parent = entry.indicator.container.get_parent();
            if (panelBoxes.includes(parent))
                this._reclaim(entry, parent);
        }

        const indicatorsByContainer = new Map();
        for (const [role, indicator] of Object.entries(Main.panel.statusArea)) {
            if (!this._stashed.has(role) &&
                this._isTrayIndicator(role, indicator))
                indicatorsByContainer.set(indicator.container, [role, indicator]);
        }

        for (const box of panelBoxes) {
            for (const container of box.get_children()) {
                const entry = indicatorsByContainer.get(container);
                if (entry)
                    this._stash(...entry);
            }
        }

        for (const role of [...this._stashed.keys()]) {
            if (!Main.panel.statusArea[role])
                this._release(role);
        }

        this._syncButtonVisibility([...this._stashed.values()]
            .some(({indicator}) => indicator.visible));
        this._syncTheme();
    }

    _recordOrigin(parent, container) {
        const siblings = parent.get_children();
        const ownContainer = this._button.container;
        for (let index = siblings.indexOf(container) - 1; index >= 0; index--) {
            if (siblings[index] !== ownContainer)
                return {parent, after: siblings[index]};
        }
        return {parent, after: null};
    }

    _applyTrayIndicatorStyle(entry) {
        const currentStyle = entry.indicator.get_style() ?? '';
        if (currentStyle === TRAY_INDICATOR_STYLE)
            return;

        entry.originalStyle = currentStyle;
        entry.indicator.set_style(TRAY_INDICATOR_STYLE);
        entry.indicator.queue_relayout();
    }

    _reclaim(entry, parent) {
        const container = entry.indicator.container;
        entry.origin = this._recordOrigin(parent, container);
        parent.remove_child(container);
        entry.cell.child = container;
        container.show();
        this._queueRelayout();
    }

    _stash(role, indicator) {
        if (!this._isTrayIndicator(role, indicator))
            return;

        const container = indicator.container;
        const parent = container.get_parent();
        if (!parent)
            return;

        const origin = this._recordOrigin(parent, container);
        parent.remove_child(container);
        const cell = new St.Bin({
            child: container,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        container.show();
        const entry = {
            indicator,
            origin,
            cell,
            originalStyle: indicator.get_style() ?? '',
            clickCount: 0,
            lastClickTime: -1,
            lastClickX: -1,
            lastClickY: -1,
        };
        this._stashed.set(role, entry);
        this._queueRelayout();

        indicator.connectObject(
            'captured-event',
            (_indicator, event) =>
                this._handleIndicatorCapturedEvent(entry, event),
            this
        );

        indicator.connectObject(
            'destroy',
            () => this._forget(role),
            this
        );
        indicator.connectObject(
            'notify::visible',
            () => this._queueRelayout(),
            this
        );
        indicator.connectObject(
            'notify::style',
            () => this._applyTrayIndicatorStyle(entry),
            this
        );
        indicator.menu.connectObject(
            'open-state-changed',
            (_menu, open) => this._syncIndicatorMenuStacking(indicator, open),
            'activate', () => closePopupMenu(this._menu),
            this
        );
        indicator.menu.actor.connectObject(
            'captured-event',
            (actor, event) =>
                this._handleIndicatorMenuCapturedEvent(entry, actor, event),
            this
        );
        this._applyTrayIndicatorStyle(entry);
    }

    _forget(role) {
        const entry = this._stashed.get(role);
        if (!entry)
            return;

        this._stashed.delete(role);
        this._syncIndicatorMenuStacking(entry.indicator, false);
        this._queueRelayout();
    }

    _release(role) {
        const entry = this._stashed.get(role);
        if (!entry)
            return;

        this._stashed.delete(role);
        const {indicator, origin, cell} = entry;
        indicator.disconnectObject(this);
        this._syncIndicatorMenuStacking(indicator, false);
        indicator.menu.actor.disconnectObject(this);
        indicator.menu.disconnectObject(this);
        closePopupMenu(indicator.menu, false);
        indicator.set_style(entry.originalStyle || null);
        indicator.queue_relayout();

        const container = indicator.container;
        if (cell.get_parent() === this._grid)
            this._grid.remove_child(cell);
        cell.child = null;
        cell.destroy();
        if (origin.parent) {
            const anchorIndex = origin.after
                ? origin.parent.get_children().indexOf(origin.after)
                : -1;
            origin.parent.insert_child_at_index(container, anchorIndex + 1);
            container.show();
            container.ensure_style();
            indicator.ensure_style();
        }
        this._relayoutGrid();
    }

    _relayoutGrid() {
        const retainedCells = new Set(
            [...this._stashed.values()].map(({cell}) => cell)
        );
        for (const row of this._grid.get_children()) {
            for (const cell of row.get_children()) {
                row.remove_child(cell);
                if (!retainedCells.has(cell))
                    cell.destroy();
            }
            row.destroy();
        }

        const cells = [...this._stashed.values()]
            .filter(({indicator}) => indicator.visible)
            .map(({cell}) => cell);
        for (let index = 0; index < cells.length; index += GRID_MAX_COLUMNS) {
            const row = new St.BoxLayout({
                style_class: 'simple-taskbar-tray-overflow-row',
                orientation: Clutter.Orientation.HORIZONTAL,
                x_expand: true,
            });
            for (const cell of cells.slice(index, index + GRID_MAX_COLUMNS))
                row.add_child(cell);
            this._grid.add_child(row);
        }
        this._menu.actor.set_width(-1);
        this._menu.actor.set_height(-1);
        this._syncButtonVisibility(cells.length > 0);
    }

    _releaseAll() {
        for (const role of [...this._stashed.keys()].reverse())
            this._release(role);
    }
}
