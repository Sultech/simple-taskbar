// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
    CLASSIC_HIGHLIGHT_SETTINGS,
    HIGHLIGHT_SIZE_SETTING_KEYS,
    TASKBAR_HIGHLIGHT_STYLE,
    customClassicHighlightColorStyle,
} from '../shared/classicHighlightSettings.js';
import {taskbarGlassCrossRect} from '../shared/panelSizing.js';
import {setStylePseudoClass} from '../shared/styleUtils.js';
import {panelIsVertical} from './panelPosition.js';

const HOVER_PSEUDO_CLASSES = ['hover', 'focus'];
const OPEN_PSEUDO_CLASSES = ['active', 'checked'];
const WATCHED_KEYS = [
    'taskbar-highlight-edge-gap',
    'icon-edge-padding',
    'taskbar-highlight-style',
    CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled,
    CLASSIC_HIGHLIGHT_SETTINGS.hoverColor,
    CLASSIC_HIGHLIGHT_SETTINGS.borderRadius,
    CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled,
    CLASSIC_HIGHLIGHT_SETTINGS.focusColor,
    CLASSIC_HIGHLIGHT_SETTINGS.focusOpacity,
    ...HIGHLIGHT_SIZE_SETTING_KEYS,
];

function findStyledDescendant(actor, styleClass) {
    for (const child of actor.get_children()) {
        if (child instanceof St.Widget && child.has_style_class_name(styleClass))
            return child;
        const descendant = findStyledDescendant(child, styleClass);
        if (descendant)
            return descendant;
    }
    return null;
}

export function allocatePanelButtonHighlightLayers(panel, box) {
    const layerBox = Clutter.ActorBox.new(0, 0, box.get_width(), box.get_height());
    for (const child of panel.get_children()) {
        if (child instanceof PanelButtonHighlightLayer)
            child.allocate(layerBox);
    }
}

export const PanelButtonHighlightLayer = GObject.registerClass(
class PanelButtonHighlightLayer extends St.Widget {
    _init(settings, boxes, getPanelHeight, getIconSize) {
        super._init({reactive: false});
        this._settings = settings;
        this._boxes = boxes;
        this._getPanelHeight = getPanelHeight;
        this._getIconSize = getIconSize;
        this._entries = new Map();
        for (const key of WATCHED_KEYS)
            this._settings.connectObject(`changed::${key}`, () => this.sync(), this);
    }

    destroy() {
        this._settings.disconnectObject(this);
        for (const button of [...this._entries.keys()])
            this.untrack(button);
        this._settings = null;
        this._boxes = null;
        this._getPanelHeight = null;
        this._getIconSize = null;
        super.destroy();
    }

    track(button) {
        if (this._entries.has(button))
            return;

        const target = button.has_style_class_name('clock-display')
            ? findStyledDescendant(button, 'clock')
            : button;
        const chain = [];
        let actor = target;
        while (!this._boxes.includes(actor)) {
            chain.push(actor);
            actor = actor.get_parent();
        }
        chain.push(actor);
        const [classicHover, classicFocus, glass] = [
            'simple-taskbar-classic-hover',
            'simple-taskbar-classic-focus',
            'simple-taskbar-app-glass',
        ].map(styleClass => new St.Widget({style_class: styleClass, x_expand: true, y_expand: true}));
        const item = new St.Widget({
            style_class: 'simple-taskbar-app-item simple-taskbar-panel-button-glass',
            layout_manager: new Clutter.BinLayout(),
            visible: false,
        });
        item.add_child(classicHover);
        item.add_child(classicFocus);
        item.add_child(glass);
        this.add_child(item);
        const entry = {button, target, chain, item, glass, classicHover, classicFocus};
        this._entries.set(button, entry);
        for (const source of chain) {
            source.connectObject(
                'notify::translation-x', () => this._syncTranslation(entry),
                'notify::translation-y', () => this._syncTranslation(entry),
                item
            );
        }
        button.connectObject(
            'notify::pseudo-class', () => this._syncState(entry),
            'notify::mapped', () => this._syncState(entry),
            item
        );
        this._syncState(entry);
        this.queue_relayout();
    }

    setTracked(button, tracked) {
        if (tracked)
            this.track(button);
        else
            this.untrack(button);
    }

    untrack(button) {
        const entry = this._entries.get(button);
        if (!entry)
            return;

        this._entries.delete(button);
        for (const source of entry.chain)
            source.disconnectObject(entry.item);
        entry.item.destroy();
    }

    sync() {
        for (const entry of this._entries.values())
            this._syncState(entry);
        this.queue_relayout();
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const vertical = panelIsVertical(this._settings);
        const [glassStart, glassExtent, visualHeight] = taskbarGlassCrossRect(
            this._settings,
            this._getPanelHeight(),
            this._getIconSize()
        );
        for (const entry of this._entries.values()) {
            let x = 0;
            let y = 0;
            for (const actor of entry.chain) {
                const allocation = actor.get_allocation_box();
                x += allocation.x1;
                y += allocation.y1;
            }
            const [width, height] = entry.target.get_allocation_box().get_size();
            const panelBox = entry.chain.at(-1).get_allocation_box();
            const themeNode = entry.target.get_theme_node();
            const leadingGap = themeNode.get_border_width(vertical ? St.Side.TOP : St.Side.LEFT);
            const trailingGap = themeNode.get_border_width(vertical ? St.Side.BOTTOM : St.Side.RIGHT);
            const mainStart = (vertical ? y : x) + leadingGap;
            const mainEnd = (vertical ? y + height : x + width) - trailingGap;
            const boxThickness = vertical ? panelBox.get_width() : panelBox.get_height();
            const crossStart = (vertical ? panelBox.x1 : panelBox.y1) +
                Math.max(0, Math.floor((boxThickness - visualHeight) / 2)) + glassStart;
            const itemBox = vertical
                ? Clutter.ActorBox.new(crossStart, mainStart, crossStart + glassExtent, mainEnd)
                : Clutter.ActorBox.new(mainStart, crossStart, mainEnd, crossStart + glassExtent);
            entry.item.allocate(itemBox);
            this._syncTranslation(entry);
        }
    }

    _syncTranslation(entry) {
        const property = panelIsVertical(this._settings) ? 'translation_y' : 'translation_x';
        entry.item[property] = entry.chain.reduce((sum, actor) => sum + actor[property], 0);
    }

    _syncState(entry) {
        const {button, item, glass, classicHover, classicFocus} = entry;
        const hovered = HOVER_PSEUDO_CLASSES.some(pseudoClass => button.has_style_pseudo_class(pseudoClass));
        const focused = OPEN_PSEUDO_CLASSES.some(pseudoClass => button.has_style_pseudo_class(pseudoClass));
        const classic = this._settings.get_string('taskbar-highlight-style') === TASKBAR_HIGHLIGHT_STYLE.CLASSIC;
        const hoverEnabled = this._settings.get_boolean(CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled);
        const radiusStyle = `border-radius: ${this._settings.get_int(CLASSIC_HIGHLIGHT_SETTINGS.borderRadius)}px;`;
        glass.visible = !classic;
        classicHover.visible = classic;
        classicFocus.visible = classic;
        if (!classic) {
            setStylePseudoClass(item, 'hover', hovered);
            if (focused)
                item.add_style_class_name('simple-taskbar-panel-button-open');
            else
                item.remove_style_class_name('simple-taskbar-panel-button-open');
            glass.set_style(radiusStyle);
            item.visible = button.mapped && (focused || (hoverEnabled && hovered));
            return;
        }

        const focusEnabled = this._settings.get_boolean(CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled);
        classicHover.set_style(`${customClassicHighlightColorStyle(this._settings, CLASSIC_HIGHLIGHT_SETTINGS.hoverColor)}${radiusStyle}`);
        classicFocus.set_style(`${customClassicHighlightColorStyle(this._settings, CLASSIC_HIGHLIGHT_SETTINGS.focusColor)}${radiusStyle}`);
        const hoverShown = hoverEnabled && hovered;
        const focusShown = focused && focusEnabled;
        classicHover.opacity = hoverShown ? 255 : 0;
        classicFocus.opacity = focusShown
            ? Math.round(this._settings.get_int(CLASSIC_HIGHLIGHT_SETTINGS.focusOpacity) * 2.55)
            : 0;
        item.visible = button.mapped && (hoverShown || focusShown);
    }
});
