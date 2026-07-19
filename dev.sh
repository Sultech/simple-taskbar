#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later

set -eu

UUID='simple-taskbar@sultech'
PROJECT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR="$PROJECT_DIR"
ACCOUNT_HOME=$(getent passwd "$(id -u)" | cut -d: -f6)
ACCOUNT_HOME=${ACCOUNT_HOME:-$HOME}

case ${XDG_DATA_HOME:-} in
    "$ACCOUNT_HOME"/snap/*)
        DATA_HOME="$ACCOUNT_HOME/.local/share"
        ;;
    *)
        DATA_HOME=${XDG_DATA_HOME:-"$ACCOUNT_HOME/.local/share"}
        ;;
esac

EXTENSIONS_DIR="$DATA_HOME/gnome-shell/extensions"
TARGET_DIR="$EXTENSIONS_DIR/$UUID"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Extension source not found: $SOURCE_DIR" >&2
    exit 1
fi

if [ ! -x /usr/libexec/mutter-devkit ]; then
    echo "GNOME Shell 50's development window requires mutter-devkit." >&2
    echo "Install it on Ubuntu with:" >&2
    echo "  sudo apt install mutter-dev-bin" >&2
    exit 1
fi

if ! command -v glib-compile-schemas >/dev/null 2>&1; then
    echo "glib-compile-schemas is required for extension settings." >&2
    exit 1
fi

glib-compile-schemas "$SOURCE_DIR/schemas"

mkdir -p "$EXTENSIONS_DIR"

if [ -e "$TARGET_DIR" ] && [ ! -L "$TARGET_DIR" ]; then
    echo "A copied installation already exists at:" >&2
    echo "  $TARGET_DIR" >&2
    echo >&2
    echo "Disable the extension, remove that directory once, then run:" >&2
    echo "  $PROJECT_DIR/dev.sh" >&2
    exit 1
fi

if [ -L "$TARGET_DIR" ]; then
    LINK_TARGET=$(readlink -f "$TARGET_DIR")
    if [ "$LINK_TARGET" != "$SOURCE_DIR" ]; then
        echo "The existing symlink points somewhere else:" >&2
        echo "  $TARGET_DIR -> $LINK_TARGET" >&2
        exit 1
    fi
else
    ln -s "$SOURCE_DIR" "$TARGET_DIR"
    echo "Linked $TARGET_DIR -> $SOURCE_DIR"
fi

for EXTRA_DIR in "$EXTENSIONS_DIR/$UUID".*; do
    if [ -d "$EXTRA_DIR" ]; then
        echo "Warning: move this backup outside the extensions directory:" >&2
        echo "  $EXTRA_DIR" >&2
    fi
done

echo "Starting a fresh GNOME Shell 50 development session..."
echo "Close its window and run this script again after editing the extension."

export SHELL_DEBUG=backtrace-warnings
export HOME="$ACCOUNT_HOME"

# IDEs installed through Snap may inject incompatible libraries and schemas.
if [ -n "${SNAP:-}" ]; then
    unset GSETTINGS_SCHEMA_DIR GI_TYPELIB_PATH LD_LIBRARY_PATH
    unset GTK_PATH GTK_EXE_PREFIX GTK_DATA_PREFIX GIO_MODULE_DIR
    export XDG_DATA_DIRS=/usr/local/share:/usr/share
fi

exec /usr/bin/dbus-run-session /usr/bin/gnome-shell --devkit --wayland
