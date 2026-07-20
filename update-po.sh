#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Update translation template and compile all .po files

set -eu

PROJECT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
UUID='simple-taskbar@sultech'

cd "$PROJECT_DIR"

# Extract translatable strings
echo "Extracting translatable strings..."
xgettext \
    --language=JavaScript \
    --from-code=UTF-8 \
    --package-name=simple-taskbar \
    --package-version=1.0 \
    --copyright-holder="sultech" \
    -o po/simple-taskbar.pot \
    $(cat po/POTFILES.in)

echo "Template: po/simple-taskbar.pot"

# Compile each .po file
for po_file in po/*.po; do
    [ -f "$po_file" ] || continue
    lang=$(basename "$po_file" .po)
    mkdir -p "locale/$lang/LC_MESSAGES"
    msgfmt -o "locale/$lang/LC_MESSAGES/$UUID.mo" "$po_file"
    echo "Compiled: locale/$lang/LC_MESSAGES/$UUID.mo"
done

echo "Done."
