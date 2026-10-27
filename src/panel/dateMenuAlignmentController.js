// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {panelIsVertical} from './panelPosition.js';

export class DateMenuAlignmentController {
    constructor(settings, dateMenu, panelHeight) {
        this._settings = settings;
        this._panelHeight = panelHeight;
        this._dateMenu = dateMenu;
        const displayBox = dateMenu.get_first_child();
        this._indicatorPad = displayBox.get_first_child();
        this._indicatorPadConstraints = [...this._indicatorPad.get_constraints()];
        this._clockText = dateMenu._clockDisplay.clutter_text;
        this._clockTextTranslationX = this._clockText.translation_x;
        this._clockTextTranslationY = this._clockText.translation_y;
        this._clockText.connectObject(
            'notify::allocation', () => this.sync(this._panelHeight),
            this
        );
        this._indicatorPad.clear_constraints();
        this._indicatorPad.queue_relayout();
        dateMenu.queue_relayout();
        this.sync(panelHeight);
    }

    sync(panelHeight) {
        this._panelHeight = panelHeight;
        const vertical = panelIsVertical(this._settings);
        const [, textExtents] = this._clockText.get_layout().get_pixel_extents();
        const crossExtent = vertical ? textExtents.width : textExtents.height;
        const parityNudge = crossExtent % 2 !== 0 && panelHeight % 2 === 0 ? 1 : 0;
        this._clockText.translation_x = this._clockTextTranslationX + (vertical ? parityNudge : 0);
        this._clockText.translation_y = this._clockTextTranslationY + (vertical ? 0 : parityNudge);
    }

    destroy() {
        this._clockText.disconnectObject(this);
        for (const constraint of this._indicatorPadConstraints)
            this._indicatorPad.add_constraint(constraint);
        this._indicatorPad.queue_relayout();
        this._dateMenu.queue_relayout();
        this._clockText.translation_x = this._clockTextTranslationX;
        this._clockText.translation_y = this._clockTextTranslationY;
        this._indicatorPad = null;
        this._indicatorPadConstraints = null;
        this._clockText = null;
        this._dateMenu = null;
        this._settings = null;
    }
}
