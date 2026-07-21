#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later

set -eu

UUID='simple-taskbar@sultech'
PROJECT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR="$PROJECT_DIR"
OUT_DIR=${1:-"$PROJECT_DIR/dist"}

glib-compile-schemas --strict "$SOURCE_DIR/schemas"

mkdir -p "$OUT_DIR"

gnome-extensions pack \
    --force \
    --extra-source=COPYING \
    --extra-source=extensionConflictController.js \
    --extra-source=panelMenuPositioner.js \
    --extra-source=panelPosition.js \
    --extra-source=folderMenuController.js \
    --extra-source=favoritesIntegration.js \
    --extra-source=overviewIntegration.js \
    --extra-source=multiMonitorController.js \
    --extra-source=notificationBannerController.js \
    --extra-source=panelController.js \
    --extra-source=panelAutoHideController.js \
    --extra-source=panelInteractionController.js \
    --extra-source=startButtonController.js \
    --extra-source=startMenuAppMenu.js \
    --extra-source=startMenuKeybindings.js \
    --extra-source=startMenuSearchController.js \
    --extra-source=taskbarAppMenu.js \
    --extra-source=taskbarController.js \
    --extra-source=taskbarLayout.js \
    --extra-source=themeUtils.js \
    --extra-source=windowController.js \
    --extra-source=windowPreviewController.js \
    --extra-source=windowsStartMenu.js \
    --extra-source=eleven-start-symbolic.svg \
    --podir=po \
    --out-dir "$OUT_DIR" \
    "$SOURCE_DIR"

echo "Created $OUT_DIR/$UUID.shell-extension.zip"
