// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelArrowSide} from '../panel/panelPosition.js';

export class TaskbarLocationMenu extends PopupMenu.PopupMenu {
    constructor(sourceActor, settings, location) {
        super(sourceActor, 0.5, panelArrowSide(settings));
        this._location = location;

        this.addAction(_('Open'), () => {
            this._location.open_new_window(-1);
        });

        const actions = location.get_actions();
        if (actions.length > 0) {
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            for (const action of actions) {
                this.addAction(action.label, () => {
                    this._location.launchAction(action.id);
                });
            }
        }
    }

    destroy() {
        this._location = null;
        super.destroy();
    }
}
