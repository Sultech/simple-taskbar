// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';

export function getScrollDelta(event, increment) {
    switch (event.get_scroll_direction()) {
    case Clutter.ScrollDirection.UP:
    case Clutter.ScrollDirection.LEFT:
        return -increment;
    case Clutter.ScrollDirection.DOWN:
    case Clutter.ScrollDirection.RIGHT:
        return increment;
    case Clutter.ScrollDirection.SMOOTH: {
        const [dx, dy] = event.get_scroll_delta();
        return (Math.abs(dx) > Math.abs(dy) ? dx : dy) * increment;
    }
    }

    return 0;
}
