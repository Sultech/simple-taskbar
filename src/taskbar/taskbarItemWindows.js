// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function taskbarFocusWindow() {
    let window = global.display.focus_window;
    while (window && window.skip_taskbar)
        window = window.get_transient_for();
    return window;
}

export function windowsForTaskbarItem(item, interestingWindows) {
    if (item._taskbarIsLauncher)
        return [];

    const window = item._taskbarWindow;
    if (!window)
        return interestingWindows(item._taskbarApp);

    return interestingWindows(item._taskbarApp).includes(window)
        ? [window]
        : [];
}
