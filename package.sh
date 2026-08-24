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
    --extra-source=docs \
    --extra-source=src \
    --extra-source=icons \
    --podir=po \
    --out-dir "$OUT_DIR" \
    "$SOURCE_DIR"

echo "Created $OUT_DIR/$UUID.shell-extension.zip"
