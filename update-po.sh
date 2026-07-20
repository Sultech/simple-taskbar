#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Update translation template and merge into existing .po files

set -eu

PROJECT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

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

# Merge new strings into each .po file
for po_file in po/*.po; do
    [ -f "$po_file" ] || continue
    lang=$(basename "$po_file" .po)
    msgmerge --update "$po_file" po/simple-taskbar.pot
    echo "Updated: $po_file"
done

echo "Done."
