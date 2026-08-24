// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {closePopupMenu} from '../shared/popupMenuUtils.js';
import {panelIsVertical} from '../panel/panelPosition.js';

export class ApplicationOverflowItemController {
    constructor(settings, taskbarController, menu, section) {
        this._settings = settings;
        this._taskbarController = taskbarController;
        this._menu = menu;
        this._section = section;
        this._records = [];
        this._draggables = new Map();
    }

    get records() {
        return this._records;
    }

    createTaskbarItem(item) {
        const panelHeight = this._settings.get_int('panel-height');
        const vertical = panelIsVertical(this._settings);
        const size = vertical
            ? item.get_preferred_height(panelHeight)[1]
            : item.get_preferred_width(panelHeight)[1];
        const clone = new Clutter.Clone({source: item});
        const button = new St.Button({
            style_class: 'simple-taskbar-app-item simple-taskbar-application-overflow-taskbar-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: vertical ? panelHeight : size,
            height: vertical ? size : panelHeight,
            accessible_name: item._taskbarButton.accessible_name,
            child: clone,
        });
        this._configure(button, item, item, true);
        return button;
    }

    createListItem(item) {
        if (item._taskbarIsShowDesktop)
            return this._createShowDesktopListItem(item);

        const app = item._taskbarApp;
        const window = item._taskbarWindow;
        const icon = app.create_icon_texture(Math.min(
            32,
            this._taskbarController.getIconSize()
        ));
        const label = new St.Label({
            text: window
                ? window.get_title() || app.get_name()
                : app.get_name(),
            y_align: Clutter.ActorAlign.CENTER,
        });
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-application-overflow-list-content',
            x_align: Clutter.ActorAlign.START,
            x_expand: true,
        });
        content.add_child(icon);
        content.add_child(label);
        const button = new St.Button({
            style_class: 'simple-taskbar-application-overflow-list-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            accessible_name: item._taskbarButton.accessible_name,
            child: content,
        });
        if (window) {
            window.connectObject('notify::title', () => {
                label.text = window.get_title() || app.get_name();
            }, button);
        }
        const syncState = () => {
            button.set_style_class_name(
                'simple-taskbar-application-overflow-list-item' +
                `${item.has_style_class_name('running') ? ' running' : ''}` +
                `${item.has_style_class_name('focused') ? ' focused' : ''}`
            );
        };
        item.connectObject('notify::style-class', syncState, button);
        syncState();
        this._configure(button, item, button, false);
        return button;
    }

    clear() {
        const taskbarItems = new Set(
            this._taskbarController.getOrderedApplicationItems()
        );
        for (const {auxiliaryItem, styleItem} of this._records) {
            this._releaseDraggable(auxiliaryItem);
            if (taskbarItems.has(styleItem)) {
                if (styleItem._taskbarIsShowDesktop) {
                    styleItem._taskbarButton.remove_style_pseudo_class(
                        'hover'
                    );
                } else {
                    styleItem.remove_style_pseudo_class('hover');
                }
            }
            this._taskbarController.removeAuxiliaryItem(auxiliaryItem);
        }
        this._records = [];
        this._section.actor.destroy_all_children();
    }

    destroy() {
        this.clear();
        this._draggables = null;
        this._records = null;
        this._section = null;
        this._menu = null;
        this._taskbarController = null;
        this._settings = null;
    }

    _createShowDesktopListItem(item) {
        const panelHeight = this._settings.get_int('panel-height');
        const clone = new Clutter.Clone({source: item});
        const label = new St.Label({
            text: _('Show desktop'),
            y_align: Clutter.ActorAlign.CENTER,
        });
        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-application-overflow-list-content',
            x_align: Clutter.ActorAlign.START,
            x_expand: true,
        });
        content.add_child(clone);
        content.add_child(label);
        const button = new St.Button({
            style_class: 'simple-taskbar-application-overflow-list-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            height: panelHeight,
            accessible_name: item._taskbarButton.accessible_name,
            child: content,
        });
        this._configure(button, item, item, false);
        return button;
    }

    _configure(auxiliaryItem, sourceItem, styleItem, previewsEnabled) {
        auxiliaryItem._taskbarApp = sourceItem._taskbarApp;
        auxiliaryItem._taskbarWindow = sourceItem._taskbarWindow;
        auxiliaryItem._taskbarIsLauncher = sourceItem._taskbarIsLauncher;
        auxiliaryItem._taskbarIsShowDesktop =
            sourceItem._taskbarIsShowDesktop;
        auxiliaryItem._taskbarButton = auxiliaryItem;
        this._records.push({auxiliaryItem, sourceItem, styleItem});
        this._taskbarController.registerAuxiliaryItem(auxiliaryItem);
        sourceItem._taskbarButton.connectObject(
            'notify::accessible-name',
            () => {
                auxiliaryItem.accessible_name =
                    sourceItem._taskbarButton.accessible_name;
            },
            auxiliaryItem
        );

        if (sourceItem._taskbarIsShowDesktop) {
            auxiliaryItem.connect('notify::hover', () => {
                if (auxiliaryItem.hover)
                    sourceItem._taskbarButton.add_style_pseudo_class('hover');
                else
                    sourceItem._taskbarButton.remove_style_pseudo_class('hover');
            });
            auxiliaryItem.connect('clicked', () => {
                this._taskbarController.activateShowDesktop(sourceItem);
                closePopupMenu(this._menu);
            });
            return;
        }

        this._makeDraggable(auxiliaryItem, sourceItem);
        if (previewsEnabled) {
            auxiliaryItem.connect('notify::hover', () => {
                this._taskbarController.handleItemHover(
                    auxiliaryItem,
                    auxiliaryItem.hover,
                    styleItem,
                    false
                );
            });
        }
        auxiliaryItem.connect('clicked', () => {
            const keepOpen = this._taskbarController.activateItem(
                sourceItem,
                auxiliaryItem
            );
            if (!keepOpen)
                closePopupMenu(this._menu);
        });
        auxiliaryItem.connect('button-press-event', (_button, event) => {
            const mouseButton = event.get_button();
            if (mouseButton === Clutter.BUTTON_MIDDLE) {
                this._taskbarController.handleItemMiddleClick(sourceItem);
                closePopupMenu(this._menu);
                return Clutter.EVENT_STOP;
            }
            if (mouseButton === Clutter.BUTTON_SECONDARY) {
                this._taskbarController.popupItemMenu(
                    sourceItem,
                    auxiliaryItem
                );
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        auxiliaryItem.connect('popup-menu', () => {
            this._taskbarController.popupItemMenu(sourceItem, auxiliaryItem);
            return Clutter.EVENT_STOP;
        });
    }

    _makeDraggable(auxiliaryItem, sourceItem) {
        if (!this._taskbarController.isTaskbarItemDraggable(sourceItem))
            return;

        const dragSource = {
            app: sourceItem._taskbarApp,
            _taskbarItem: sourceItem,
            _taskbarDropAccepted: false,
            _taskbarDropTarget: null,
            getDragActor: () => sourceItem._taskbarApp.create_icon_texture(
                this._taskbarController.getIconSize()
            ),
            getDragActorSource: () => sourceItem._taskbarIcon,
        };
        auxiliaryItem._delegate = dragSource;
        const draggable = DND.makeDraggable(auxiliaryItem, {
            timeoutThreshold: 200,
            dragActorMaxSize: this._taskbarController.getIconSize(),
        });
        auxiliaryItem._taskbarDraggable = draggable;
        this._draggables.set(auxiliaryItem, {
            draggable,
            handlerIds: [
                draggable.connect('drag-begin', () => {
                    dragSource._taskbarDropAccepted = false;
                    dragSource._taskbarDropTarget = null;
                    auxiliaryItem.opacity = 96;
                    this._taskbarController.beginExternalTaskbarDrag(
                        sourceItem
                    );
                }),
                draggable.connect('drag-end', () => {
                    auxiliaryItem.opacity = 255;
                    this._taskbarController.finishExternalTaskbarDrag(
                        sourceItem,
                        draggable
                    );
                    if (dragSource._taskbarDropAccepted &&
                        dragSource._taskbarDropTarget ===
                            this._taskbarController) {
                        closePopupMenu(this._menu);
                    }
                    dragSource._taskbarDropAccepted = false;
                    dragSource._taskbarDropTarget = null;
                }),
            ],
        });
    }

    _releaseDraggable(auxiliaryItem) {
        const entry = this._draggables.get(auxiliaryItem);
        if (!entry)
            return;

        for (const handlerId of entry.handlerIds)
            entry.draggable.disconnect(handlerId);
        auxiliaryItem._delegate = null;
        this._draggables.delete(auxiliaryItem);
    }
}
