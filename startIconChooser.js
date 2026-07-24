// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DISTRO_NAMES = Object.freeze({
    arch: 'Arch Linux',
    athena: 'Athena OS',
    bazzite: 'Bazzite',
    budgie: 'Budgie',
    cachyos: 'CachyOS',
    centos: 'CentOS',
    debian: 'Debian',
    endeavouros: 'EndeavourOS',
    fedora: 'Fedora',
    gentoo: 'Gentoo',
    gnome: 'GNOME',
    'kali-linux': 'Kali Linux',
    manjaro: 'Manjaro',
    mx: 'MX Linux',
    nixos: 'NixOS',
    nobara: 'Nobara',
    opensuse: 'openSUSE',
    oreon: 'Oreon',
    pardus: 'Pardus',
    'pop-os': 'Pop!_OS',
    pureos: 'PureOS',
    raspbian: 'Raspberry Pi OS',
    redhat: 'Red Hat',
    solus: 'Solus',
    ubuntu: 'Ubuntu',
    voyager: 'Voyager',
    zorin: 'Zorin OS',
});

function distroIconDetails(filename) {
    let name = filename
        .replace(/^distro-/, '')
        .replace(/\.(?:png|svg)$/, '');
    const symbolic = name.endsWith('-symbolic');
    if (symbolic)
        name = name.slice(0, -'-symbolic'.length);

    const alternate = name.endsWith('-alt');
    if (alternate)
        name = name.slice(0, -'-alt'.length);

    let displayName = DISTRO_NAMES[name] ?? name
        .split('-')
        .map(part => `${part[0].toUpperCase()}${part.slice(1)}`)
        .join(' ');
    if (alternate)
        displayName = _('%s Alternate').replace('%s', displayName);
    const fullDisplayName = symbolic
        ? _('%s (Symbolic)').replace('%s', displayName)
        : displayName;

    return {
        displayName,
        fullDisplayName,
        searchText:
            `${fullDisplayName} ${name} distro`.toLowerCase(),
    };
}

function bundledIconFile(extensionPath, location) {
    const extensionDir = Gio.File.new_for_path(extensionPath);
    if (location === 'builtin:gnome') {
        return extensionDir
            .get_child('icons')
            .get_child('start')
            .get_child('gnome-start-symbolic.svg');
    }
    if (location === 'builtin:eleven') {
        return extensionDir
            .get_child('icons')
            .get_child('start')
            .get_child('eleven-start-symbolic.svg');
    }
    if (location.startsWith('distro:')) {
        return extensionDir
            .get_child('icons')
            .get_child('distros')
            .get_child(location.slice('distro:'.length));
    }
    return null;
}

export function getStartIconDisplayName(location) {
    if (location === 'builtin:gnome')
        return _('GNOME');
    if (location === 'builtin:eleven')
        return _('Eleven-style');
    if (location.startsWith('distro:')) {
        return distroIconDetails(
            location.slice('distro:'.length)
        ).fullDisplayName;
    }

    const file = location.includes('://')
        ? Gio.File.new_for_uri(location)
        : Gio.File.new_for_path(location);
    return file.get_basename() ?? location;
}

export const StartIconChooserDialog = GObject.registerClass(
class StartIconChooserDialog extends Adw.Window {
    _init({extensionPath, settings, parent}) {
        super._init({
            title: _('Choose a Start Button Icon'),
            transient_for: parent,
            modal: true,
            default_width: 620,
            default_height: 650,
        });

        this._extensionPath = extensionPath;
        this._settings = settings;
        this._query = '';

        const toolbarView = new Adw.ToolbarView();
        this.content = toolbarView;

        const headerBar = new Adw.HeaderBar({
            show_end_title_buttons: false,
            show_start_title_buttons: false,
        });
        toolbarView.add_top_bar(headerBar);

        const cancelButton = new Gtk.Button({
            label: _('Cancel'),
        });
        cancelButton.connect('clicked', () => this.close());
        headerBar.pack_start(cancelButton);

        this._selectButton = new Gtk.Button({
            label: _('Select'),
            css_classes: ['suggested-action'],
            sensitive: false,
        });
        this._selectButton.connect('clicked', () => {
            this._applySelection();
        });
        headerBar.pack_end(this._selectButton);

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 18,
            margin_bottom: 18,
            margin_start: 18,
            margin_end: 18,
        });
        toolbarView.content = content;

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: _('Search icons…'),
        });
        searchEntry.connect('search-changed', () => {
            this._query = searchEntry.text.trim().toLowerCase();
            this._iconGrid.invalidate_filter();
        });
        content.append(searchEntry);

        this._iconGrid = new Gtk.FlowBox({
            column_spacing: 8,
            row_spacing: 8,
            homogeneous: true,
            max_children_per_line: 7,
            min_children_per_line: 3,
            selection_mode: Gtk.SelectionMode.SINGLE,
            valign: Gtk.Align.START,
        });
        this._iconGrid.set_filter_func(child =>
            !this._query || child._searchText.includes(this._query)
        );
        this._iconGrid.connect('selected-children-changed', () => {
            this._selectButton.sensitive =
                this._iconGrid.get_selected_children().length > 0;
        });

        const scrolledWindow = new Gtk.ScrolledWindow({
            child: this._iconGrid,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vexpand: true,
        });
        content.append(scrolledWindow);

        const browseButton = new Gtk.Button({
            label: _('Browse Files…'),
            halign: Gtk.Align.CENTER,
        });
        browseButton.connect('clicked', () => {
            this._browseFiles();
        });
        content.append(browseButton);

        this._populateIcons();
    }

    _populateIcons() {
        const entries = [
            {
                location: 'builtin:gnome',
                displayName: _('GNOME'),
                searchText: 'gnome built in',
            },
            {
                location: 'builtin:eleven',
                displayName: _('Eleven-style'),
                searchText: 'eleven style built in',
            },
        ];

        const distroDirectory = Gio.File.new_for_path(this._extensionPath)
            .get_child('icons')
            .get_child('distros');
        const enumerator = distroDirectory.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
        for (
            let info = enumerator.next_file(null);
            info;
            info = enumerator.next_file(null)
        ) {
            const filename = info.get_name();
            if (!filename.startsWith('distro-') ||
                !/\.(?:png|svg)$/.test(filename)) {
                continue;
            }

            const details = distroIconDetails(filename);
            entries.push({
                location: `distro:${filename}`,
                ...details,
            });
        }
        enumerator.close(null);

        entries.sort((a, b) => {
            const aBuiltIn = a.location.startsWith('builtin:');
            const bBuiltIn = b.location.startsWith('builtin:');
            if (aBuiltIn !== bBuiltIn)
                return aBuiltIn ? -1 : 1;
            return a.displayName.localeCompare(b.displayName);
        });

        const currentLocation = this._settings.get_string(
            'start-button-custom-icon'
        );
        for (const entry of entries) {
            const child = this._createIconChild(entry);
            this._iconGrid.append(child);
            if (entry.location === currentLocation)
                this._iconGrid.select_child(child);
        }
    }

    _createIconChild(entry) {
        const file = bundledIconFile(
            this._extensionPath,
            entry.location
        );
        const image = new Gtk.Image({
            gicon: new Gio.FileIcon({file}),
            pixel_size: 40,
        });
        const label = new Gtk.Label({
            label: entry.displayName,
            ellipsize: Pango.EllipsizeMode.END,
            max_width_chars: 12,
            xalign: 0.5,
        });
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 8,
            margin_end: 8,
        });
        box.append(image);
        box.append(label);

        const child = new Gtk.FlowBoxChild({
            child: box,
            tooltip_text:
                entry.fullDisplayName ?? entry.displayName,
            focusable: true,
        });
        child._location = entry.location;
        child._searchText = entry.searchText;
        return child;
    }

    _applySelection() {
        const [selected] = this._iconGrid.get_selected_children();
        if (!selected)
            return;

        this._settings.set_string(
            'start-button-custom-icon',
            selected._location
        );
        this.close();
    }

    _browseFiles() {
        const imageFilter = new Gtk.FileFilter({
            name: _('Image Files'),
        });
        for (const mimeType of [
            'image/png',
            'image/svg+xml',
            'image/jpeg',
            'image/webp',
            'image/gif',
        ])
            imageFilter.add_mime_type(mimeType);

        const filters = new Gio.ListStore({
            item_type: Gtk.FileFilter,
        });
        filters.append(imageFilter);
        const dialog = new Gtk.FileDialog({
            title: _('Choose a Start Button Icon'),
            filters,
            default_filter: imageFilter,
        });
        dialog.open(this, null, (source, result) => {
            let file;
            try {
                file = source.open_finish(result);
            } catch (_error) {
                return;
            }

            this._settings.set_string(
                'start-button-custom-icon',
                file.get_uri()
            );
            this.close();
        });
    }
});
