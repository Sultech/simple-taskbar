// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {DODGE_WINDOW_MODE} from './shared/windowDodgeModes.js';

const HANDLED_WINDOW_TYPES = new Set([
    Meta.WindowType.NORMAL,
    Meta.WindowType.DOCK,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.TOOLBAR,
    Meta.WindowType.MENU,
    Meta.WindowType.UTILITY,
    Meta.WindowType.SPLASHSCREEN,
    Meta.WindowType.DROPDOWN_MENU,
]);
const IGNORED_APPLICATIONS = new Set([
    'com.rastersoft.ding',
    'com.desktop.ding',
]);

export function windowIsVisibleOnWorkspace(window, activeWorkspace) {
    if (window.get_workspace() !== activeWorkspace)
        return false;
    if (window.minimized)
        return false;

    const applicationId = window.get_gtk_application_id();
    if (IGNORED_APPLICATIONS.has(applicationId) &&
        window.is_skip_taskbar()) {
        return false;
    }
    if (window.get_wm_class() === 'DropDownTerminalWindow')
        return window.showing_on_its_workspace();

    return HANDLED_WINDOW_TYPES.has(window.get_window_type()) &&
        window.showing_on_its_workspace();
}

export function windowCoversPanel(window) {
    return window.maximized_horizontally && window.maximized_vertically;
}

export function windowReachesPanel(window) {
    return window.maximized_vertically || window.maximized_horizontally ||
        window.fullscreen;
}

function visibleWindowsOnMonitor(monitor) {
    const activeWorkspace = global.workspace_manager.get_active_workspace();
    return global.get_window_actors()
        .map(actor => actor.get_meta_window())
        .filter(window => window.get_monitor() === monitor.index &&
            windowIsVisibleOnWorkspace(window, activeWorkspace));
}

export function hasMaximizedWindowOnMonitor(monitor) {
    return visibleWindowsOnMonitor(monitor).some(windowCoversPanel);
}

export function hasWindowAffectingPanel(
    monitor,
    geometry,
    mode,
    distance
) {
    const windows = visibleWindowsOnMonitor(monitor);
    if (windows.length === 0)
        return false;

    const topWindow = windows[windows.length - 1];
    const tracker = Shell.WindowTracker.get_default();
    const topApp = tracker.get_window_app(topWindow);
    const focusApp = tracker.focus_app || topApp;
    const focusWindow = global.display.get_focus_window();

    for (const window of windows) {
        if (!windowMatchesMode(
            window,
            mode,
            focusApp,
            topApp,
            focusWindow,
            tracker,
            windowCoversPanel
        )) {
            continue;
        }

        if (mode === DODGE_WINDOW_MODE.MAXIMIZED_WINDOWS)
            return true;

        if (windowOverlapsPanel(window.get_frame_rect(), geometry, distance))
            return true;
    }

    return false;
}

export function windowMatchesMode(
    window,
    mode,
    focusApp,
    topApp,
    focusWindow,
    tracker,
    windowIsMaximized
) {
    if (mode === DODGE_WINDOW_MODE.ALL_WINDOWS)
        return true;

    if (mode === DODGE_WINDOW_MODE.FOCUSED_WINDOW)
        return window === focusWindow;

    if (mode === DODGE_WINDOW_MODE.FOCUSED_APPLICATION) {
        if (!focusApp)
            return true;
        if (window.get_wm_class() === 'DropDownTerminalWindow')
            return true;

        const application = tracker.get_window_app(window);
        const halfMaximized = focusWindow &&
            focusWindow.maximized_vertically &&
            !focusWindow.maximized_horizontally &&
            window.maximized_vertically &&
            !window.maximized_horizontally &&
            window.get_monitor() === focusWindow.get_monitor();
        return application === focusApp || application === topApp ||
            halfMaximized || window.is_above();
    }

    if (mode === DODGE_WINDOW_MODE.MAXIMIZED_WINDOWS)
        return windowIsMaximized(window);

    return false;
}

function windowOverlapsPanel(rect, geometry, distance) {
    return rect.x < geometry.x + geometry.width + distance &&
        rect.x + rect.width >= geometry.x - distance &&
        rect.y < geometry.y + geometry.height + distance &&
        rect.y + rect.height >= geometry.y - distance;
}
