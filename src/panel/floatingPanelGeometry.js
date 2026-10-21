import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DOCK_EDGE_GAP} from '../shared/panelSizing.js';
import {hasMaximizedWindowOnMonitor} from '../windowVisibility.js';

export function floatingPanelEdgeGap(settings, monitor) {
    if (Main.overview.visibleTarget)
        return DOCK_EDGE_GAP;

    if (!settings.get_boolean('panel-autohide-enabled') &&
        !settings.get_boolean('panel-dodge-windows-enabled') &&
        hasMaximizedWindowOnMonitor(monitor)) {
        return 0;
    }

    return DOCK_EDGE_GAP;
}
