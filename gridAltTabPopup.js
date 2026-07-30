// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SwitcherPopup from 'resource:///org/gnome/shell/ui/switcherPopup.js';
import {
    gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

const CARD_MIN_WIDTH = 150;
const CARD_SPACING = 12;
const CARD_HEADER_HEIGHT = 30;
const CARD_PADDING = 24;
const MIN_PREVIEW_HEIGHT = 120;
const MIN_WINDOW_ASPECT = 0.5;
const MAX_WINDOW_ASPECT = 2.2;
const POPUP_WIDTH_RATIO = 0.86;
const POPUP_HEIGHT_RATIO = 0.74;
const SCROLLBAR_RESERVE = 14;

function getWindowAspect(window) {
    const source = window.get_compositor_private();
    if (!source)
        return 16 / 9;

    const [width, height] = source.get_size();
    if (width <= 0 || height <= 0)
        return 16 / 9;

    return Math.max(
        MIN_WINDOW_ASPECT,
        Math.min(MAX_WINDOW_ASPECT, width / height)
    );
}

function getCardWidth(aspect, previewHeight) {
    return Math.max(
        CARD_MIN_WIDTH,
        Math.round(previewHeight * aspect) + CARD_PADDING
    );
}

function buildRows(itemWidths, rowCount) {
    const minimumRowSize = Math.floor(
        itemWidths.length / rowCount
    );
    const maximumRowSize = Math.ceil(
        itemWidths.length / rowCount
    );
    const prefixWidths = [0];
    for (const width of itemWidths)
        prefixWidths.push(prefixWidths.at(-1) + width);
    const memo = new Map();

    function partition(start, rowIndex) {
        if (rowIndex === rowCount) {
            return start === itemWidths.length
                ? {maximumWidth: 0, rows: []}
                : null;
        }

        const key = `${start}:${rowIndex}`;
        if (memo.has(key))
            return memo.get(key);

        const remainingRows = rowCount - rowIndex - 1;
        let best = null;
        for (let size = maximumRowSize;
            size >= minimumRowSize;
            size--) {
            const remainingItems =
                itemWidths.length - start - size;
            if (remainingItems <
                    remainingRows * minimumRowSize ||
                remainingItems >
                    remainingRows * maximumRowSize) {
                continue;
            }

            const next = partition(start + size, rowIndex + 1);
            if (!next)
                continue;

            const width =
                prefixWidths[start + size] -
                prefixWidths[start] +
                CARD_SPACING * Math.max(0, size - 1);
            const maximumWidth = Math.max(
                width,
                next.maximumWidth
            );
            if (best && maximumWidth >= best.maximumWidth)
                continue;

            best = {
                maximumWidth,
                rows: [
                    Array.from(
                        {length: size},
                        (_item, index) => start + index
                    ),
                    ...next.rows,
                ],
            };
        }

        memo.set(key, best);
        return best;
    }

    return partition(0, 0).rows;
}

function getRowWidth(row, aspects, previewHeight) {
    return row.reduce(
        (width, index) =>
            width + getCardWidth(aspects[index], previewHeight),
        CARD_SPACING * Math.max(0, row.length - 1)
    );
}

function calculateLayout(
    windows,
    availableWidth,
    availableHeight,
    maxPreviewHeight
) {
    if (windows.length === 0) {
        return {
            rows: [],
            cardWidths: [],
            previewHeight: MIN_PREVIEW_HEIGHT,
            contentWidth: CARD_MIN_WIDTH,
        };
    }

    const aspects = windows.map(window => getWindowAspect(window));
    const layoutWidths = aspects.map(
        aspect => getCardWidth(aspect, MIN_PREVIEW_HEIGHT)
    );
    let selectedRows = [windows.map((_window, index) => index)];
    let selectedHeight = 0;
    for (let rowCount = 1; rowCount <= windows.length; rowCount++) {
        const rows = buildRows(layoutWidths, rowCount);
        if (rows.some(row =>
            getRowWidth(row, aspects, MIN_PREVIEW_HEIGHT) >
                availableWidth)) {
            continue;
        }

        const availableCardHeight =
            (availableHeight -
                CARD_SPACING * Math.max(0, rowCount - 1)) /
            rowCount;
        let upperHeight = Math.min(
            maxPreviewHeight,
            Math.max(
                MIN_PREVIEW_HEIGHT,
                availableCardHeight -
                    CARD_HEADER_HEIGHT -
                    CARD_PADDING
            )
        );
        let lowerHeight = MIN_PREVIEW_HEIGHT;
        let previewHeight = MIN_PREVIEW_HEIGHT;

        while (lowerHeight <= upperHeight) {
            const candidateHeight = Math.floor(
                (lowerHeight + upperHeight) / 2
            );
            const fits = rows.every(row =>
                getRowWidth(row, aspects, candidateHeight) <=
                    availableWidth);
            if (fits) {
                previewHeight = candidateHeight;
                lowerHeight = candidateHeight + 1;
            } else {
                upperHeight = candidateHeight - 1;
            }
        }

        if (previewHeight > selectedHeight) {
            selectedRows = rows;
            selectedHeight = previewHeight;
        }
    }

    if (selectedHeight === 0) {
        selectedRows = buildRows(layoutWidths, windows.length);
        selectedHeight = MIN_PREVIEW_HEIGHT;
    }
    const cardWidths = aspects.map(
        aspect => getCardWidth(aspect, selectedHeight)
    );
    const contentWidth = Math.max(
        ...selectedRows.map(row =>
            row.reduce(
                (width, index) => width + cardWidths[index],
                CARD_SPACING * Math.max(0, row.length - 1)
            )
        )
    );
    return {
        rows: selectedRows,
        cardWidths,
        previewHeight: selectedHeight,
        contentWidth,
    };
}

const GridAltTabCard = GObject.registerClass(
class GridAltTabCard extends St.Button {
    _init(window, tracker, width, previewHeight) {
        const title = window.get_title() || _('Untitled Window');
        super._init({
            style_class: 'item-box simple-taskbar-grid-alt-tab-card',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: title,
            width,
        });

        this.window = window;
        this._title = new St.Label({
            style_class: 'simple-taskbar-grid-alt-tab-title',
            text: title,
            x_align: Clutter.ActorAlign.START,
            x_expand: true,
        });
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._title.clutter_text.single_line_mode = true;

        const app = tracker.get_window_app(window);
        const appIcon = app
            ? app.create_icon_texture(20)
            : new St.Icon({
                icon_name: 'application-x-executable-symbolic',
                icon_size: 20,
            });
        const header = new St.BoxLayout({
            style_class: 'simple-taskbar-grid-alt-tab-header',
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(appIcon);
        header.add_child(this._title);

        const previewWidth = width - CARD_PADDING;
        const preview = new St.Widget({
            style_class: 'simple-taskbar-grid-alt-tab-preview',
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
            width: previewWidth,
            height: previewHeight,
        });
        const source = window.get_compositor_private();
        if (source) {
            const [sourceWidth, sourceHeight] = source.get_size();
            if (sourceWidth > 0 && sourceHeight > 0) {
                const scale = Math.min(
                    previewWidth / sourceWidth,
                    previewHeight / sourceHeight
                );
                preview.add_child(new Clutter.Clone({
                    source,
                    width: Math.max(1, Math.round(sourceWidth * scale)),
                    height: Math.max(1, Math.round(sourceHeight * scale)),
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    x_expand: true,
                    y_expand: true,
                }));
            }
        }
        if (preview.get_n_children() === 0) {
            const fallbackIcon = app
                ? app.create_icon_texture(64)
                : new St.Icon({
                    icon_name: 'application-x-executable-symbolic',
                    icon_size: 64,
                });
            fallbackIcon.x_align = Clutter.ActorAlign.CENTER;
            fallbackIcon.y_align = Clutter.ActorAlign.CENTER;
            fallbackIcon.x_expand = true;
            fallbackIcon.y_expand = true;
            preview.add_child(fallbackIcon);
        }

        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-grid-alt-tab-card-content',
            orientation: Clutter.Orientation.VERTICAL,
        });
        content.add_child(header);
        content.add_child(preview);
        this.set_child(content);

        window.connectObject('notify::title', () => {
            const updatedTitle =
                window.get_title() || _('Untitled Window');
            this._title.text = updatedTitle;
            this.accessible_name = updatedTitle;
        }, this);
    }

    destroy() {
        this.window.disconnectObject(this);
        this.window = null;
        this._title = null;
        super.destroy();
    }
});

const GridAltTabList = GObject.registerClass({
    Signals: {
        'item-activated': {param_types: [GObject.TYPE_INT]},
        'item-entered': {param_types: [GObject.TYPE_INT]},
        'item-removed': {param_types: [GObject.TYPE_INT]},
    },
}, class GridAltTabList extends St.ScrollView {
    _init(windows, monitor, maxPreviewHeight) {
        const availableWidth = Math.floor(
            monitor.width * POPUP_WIDTH_RATIO
        );
        const availableHeight = Math.floor(
            monitor.height * POPUP_HEIGHT_RATIO
        );
        const {
            rows,
            cardWidths,
            previewHeight,
            contentWidth,
        } = calculateLayout(
            windows,
            availableWidth,
            availableHeight,
            maxPreviewHeight
        );
        const cardHeight =
            previewHeight + CARD_HEADER_HEIGHT + CARD_PADDING;
        const visibleRows = Math.min(
            rows.length,
            Math.max(
                1,
                Math.floor(
                    (availableHeight + CARD_SPACING) /
                    (cardHeight + CARD_SPACING)
                )
            )
        );
        const width = contentWidth +
            CARD_PADDING +
            (rows.length > visibleRows ? SCROLLBAR_RESERVE : 0);
        const height = visibleRows * cardHeight +
            Math.max(0, visibleRows - 1) * CARD_SPACING +
            CARD_PADDING;

        super._init({
            style_class:
                'switcher-list simple-taskbar-grid-alt-tab-list',
            reactive: true,
            enable_mouse_scrolling: true,
            overlay_scrollbars: false,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            width,
            height,
        });

        const visualOrder = rows.flat();
        this.windows = visualOrder.map(index => windows[index]);
        this.cards = [];
        this._rowIndices = [];
        this._cardWidths = visualOrder.map(
            index => cardWidths[index]
        );
        let visualIndex = 0;
        for (const row of rows) {
            this._rowIndices.push(
                Array.from(
                    {length: row.length},
                    () => visualIndex++
                )
            );
        }
        this._contentWidth = contentWidth;
        this._highlighted = -1;
        this._content = new St.BoxLayout({
            style_class: 'simple-taskbar-grid-alt-tab-content',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        const viewport = new St.Viewport({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        viewport.add_child(this._content);
        this.set_child(viewport);

        const tracker = Shell.WindowTracker.get_default();
        for (let index = 0; index < this.windows.length; index++) {
            const window = this.windows[index];
            const card = new GridAltTabCard(
                window,
                tracker,
                this._cardWidths[index],
                previewHeight
            );
            card.connectObject(
                'clicked',
                () => this.emit(
                    'item-activated',
                    this.cards.indexOf(card)
                ),
                'notify::hover',
                actor => {
                    if (actor.hover) {
                        this.emit(
                            'item-entered',
                            this.cards.indexOf(card)
                        );
                    }
                },
                this
            );
            window.connectObject(
                'unmanaged',
                () => this._removeWindow(window),
                this
            );
            this.cards.push(card);
        }
        this._layoutCards();
    }

    highlight(index) {
        if (this.cards[this._highlighted])
            this.cards[this._highlighted].remove_style_pseudo_class(
                'selected'
            );
        if (this.cards[index])
            this.cards[index].add_style_pseudo_class('selected');

        this._highlighted = index;
        this._scrollToCard(index);
    }

    destroy() {
        for (const window of this.windows)
            window.disconnectObject(this);
        for (const card of this.cards)
            card.disconnectObject(this);
        this.windows = null;
        this.cards = null;
        this._rowIndices = null;
        this._cardWidths = null;
        this._content = null;
        super.destroy();
    }

    _layoutCards() {
        for (const card of this.cards) {
            const parent = card.get_parent();
            if (parent)
                parent.remove_child(card);
        }
        this._content.destroy_all_children();

        for (const indices of this._rowIndices) {
            const row = new St.BoxLayout({
                style_class: 'simple-taskbar-grid-alt-tab-row',
                x_align: Clutter.ActorAlign.CENTER,
            });
            for (const index of indices)
                row.add_child(this.cards[index]);
            this._content.add_child(row);
        }
    }

    _scrollToCard(index) {
        if (!this.cards[index])
            return;

        const row = this._rowIndices.findIndex(
            indices => indices.includes(index)
        );
        const cardHeight = this.cards[index].height;
        const top = row * (cardHeight + CARD_SPACING);
        const bottom = top + cardHeight;
        const adjustment = this.vadjustment;
        const value = adjustment.value;
        const pageSize = adjustment.page_size;

        if (top < value)
            adjustment.ease(top, {duration: 100});
        else if (bottom > value + pageSize)
            adjustment.ease(bottom - pageSize, {duration: 100});
    }

    _removeWindow(window) {
        const index = this.windows.indexOf(window);
        if (index < 0)
            return;

        window.disconnectObject(this);
        const [card] = this.cards.splice(index, 1);
        this.windows.splice(index, 1);
        this._cardWidths.splice(index, 1);
        card.disconnectObject(this);
        card.destroy();
        this._rowIndices = this._rowIndices
            .map(row => row
                .filter(candidate => candidate !== index)
                .map(candidate =>
                    candidate > index ? candidate - 1 : candidate))
            .filter(row => row.length > 0);
        this._contentWidth = this._maximumRowWidth();
        this._layoutCards();
        this.emit('item-removed', index);
    }

    getVerticalIndex(index, direction) {
        const rowIndex = this._rowIndices.findIndex(
            row => row.includes(index)
        );
        const targetRow = this._rowIndices[rowIndex + direction];
        if (!targetRow)
            return index;

        const currentCenter = this._cardCenter(index);
        return targetRow.reduce((closest, candidate) =>
            Math.abs(this._cardCenter(candidate) - currentCenter) <
            Math.abs(this._cardCenter(closest) - currentCenter)
                ? candidate
                : closest);
    }

    _cardCenter(index) {
        const row = this._rowIndices.find(
            indices => indices.includes(index)
        );
        const rowWidth = this._rowWidth(row);
        let position = (this._contentWidth - rowWidth) / 2;
        for (const candidate of row) {
            const width = this._cardWidths[candidate];
            if (candidate === index)
                return position + width / 2;
            position += width + CARD_SPACING;
        }
        return position;
    }

    _rowWidth(row) {
        return row.reduce(
            (width, index) => width + this._cardWidths[index],
            CARD_SPACING * Math.max(0, row.length - 1)
        );
    }

    _maximumRowWidth() {
        if (this._rowIndices.length === 0)
            return 0;
        return Math.max(
            ...this._rowIndices.map(row => this._rowWidth(row))
        );
    }
});

export const GridAltTabPopup = GObject.registerClass(
class GridAltTabPopup extends SwitcherPopup.SwitcherPopup {
    _init(
        windows,
        monitor,
        maxPreviewHeight,
        forwardAction,
        backwardAction,
        focusedWindowFirst
    ) {
        super._init();

        this._monitor = monitor;
        this._forwardAction = forwardAction;
        this._backwardAction = backwardAction;
        this._focusedWindowFirst = focusedWindowFirst;
        this._switcherList = new GridAltTabList(
            windows,
            this._monitor,
            maxPreviewHeight
        );
        this._items = this._switcherList.cards;
    }

    vfunc_allocate(box) {
        this.set_allocation(box);

        const childBox = new Clutter.ActorBox();
        const themeNode = this.get_theme_node();
        const leftPadding = themeNode.get_padding(St.Side.LEFT);
        const rightPadding = themeNode.get_padding(St.Side.RIGHT);
        const horizontalPadding = leftPadding + rightPadding;
        const [, naturalHeight] =
            this._switcherList.get_preferred_height(
                this._monitor.width - horizontalPadding
            );
        const [, naturalWidth] =
            this._switcherList.get_preferred_width(naturalHeight);

        childBox.x1 = this._monitor.x +
            Math.floor((this._monitor.width - naturalWidth) / 2);
        childBox.x2 = childBox.x1 + naturalWidth;
        childBox.y1 = this._monitor.y +
            Math.floor((this._monitor.height - naturalHeight) / 2);
        childBox.y2 = childBox.y1 + naturalHeight;
        this._switcherList.allocate(childBox);
    }

    destroy() {
        this._monitor = null;
        this._forwardAction = Meta.KeyBindingAction.NONE;
        this._backwardAction = Meta.KeyBindingAction.NONE;
        this._focusedWindowFirst = false;
        super.destroy();
    }

    _initialSelection(backward) {
        if (backward)
            this._select(this._items.length - 1);
        else if (this._focusedWindowFirst &&
            this._items.length > 1)
            this._select(1);
        else
            this._select(0);
    }

    _keyPressHandler(keysym, action) {
        const rtl = Clutter.get_default_text_direction() ===
            Clutter.TextDirection.RTL;

        if (action === this._forwardAction) {
            this._select(this._next());
        } else if (action === this._backwardAction) {
            this._select(this._previous());
        } else if (keysym === Clutter.KEY_Left) {
            this._select(rtl ? this._next() : this._previous());
        } else if (keysym === Clutter.KEY_Right) {
            this._select(rtl ? this._previous() : this._next());
        } else if (keysym === Clutter.KEY_Up) {
            this._select(this._verticalIndex(-1));
        } else if (keysym === Clutter.KEY_Down) {
            this._select(this._verticalIndex(1));
        } else if (
            keysym === Clutter.KEY_w ||
            keysym === Clutter.KEY_W ||
            keysym === Clutter.KEY_F4
        ) {
            this._closeSelectedWindow();
        } else {
            return Clutter.EVENT_PROPAGATE;
        }

        return Clutter.EVENT_STOP;
    }

    _finish(timestamp) {
        const card = this._items[this._selectedIndex];
        if (card)
            Main.activateWindow(card.window, timestamp);
        super._finish(timestamp);
    }

    _verticalIndex(direction) {
        return this._switcherList.getVerticalIndex(
            this._selectedIndex,
            direction
        );
    }

    _closeSelectedWindow() {
        const card = this._items[this._selectedIndex];
        if (card.window.can_close())
            card.window.delete(global.get_current_time());
    }
});
