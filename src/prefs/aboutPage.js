// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addProfileTransferGroup} from './profileTransfer.js';
import {addResetGroup} from './preferencesDialogs.js';
import {setButtonIcon} from './preferencesWidgets.js';

const GITHUB_URL = 'https://github.com/Sultech/simple-taskbar';
const ISSUES_URL = `${GITHUB_URL}/issues`;
const COFFEE_URL = 'https://www.buymeacoffee.com/sultech';
const CRYPTO_ADDRESS_ICON = 'send-to-symbolic';
const CRYPTO_ADDRESSES = [
    {
        name: 'Solana',
        symbol: 'SOL',
        address: 'BfYcvh1Ja3tUhRMJCuyBNHqdNwNxL7JKFAYLvnhSta2z',
    },
    {
        name: 'Ethereum',
        symbol: 'ETH',
        address: '0xaA076D2524e45abd2F2b5Be4f1Bee55b2437b635',
    },
    {
        name: 'Bitcoin',
        symbol: 'BTC',
        address: 'bc1qndvpprmgxc5wj3q5yf6vwdhx0whsdapvgasw2t',
    },
];

export function addAboutPage(window, extensionPath, settings, createSettings) {
    const page = new Adw.PreferencesPage({
        title: _('About'),
        icon_name: 'help-about-symbolic',
    });
    window.add(page);

    addHero(page, extensionPath);
    addLinks(page, window);
    addCredits(page);
    addSupport(page, window);
    addProfileTransferGroup(page, window, settings, createSettings);
    addResetGroup(page, window, createSettings);
    return page;
}

function addHero(page, extensionPath) {
    const group = new Adw.PreferencesGroup();
    page.add(group);

    const heroBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        halign: Gtk.Align.CENTER,
        margin_top: 24,
        margin_bottom: 12,
    });
    const logo = Gtk.Image.new_from_file(
        `${extensionPath}/icons/simple-taskbar-logo.png`
    );
    logo.set_pixel_size(128);
    heroBox.append(logo);
    heroBox.append(new Gtk.Label({
        label: _('Simple Taskbar'),
        css_classes: ['title-1'],
        margin_top: 8,
    }));
    heroBox.append(new Gtk.Label({
        label: _('A configurable taskbar, GNOME panel, and Dock for GNOME Shell'),
        css_classes: ['dim-label'],
        margin_bottom: 4,
    }));
    heroBox.append(new Gtk.Label({
        label: _('GNOME Shell 48–51 • GPL-2.0-or-later'),
        css_classes: ['dim-label', 'caption'],
    }));

    const row = new Adw.ActionRow();
    row.set_child(heroBox);
    group.add(row);
}

function addLinks(page, window) {
    const group = new Adw.PreferencesGroup({
        title: _('Links'),
    });
    page.add(group);

    addExternalLink(
        group,
        window,
        _('GitHub Repository'),
        'github.com/Sultech/simple-taskbar',
        'system-software-install-symbolic',
        GITHUB_URL
    );
    addExternalLink(
        group,
        window,
        _('Report an Issue'),
        'github.com/Sultech/simple-taskbar/issues',
        'dialog-warning-symbolic',
        ISSUES_URL
    );
}

function addExternalLink(group, window, title, subtitle, icon, url) {
    const row = new Adw.ActionRow({
        title,
        subtitle,
        icon_name: icon,
        activatable: true,
    });
    row.add_suffix(new Gtk.Image({
        icon_name: 'adw-external-link-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['dim-label'],
    }));
    row.connect('activated', () => {
        Gio.AppInfo.launch_default_for_uri(
            url,
            window.get_display().get_app_launch_context()
        );
    });
    group.add(row);
}

function addCredits(page) {
    const group = new Adw.PreferencesGroup({
        title: _('Credits'),
    });
    page.add(group);

    group.add(new Adw.ActionRow({
        title: _('Sultech'),
        subtitle: _('Author'),
        icon_name: 'avatar-default-symbolic',
    }));
    group.add(new Adw.ActionRow({
        title: _('Features'),
        subtitle: _('Configurable Taskbar, Default GNOME Panel, Dock and Windows XP Theme modes · Live window previews · Grid Alt-Tab · Start Menu · Multi-monitor support'),
        icon_name: 'starred-symbolic',
    }));
    group.add(new Adw.ActionRow({
        title: _('License'),
        subtitle: _('Simple Taskbar is distributed under GPL-2.0-or-later'),
        icon_name: 'dialog-information-symbolic',
    }));
}

function addSupport(page, window) {
    const group = new Adw.PreferencesGroup({
        title: _('Support Development'),
        description: _('If Simple Taskbar is useful to you, consider supporting its development.'),
    });
    page.add(group);

    addExternalLink(
        group,
        window,
        _('Buy Me a Coffee'),
        'buymeacoffee.com/sultech',
        'emoji-food-symbolic',
        COFFEE_URL
    );
    for (const {name, symbol, address} of CRYPTO_ADDRESSES)
        addCryptoAddress(group, window, name, symbol, address);
}

function addCryptoAddress(group, window, name, symbol, address) {
    const shortAddress = address.length > 24
        ? `${address.slice(0, 12)}…${address.slice(-8)}`
        : address;
    const row = new Adw.ActionRow({
        title: `${name} (${symbol})`,
        subtitle: shortAddress,
        icon_name: CRYPTO_ADDRESS_ICON,
    });
    const copyButton = new Gtk.Button({
        valign: Gtk.Align.CENTER,
        css_classes: ['flat', 'circular'],
        tooltip_text: _('Copy %s address').replace('%s', name),
    });
    setButtonIcon(copyButton, 'edit-copy-symbolic');
    copyButton.connect('clicked', () => {
        window.get_display().get_clipboard().set_content(
            Gdk.ContentProvider.new_for_value(address)
        );
        window.add_toast(new Adw.Toast({
            title: _('%s address copied').replace('%s', name),
            timeout: 2,
        }));
    });
    row.add_suffix(copyButton);
    group.add(row);
}
