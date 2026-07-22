// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import {Workspace} from 'resource:///org/gnome/shell/ui/workspace.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelIsTop} from './panelPosition.js';

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
        this._signals = [];
        this._tracker = Shell.WindowTracker.get_default();
        this._startupState = null;
        this._startupOverviewId = 0;
    }

    enable() {
        this._startupState = {
            hasOverview: Main.sessionMode.hasOverview,
        };
        this._connect(
            this._settings,
            'changed::default-gnome-panel',
            () => {
                this._syncStartupOverview();
                this._syncDashVisibility();
            }
        );
        this._connect(
            Main.extensionManager,
            'extension-state-changed',
            (_manager, extension) => {
                if (!DESKTOP_DOCK_UUIDS.includes(extension?.uuid))
                    return;

                this._syncStartupOverview();
                if (this._desktopDockIsEnabled())
                    this._cancelStartupOverview();
            }
        );
        if (Main.layoutManager._startingUp) {
            this._connect(Main.layoutManager, 'startup-complete', () => {
                if (this._startupState) {
                    const startInOverview =
                        this._shouldStartInOverview();
                    Main.sessionMode.hasOverview = startInOverview ||
                        this._startupState.hasOverview;
                    if (startInOverview)
                        this._queueStartupOverview();
                }
            });
        } else if (this._shouldStartInOverview()) {
            this._queueStartupOverview();
        }
        this._syncStartupOverview();
        this._syncDashVisibility();
        this._watchDashVisibility();
        this._adaptAllocation();
    }

    setPanelHeight(panelHeight) {
        this._panelHeight = panelHeight;
        if (this._dashState)
            this._dashState.dash.set_height(this._getDashHeight());
        this.queueRelayout();
    }

    syncPanelPosition() {
        if (this._dashState)
            this._dashState.dash.set_height(this._getDashHeight());
        this.queueRelayout();
    }

    queueRelayout() {
        Main.overview._overview?._controls?.queue_relayout();
    }

    showAppWindows(app) {
        const overviewShown = Main.overview._shown ?? Main.overview.visible;
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

        if (Main.overview._shown ?? Main.overview.visible)
            Main.overview.hide();
        else
            this._restoreAppSpread(false);
    }

    destroy() {
        const restoreVisible = Boolean(
            this._settings &&
            !this._settings.get_boolean('default-gnome-panel')
        );
        this._cancelStartupOverview();
        this._cancelDashVisibilityRepair();
        // If the extension is disabled while the spread is visible, rebuild
        // the live Overview after restoring GNOME's normal window filter.
        this._restoreAppSpread(true);
        this._spreadInjectionManager?.clear();
        this._spreadInjectionManager = null;
        this._injectionManager?.clear();
        this._injectionManager = null;
        for (const [object, id] of this._signals) {
            if (id)
                object.disconnect(id);
        }
        this._signals = [];
        this._restoreStartupOverview();
        this._restoreDash(restoreVisible);
        this.queueRelayout();
        this._tracker = null;
        this._settings = null;
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
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
                    !(Main.overview._shown ?? Main.overview.visible)) {
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
            this._settings?.get_boolean('default-gnome-panel') &&
            !this._desktopDockIsEnabled()
        );
    }

    _desktopDockIsEnabled() {
        return DESKTOP_DOCK_UUIDS.some(uuid => {
            const extension = Main.extensionManager.lookup(uuid);
            return Boolean(
                extension?.enabled ||
                extension?.state === ExtensionUtils.ExtensionState.ACTIVE
            );
        });
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
        const dash = Main.overview._overview?._controls?.dash ??
            Main.overview.dash;
        if (!dash)
            return;

        this._connect(dash, 'notify::visible', () => {
            if (dash.visible)
                this._queueDashVisibilityRepair();
        });
    }

    _queueDashVisibilityRepair() {
        if (this._dashVisibilityRepairId ||
            !this._settings ||
            this._settings.get_boolean('default-gnome-panel')) {
            return;
        }

        this._dashVisibilityRepairId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            () => {
                this._dashVisibilityRepairId = 0;
                if (!this._settings ||
                    this._settings.get_boolean('default-gnome-panel')) {
                    return GLib.SOURCE_REMOVE;
                }

                const dash = Main.overview._overview?._controls?.dash ??
                    Main.overview.dash;
                if (dash) {
                    dash.hide();
                    dash.set_height(this._getDashHeight());
                    this.queueRelayout();
                }
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

        // Keep space for overview window labels above the bottom taskbar.
        dash.set_height(this._getDashHeight());
    }

    _getDashHeight() {
        if (panelIsTop(this._settings))
            return 0;

        const scaleFactor = St.ThemeContext.get_for_stage(global.stage)
            .scale_factor;
        return Math.max(
            this._panelHeight,
            OVERVIEW_LABEL_MARGIN * scaleFactor
        );
    }

    _adaptAllocation() {
        const controls = Main.overview._overview?._controls;
        if (!controls)
            return;

        this._injectionManager.overrideMethod(
            Object.getPrototypeOf(controls),
            'vfunc_allocate',
            originalAllocate => box => {
                // GNOME reserves external struts on every side except the
                // bottom, where Overview normally expects the stock dash.
                if (!panelIsTop(this._settings))
                    box.y2 -= this._panelHeight;
                originalAllocate.call(controls, box);
            }
        );
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
        if (this._spreadHiddenId) {
            Main.overview.disconnect(this._spreadHiddenId);
            this._spreadHiddenId = 0;
        }
        this._spreadInjectionManager?.restoreMethod(
            Workspace.prototype,
            '_isMyWindow'
        );
        if (this._oldHasWorkspaces !== null) {
            Main.sessionMode.hasWorkspaces = this._oldHasWorkspaces;
            this._oldHasWorkspaces = null;
        }
        this._spreadApp = null;

        if (rebuildOverview &&
            (Main.overview._shown ?? Main.overview.visible)) {
            this._rebuildOverviewWorkspaces();
        }
    }

    _rebuildOverviewWorkspaces() {
        const activeWorkspace =
            global.workspace_manager.get_active_workspace();
        const allWindows = global.get_window_actors()
            .map(actor => actor.meta_window);

        for (const workspace of this._getOverviewWorkspaces()) {
            const previews = workspace?._container?.layout_manager?._windows;
            if (!previews || !workspace?._doAddWindow)
                continue;

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
        const views = Main.overview._overview?._controls
            ?._workspacesDisplay?._workspacesViews ?? [];
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
        const dash = Main.overview._overview?._controls?.dash ?? hiddenDash;
        if (!dash) {
            this._dashState = null;
            return;
        }
        // `dash.height` is its current allocation, not its preferred-height
        // setting. Restoring that value would force a fixed-size dash and can
        // leave it partly outside the overview. GNOME's stock dash uses its
        // natural height, represented by -1.
        hiddenDash?.set_height(-1);
        dash.set_height(-1);
        if (visible) {
            dash.show();
            dash.queue_relayout();
            dash._queueRedisplay?.();
        } else {
            dash.hide();
        }
        this._dashState = null;
    }
}
