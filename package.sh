#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later

set -eu

UUID='simple-taskbar@sultech'
PROJECT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR="$PROJECT_DIR"
OUT_DIR=${1:-"$PROJECT_DIR/dist"}

glib-compile-schemas --strict "$SOURCE_DIR/schemas"

# Compile translations
if [ -d "$SOURCE_DIR/po" ]; then
    for po_file in "$SOURCE_DIR"/po/*.po; do
        [ -f "$po_file" ] || continue
        lang=$(basename "$po_file" .po)
        mkdir -p "$SOURCE_DIR/locale/$lang/LC_MESSAGES"
        msgfmt -o "$SOURCE_DIR/locale/$lang/LC_MESSAGES/$UUID.mo" "$po_file"
    done
fi

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
    --extra-source=startMenuKeybindings.js \
    --extra-source=taskbarAppMenu.js \
    --extra-source=taskbarController.js \
    --extra-source=taskbarLayout.js \
    --extra-source=themeUtils.js \
    --extra-source=windowController.js \
    --extra-source=windowPreviewController.js \
    --extra-source=windowsStartMenu.js \
    --extra-source=eleven-start-symbolic.svg \
    --extra-source=locale \
    --out-dir "$OUT_DIR" \
    "$SOURCE_DIR"

echo "Created $OUT_DIR/$UUID.shell-extension.zip"
