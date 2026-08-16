// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CLOCK_SHOW_DATE_SETTING = 'clock-show-date';

export class PanelStateController {
    constructor({
        settings,
        panelHeight,
        startButton,
        taskbarBin,
        folderMenuButton,
        showDesktopButton,
    }) {
        this._settings = settings;
        this._panelHeight = panelHeight;
        this._startButton = startButton;
        this._taskbarBin = taskbarBin;
        this._folderMenuButton = folderMenuButton;
        this._showDesktopButton = showDesktopButton;
        this._panelBoxState = [];
        this._oldPanelGeometry = null;
        this._oldPanelStyle = null;
        this._activitiesWasVisible = null;
        this._dateMenuIndicatorPad = null;
        this._dateMenuIndicatorPadConstraints = [];
        this._dateMenuDisplayBox = null;
        this._dateMenuDisplayBoxTranslationY = null;
        this._desktopSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._clockShowDateChangedId = 0;
    }

    get oldPanelStyle() {
        return this._oldPanelStyle;
    }

    enable() {
        this._clockShowDateChangedId = this._desktopSettings.connect(
            `changed::${CLOCK_SHOW_DATE_SETTING}`,
            () => this.syncDateMenuVerticalAlignment(this._panelHeight)
        );
        const panelBox = Main.layoutManager.panelBox;
        const activities = Main.panel.statusArea.activities.container;
        this._oldPanelGeometry = {
            x: panelBox.x,
            y: panelBox.y,
            width: panelBox.width,
            height: panelBox.height,
        };
        this._oldPanelStyle = Main.panel.get_style();
        this._activitiesWasVisible = activities.visible;

        for (const box of [
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
        ]) {
            this._panelBoxState.push({
                box,
                children: box.get_children(),
            });
        }

        Main.panel.add_style_class_name('simple-taskbar-panel');
        this.syncActivitiesVisibility();
        if (!this._settings.get_boolean('default-gnome-panel')) {
            Main.panel._leftBox.insert_child_at_index(
                this._startButton,
                0
            );
        }
        if (this._settings.get_boolean('folder-menu-enabled'))
            Main.panel._rightBox.add_child(this._folderMenuButton);
        if (this._settings.get_boolean('show-desktop-button-visible') &&
            !this._settings.get_boolean('windows-xp-theme-enabled')) {
            Main.panel._rightBox.add_child(this._showDesktopButton);
        }
    }

    removeDateMenuIndicatorPadding() {
        const dateMenu = Main.panel.statusArea.dateMenu;
        const displayBox = dateMenu.get_first_child();
        if (!displayBox)
            return;
        const indicatorPad = displayBox.get_first_child();
        if (!indicatorPad)
            return;

        this._dateMenuDisplayBox = displayBox;
        this._dateMenuDisplayBoxTranslationY = displayBox.translation_y;
        this._dateMenuIndicatorPad = indicatorPad;
        this._dateMenuIndicatorPadConstraints =
            [...indicatorPad.get_constraints()];
        indicatorPad.clear_constraints();
        indicatorPad.queue_relayout();
        dateMenu.queue_relayout();
        this.syncDateMenuVerticalAlignment(this._panelHeight);
    }

    setShowDesktopButton(button) {
        this._showDesktopButton = button;
    }

    syncDateMenuVerticalAlignment(panelHeight) {
        if (!this._dateMenuDisplayBox)
            return;

        this._panelHeight = panelHeight;
        const dateShown = this._desktopSettings.get_boolean(
            CLOCK_SHOW_DATE_SETTING
        );
        const parityOffset = dateShown ? 0 : panelHeight % 2 === 0 ? 1 : 0;
        this._dateMenuDisplayBox.translation_y =
            this._dateMenuDisplayBoxTranslationY + parityOffset;
    }

    syncActivitiesVisibility() {
        Main.panel.statusArea.activities.container.visible =
            this._settings.get_boolean('activities-button-visible');
    }

    destroy(restoringUnlockPanel) {
        this._desktopSettings.disconnect(this._clockShowDateChangedId);
        this._restoreDateMenuIndicatorPadding();
        this._restoreDateMenuVerticalAlignment();

        for (const actor of [
            this._startButton,
            this._taskbarBin,
            this._folderMenuButton,
            this._showDesktopButton,
        ]) {
            const parent = actor.get_parent();
            if (parent)
                parent.remove_child(actor);
        }
        this._restorePanelItems();

        if (!restoringUnlockPanel) {
            Main.panel.statusArea.activities.container.visible =
                this._activitiesWasVisible;
        }

        const panelBox = Main.layoutManager.panelBox;
        const primaryMonitor = Main.layoutManager.primaryMonitor;
        Main.panel.set_height(-1);
        panelBox.set_size(
            primaryMonitor?.width ?? this._oldPanelGeometry.width,
            -1
        );
        panelBox.set_position(
            primaryMonitor?.x ?? this._oldPanelGeometry.x,
            primaryMonitor?.y ?? this._oldPanelGeometry.y
        );
        Main.layoutManager._queueUpdateRegions();

        if (restoringUnlockPanel)
            Main.panel._updatePanel();

        this._panelBoxState = null;
        this._oldPanelGeometry = null;
        this._oldPanelStyle = null;
        this._activitiesWasVisible = null;
        this._dateMenuIndicatorPad = null;
        this._dateMenuIndicatorPadConstraints = null;
        this._dateMenuDisplayBox = null;
        this._dateMenuDisplayBoxTranslationY = null;
        this._clockShowDateChangedId = 0;
        this._desktopSettings = null;
        this._showDesktopButton = null;
        this._folderMenuButton = null;
        this._taskbarBin = null;
        this._startButton = null;
        this._settings = null;
    }

    _restoreDateMenuIndicatorPadding() {
        const indicatorPad = this._dateMenuIndicatorPad;
        if (!indicatorPad)
            return;

        for (const constraint of this._dateMenuIndicatorPadConstraints)
            indicatorPad.add_constraint(constraint);
        indicatorPad.queue_relayout();
        Main.panel.statusArea.dateMenu.queue_relayout();
    }

    _restoreDateMenuVerticalAlignment() {
        if (!this._dateMenuDisplayBox)
            return;

        this._dateMenuDisplayBox.translation_y =
            this._dateMenuDisplayBoxTranslationY;
    }

    _restorePanelItems() {
        const boxes = this._panelBoxState.map(({box}) => box);
        const originalBoxByActor = new Map();
        for (const {box, children} of this._panelBoxState) {
            for (const actor of children)
                originalBoxByActor.set(actor, box);
        }

        const currentChildrenByBox = new Map(
            boxes.map(box => [box, box.get_children()])
        );
        const currentPanelActors = new Set(
            [...currentChildrenByBox.values()].flat()
        );
        const originalChildrenByBox = new Map(
            this._panelBoxState.map(({box, children}) => [
                box,
                children.filter(actor => currentPanelActors.has(actor)),
            ])
        );

        for (const actor of currentPanelActors) {
            if (originalBoxByActor.has(actor)) {
                const parent = actor.get_parent();
                if (parent)
                    parent.remove_child(actor);
            }
        }

        for (const {box} of this._panelBoxState) {
            const currentChildren = currentChildrenByBox.get(box);
            const originalChildren = originalChildrenByBox.get(box);
            const originalIndexByActor = new Map(
                originalChildren.map((actor, index) => [actor, index])
            );
            const dynamicByGap = Array.from(
                {length: originalChildren.length + 1},
                () => []
            );
            let gap = 0;
            for (const actor of currentChildren) {
                const originalBox = originalBoxByActor.get(actor);
                if (originalBox !== box) {
                    if (!originalBox)
                        dynamicByGap[gap].push(actor);
                    continue;
                }

                const originalIndex = originalIndexByActor.get(actor);
                if (originalIndex !== undefined)
                    gap = originalIndex + 1;
            }

            const targetChildren = [];
            for (let index = 0; index < originalChildren.length; index++) {
                targetChildren.push(...dynamicByGap[index]);
                targetChildren.push(originalChildren[index]);
            }
            targetChildren.push(...dynamicByGap[originalChildren.length]);

            for (let index = 0; index < targetChildren.length; index++) {
                const actor = targetChildren[index];
                if (box.get_child_at_index(index) === actor)
                    continue;

                if (actor.get_parent() === box)
                    box.set_child_at_index(actor, index);
                else
                    box.insert_child_at_index(actor, index);
            }
        }
    }
}
