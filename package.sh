#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later

set -eu

UUID='simple-taskbar@sultech'
PROJECT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR="$PROJECT_DIR"
OUT_DIR=${1:-"$PROJECT_DIR/dist"}

if ! command -v msgfmt >/dev/null 2>&1; then
    printf '%s\n' \
        'Error: msgfmt is required to build Simple Taskbar.' \
        'Install GNU gettext and run this script again.' \
        'Ubuntu/Debian: sudo apt install gettext' >&2
    exit 1
fi

glib-compile-schemas --strict "$SOURCE_DIR/schemas"

mkdir -p "$OUT_DIR"

gnome-extensions pack \
    --force \
    --extra-source=COPYING \
    --extra-source=ASSET-CREDITS.md \
    --extra-source=blurMyShellUtils.js \
    --extra-source=applicationOverflowController.js \
    --extra-source=extensionConflictController.js \
    --extra-source=panelButtonPaddingController.js \
    --extra-source=panelItemOrder.js \
    --extra-source=panelMenuPositioner.js \
    --extra-source=panelPosition.js \
    --extra-source=folderMenuController.js \
    --extra-source=fileManagerPlacesSection.js \
    --extra-source=favoritesIntegration.js \
    --extra-source=gridAltTabController.js \
    --extra-source=gridAltTabPopup.js \
    --extra-source=hotEdgeController.js \
    --extra-source=keybindingRecovery.js \
    --extra-source=keybindingUtils.js \
    --extra-source=overviewIntegration.js \
    --extra-source=multiMonitorController.js \
    --extra-source=notificationBannerController.js \
    --extra-source=panelController.js \
    --extra-source=panelAutoHideController.js \
    --extra-source=panelInteractionController.js \
    --extra-source=quickSettingsPowerController.js \
    --extra-source=startButtonController.js \
    --extra-source=prefs \
    --extra-source=startMenuAppMenu.js \
    --extra-source=startMenuKeybindings.js \
    --extra-source=startMenuPinnedDragController.js \
    --extra-source=startMenuSearchController.js \
    --extra-source=switcherKeybindingRouter.js \
    --extra-source=taskbarAppMenu.js \
    --extra-source=taskbarController.js \
    --extra-source=taskManagerUtils.js \
    --extra-source=trayOverflowController.js \
    --extra-source=taskbarLayout.js \
    --extra-source=taskbarViewport.js \
    --extra-source=themeUtils.js \
    --extra-source=transparencyUtils.js \
    --extra-source=volumeMixerController.js \
    --extra-source=windowController.js \
    --extra-source=windowPreviewController.js \
    --extra-source=windowsStartMenu.js \
    --extra-source=icons \
    --podir=po \
    --out-dir "$OUT_DIR" \
    "$SOURCE_DIR"

echo "Created $OUT_DIR/$UUID.shell-extension.zip"
