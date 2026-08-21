// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Workspace} from 'resource:///org/gnome/shell/ui/workspace.js';
import {
    SecondaryMonitorDisplay,
} from 'resource:///org/gnome/shell/ui/workspacesView.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    TransientSignalHolder,
} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {extensionWillBeActive} from '../extensionState.js';
import {
    panelIsVertical,
    panelPosition,
} from '../panel/panelPosition.js';

const OVERVIEW_LABEL_MARGIN = 60;
const STARTUP_OVERVIEW_DELAY = 600;
const DESKTOP_DOCK_UUIDS = [
    'dash-to-dock@micxgx.gmail.com',
    'ubuntu-dock@ubuntu.com',
];

export class OverviewIntegration {
    constructor(panelHeight, settings) {
        this._panelHeight = panelHeight;
        this._settings = settings;
        this._dashState = null;
        this._dashVisibilityRepairId = 0;
        this._injectionManager = new InjectionManager();
        this._spreadInjectionManager = new InjectionManager();
        this._spreadApp = null;
        this._spreadHiddenId = 0;
        this._oldHasWorkspaces = null;
        this._signalHolder = new TransientSignalHolder();
        this._tracker = Shell.WindowTracker.get_default();
        this._startupState = null;
        this._startupOverviewId = 0;
        this._maximizedWindowDrag = null;
    }

    enable() {
        this._startupState = {
            hasOverview: Main.sessionMode.hasOverview,
        };
        this._settings.connectObject(
            'changed::default-gnome-panel', () => {
                this._syncStartupOverview();
                this._syncDashVisibility();
            },
            'changed::panel-autohide-enabled', () => this.queueRelayout(),
            this._signalHolder
        );
        Main.overview.connectObject(
            'window-drag-begin',
            (_overview, window) => this._beginMaximizedWindowDrag(window),
            'window-drag-end',
            (_overview, window) => this._endMaximizedWindowDrag(window),
            'window-drag-cancelled',
            (_overview, window) => this._cancelMaximizedWindowDrag(window),
            this._signalHolder
        );
        Main.extensionManager.connectObject(
            'extension-state-changed',
            (_manager, extension) => {
                if (!DESKTOP_DOCK_UUIDS.includes(extension.uuid))
                    return;

                this._syncStartupOverview();
                if (this._desktopDockIsEnabled())
                    this._cancelStartupOverview();
            },
            this._signalHolder
        );
        if (Main.layoutManager._startingUp) {
            Main.layoutManager.connectObject('startup-complete', () => {
                if (this._startupState) {
                    const startInOverview =
                        this._shouldStartInOverview();
                    Main.sessionMode.hasOverview = startInOverview ||
                        this._startupState.hasOverview;
                    if (startInOverview)
                        this._queueStartupOverview();
                    else
                        Main.overview.hide();
                }
            }, this._signalHolder);
        }
        this._syncStartupOverview();
        this._syncDashVisibility();
        this._watchDashVisibility();
        this._adaptAllocation();
    }

    setPanelHeight(panelHeight) {
        this._panelHeight = panelHeight;
        if (this._dashState)
            this._syncHiddenDashSize(this._dashState.dash);
        this.queueRelayout();
    }

    queueRelayout() {
        Main.overview._overview.controls.queue_relayout();
    }

    showAppWindows(app) {
        const overviewShown = Main.overview._shown;
        if (this._spreadApp === app) {
            if (overviewShown)
                Main.overview.hide();
            return;
        }

        this._spreadApp = app;
        if (!this._spreadHiddenId)
            this._beginAppSpread();

        if (overviewShown)
            this._rebuildOverviewWorkspaces();
        else
            Main.overview.show();
    }

    cancelAppSpread() {
        if (!this._spreadApp)
            return;

        if (Main.overview._shown)
            Main.overview.hide();
        else
            this._restoreAppSpread(false);
    }

    destroy() {
        const restoreVisible = !this._settings.get_boolean(
            'default-gnome-panel'
        );
        this._cancelStartupOverview();
        this._cancelDashVisibilityRepair();
        this._disconnectAppSpreadSignal();
        this._signalHolder.destroy();
        this._signalHolder = null;
        this._restoreAppSpreadState(true);
        this._spreadInjectionManager.clear();
        this._spreadInjectionManager = null;
        this._injectionManager.clear();
        this._injectionManager = null;
        this._restoreStartupOverview();
        this._restoreDash(restoreVisible);
        this.queueRelayout();
        this._maximizedWindowDrag = null;
        this._tracker = null;
        this._settings = null;
    }

    _beginMaximizedWindowDrag(window) {
        if (!window.maximized_horizontally || !window.maximized_vertically) {
            this._maximizedWindowDrag = null;
            return;
        }

        this._maximizedWindowDrag = {
            window,
            monitorIndex: window.get_monitor(),
        };
    }

    _endMaximizedWindowDrag(window) {
        const drag = this._maximizedWindowDrag;
        this._maximizedWindowDrag = null;
        if (!drag || drag.window !== window ||
            drag.monitorIndex === window.get_monitor()) {
            return;
        }

        const monitorIndex = window.get_monitor();
        this._unmaximizeWindow(window);
        window.move_to_monitor(monitorIndex);
        this._maximizeWindow(window);
    }

    _cancelMaximizedWindowDrag(window) {
        const drag = this._maximizedWindowDrag;
        if (drag && drag.window === window)
            this._maximizedWindowDrag = null;
    }

    _maximizeWindow(window) {
        const args = window.maximize.length
            ? [Meta.MaximizeFlags.BOTH]
            : [];
        window.maximize(...args);
    }

    _unmaximizeWindow(window) {
        const args = window.unmaximize.length
            ? [Meta.MaximizeFlags.BOTH]
            : [];
        window.unmaximize(...args);
    }

    _queueStartupOverview() {
        if (this._startupOverviewId || !this._shouldStartInOverview())
            return;

        this._startupOverviewId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            STARTUP_OVERVIEW_DELAY,
            () => {
                this._startupOverviewId = 0;
                if (this._shouldStartInOverview() &&
                    !Main.overview._shown) {
                    Main.overview.show();
                }
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelStartupOverview() {
        if (!this._startupOverviewId)
            return;

        GLib.Source.remove(this._startupOverviewId);
        this._startupOverviewId = 0;
    }

    _shouldStartInOverview() {
        return Boolean(
            this._settings.get_boolean('default-gnome-panel') &&
            !this._desktopDockIsEnabled()
        );
    }

    _desktopDockIsEnabled() {
        return DESKTOP_DOCK_UUIDS.some(extensionWillBeActive);
    }

    _syncStartupOverview() {
        if (!this._startupState)
            return;

        const startInOverview = this._shouldStartInOverview();
        if (Main.layoutManager._startingUp)
            Main.sessionMode.hasOverview = startInOverview;
    }

    _restoreStartupOverview() {
        if (!this._startupState)
            return;

        Main.sessionMode.hasOverview = this._startupState.hasOverview;
        this._startupState = null;
    }

    _syncDashVisibility() {
        if (this._settings.get_boolean('default-gnome-panel')) {
            this._cancelDashVisibilityRepair();
            this._restoreDash();
        } else {
            this._hideDash();
        }
        this.queueRelayout();
    }

    _watchDashVisibility() {
        const dash = Main.overview.dash;

        dash.connectObject('notify::visible', () => {
            if (dash.visible)
                this._queueDashVisibilityRepair();
        }, this._signalHolder);
    }

    _queueDashVisibilityRepair() {
        if (this._dashVisibilityRepairId ||
            this._settings.get_boolean('default-gnome-panel')) {
            return;
        }

        this._dashVisibilityRepairId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._dashVisibilityRepairId = 0;
                if (this._settings.get_boolean('default-gnome-panel'))
                    return GLib.SOURCE_REMOVE;

                const dash = Main.overview.dash;
                dash.hide();
                this._syncHiddenDashSize(dash);
                this.queueRelayout();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelDashVisibilityRepair() {
        if (!this._dashVisibilityRepairId)
            return;

        GLib.Source.remove(this._dashVisibilityRepairId);
        this._dashVisibilityRepairId = 0;
    }

    _hideDash() {
        if (this._dashState)
            return;

        const dash = Main.overview.dash;
        if (!dash)
            return;

        this._dashState = {
            dash,
            visible: dash.visible,
        };
        dash.hide();

        this._syncHiddenDashSize(dash);
    }

    _syncHiddenDashSize(dash) {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage)
            .scale_factor;
        const reserve = OVERVIEW_LABEL_MARGIN * scaleFactor;
        if (panelIsVertical(this._settings)) {
            dash.set_height(-1);
            dash.set_width(reserve);
        } else {
            dash.set_width(-1);
            dash.set_height(
                panelPosition(this._settings) === 'bottom' ? reserve : 0
            );
        }
    }

    _adaptAllocation() {
        const controls = Main.overview._overview.controls;

        const integration = this;
        this._injectionManager.overrideMethod(
            Object.getPrototypeOf(controls),
            'vfunc_allocate',
            originalAllocate => box => {
                // GNOME reserves external struts on every side except the
                // bottom, where Overview normally expects the stock dash.
                const position = panelPosition(integration._settings);
                if (position === 'bottom')
                    box.y2 -= integration._panelHeight;
                else if (integration._reserveAutoHiddenPanel()) {
                    const progress = Math.clamp(
                        controls._stateAdjustment.value,
                        0,
                        1
                    );
                    const inset = integration._panelHeight * progress;
                    if (position === 'top')
                        box.y1 += inset;
                    else if (position === 'left')
                        box.x1 += inset;
                    else
                        box.x2 -= inset;
                }
                originalAllocate.call(controls, box);
            }
        );
        this._injectionManager.overrideMethod(
            SecondaryMonitorDisplay.prototype,
            'vfunc_allocate',
            originalAllocate => function (box) {
                if (integration._reserveAutoHiddenPanel()) {
                    const progress = Math.clamp(
                        this._overviewAdjustment.value,
                        0,
                        1
                    );
                    const inset = integration._panelHeight * progress;
                    const position = panelPosition(integration._settings);
                    if (position === 'top')
                        box.y1 += inset;
                    else if (position === 'bottom')
                        box.y2 -= inset;
                    else if (position === 'left')
                        box.x1 += inset;
                    else
                        box.x2 -= inset;
                }
                originalAllocate.call(this, box);
            }
        );
    }

    _reserveAutoHiddenPanel() {
        return this._settings.get_boolean('panel-autohide-enabled');
    }

    _beginAppSpread() {
        this._oldHasWorkspaces = Main.sessionMode.hasWorkspaces;
        Main.sessionMode.hasWorkspaces = false;

        const controller = this;
        this._spreadInjectionManager.overrideMethod(
            Workspace.prototype,
            '_isMyWindow',
            originalMethod => function (metaWindow) {
                if (!controller._spreadApp || !metaWindow)
                    return originalMethod.call(this, metaWindow);

                const belongsToApp =
                    controller._tracker.get_window_app(metaWindow) ===
                    controller._spreadApp;
                const belongsToOverviewWorkspace =
                    this.metaWorkspace === null || this.metaWorkspace.active;
                const belongsToMonitor =
                    metaWindow.get_monitor() === this.monitorIndex;
                return belongsToApp &&
                    belongsToOverviewWorkspace &&
                    belongsToMonitor;
            }
        );

        this._spreadHiddenId = Main.overview.connect('hidden', () => {
            this._fadeInExcludedWindows();
            this._restoreAppSpread(false);
        });
    }

    _restoreAppSpread(rebuildOverview) {
        this._disconnectAppSpreadSignal();
        this._restoreAppSpreadState(rebuildOverview);
    }

    _disconnectAppSpreadSignal() {
        if (this._spreadHiddenId) {
            Main.overview.disconnect(this._spreadHiddenId);
            this._spreadHiddenId = 0;
        }
    }

    _restoreAppSpreadState(rebuildOverview) {
        this._spreadInjectionManager.restoreMethod(
            Workspace.prototype,
            '_isMyWindow'
        );
        if (this._oldHasWorkspaces !== null) {
            Main.sessionMode.hasWorkspaces = this._oldHasWorkspaces;
            this._oldHasWorkspaces = null;
        }
        this._spreadApp = null;

        if (rebuildOverview && Main.overview._shown) {
            this._rebuildOverviewWorkspaces();
        }
    }

    _rebuildOverviewWorkspaces() {
        const activeWorkspace =
            global.workspace_manager.get_active_workspace();
        const allWindows = global.get_window_actors()
            .map(actor => actor.meta_window);

        for (const workspace of this._getOverviewWorkspaces()) {
            const previews = workspace._container.layout_manager._windows;

            for (const preview of [...previews.keys()])
                preview.destroy();

            const metaWorkspace = workspace.metaWorkspace ?? activeWorkspace;
            if (metaWorkspace !== activeWorkspace)
                continue;
            for (const metaWindow of allWindows)
                workspace._doAddWindow(metaWindow);
        }
    }

    _getOverviewWorkspaces() {
        const views = Main.overview._overview.controls
            ._workspacesDisplay._workspacesViews;
        const workspaces = [];
        for (const view of views) {
            workspaces.push(...(view._workspaces ?? []));
            workspaces.push(...(view._workspacesView?._workspaces ?? []));
            const extraWorkspace = view._workspacesView?._workspace;
            if (extraWorkspace)
                workspaces.push(extraWorkspace);
        }
        return workspaces;
    }

    _fadeInExcludedWindows() {
        const app = this._spreadApp;
        if (!app)
            return;

        const activeWorkspace =
            global.workspace_manager.get_active_workspace();
        for (const metaWindow of activeWorkspace.list_windows()) {
            if (metaWindow.minimized || metaWindow.skip_taskbar ||
                metaWindow === global.display.focus_window ||
                this._tracker.get_window_app(metaWindow) === app) {
                continue;
            }

            const windowActor = metaWindow.get_compositor_private();
            const visual = windowActor?.get_first_child() ?? windowActor;
            if (!visual)
                continue;
            visual.opacity = 0;
            visual.ease({
                opacity: 255,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    _restoreDash(forceVisible = false) {
        if (!this._dashState && !forceVisible)
            return;

        const hiddenDash = this._dashState?.dash ?? Main.overview.dash;
        const visible = forceVisible || this._dashState?.visible;
        const dash = Main.overview.dash;
        // `dash.height` is its current allocation, not its preferred-height
        // setting. Restoring that value would force a fixed-size dash and can
        // leave it partly outside the overview. GNOME's stock dash uses its
        // natural height, represented by -1.
        hiddenDash.set_height(-1);
        hiddenDash.set_width(-1);
        dash.set_height(-1);
        dash.set_width(-1);
        if (visible) {
            this._resetDashItems(dash);
            dash.show();
            dash.queue_relayout();
            dash._queueRedisplay();
        } else {
            dash.hide();
        }
        this._dashState = null;
    }

    _resetDashItems(dash) {
        for (const item of dash._box.get_children()) {
            const child = item.child;
            if (!child || !child._delegate || !child._delegate.app)
                continue;

            if (item.animatingOut) {
                item.destroy();
                continue;
            }
            item.remove_all_transitions();
            item.show(false);
        }
    }
}
