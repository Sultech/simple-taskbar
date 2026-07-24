// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {
    QuickMenuToggle,
    SystemIndicator,
} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {
    getMixerControl,
} from 'resource:///org/gnome/shell/ui/status/volume.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

function normalizeAppIdentifier(value) {
    return value
        .toLowerCase()
        .replace(/\.desktop$/, '')
        .replace(/[^a-z0-9]/g, '');
}

function findStreamApp(stream, appSystem) {
    const identifiers = [
        stream.get_application_id(),
        stream.get_name(),
    ].filter(Boolean);

    for (const identifier of identifiers) {
        const desktopId = identifier.endsWith('.desktop')
            ? identifier
            : `${identifier}.desktop`;
        const app = appSystem.lookup_app(desktopId) ||
            appSystem.lookup_heuristic_basename(desktopId) ||
            appSystem.lookup_startup_wmclass(identifier) ||
            appSystem.lookup_desktop_wmclass(identifier);
        if (app)
            return app;
    }

    const streamIdentifiers = identifiers.map(normalizeAppIdentifier);
    if (streamIdentifiers.length === 0)
        return null;

    return appSystem.get_running().find(app => {
        const appIdentifiers = [
            app.get_id(),
            app.get_name(),
        ].map(normalizeAppIdentifier);
        return appIdentifiers.some(appIdentifier =>
            streamIdentifiers.some(streamIdentifier =>
                appIdentifier === streamIdentifier ||
                appIdentifier.endsWith(streamIdentifier)
            )
        );
    }) ?? null;
}

const ApplicationVolumeRow = GObject.registerClass(
class ApplicationVolumeRow extends PopupMenu.PopupBaseMenuItem {
    _init(stream, control, appSystem) {
        super._init({
            reactive: false,
            can_focus: false,
            style_class: 'simple-taskbar-volume-mixer-row',
        });

        this._stream = stream;
        this._control = control;

        const app = findStreamApp(stream, appSystem);
        const streamIcon = app ? app.get_icon() : stream.get_gicon();
        const icon = new St.Icon({
            ...(streamIcon
                ? {gicon: streamIcon}
                : {icon_name: 'audio-x-generic-symbolic'}),
            style_class: 'simple-taskbar-volume-mixer-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(icon);

        const name = (app ? app.get_name() : null) ||
            stream.get_name() ||
            stream.get_description() ||
            stream.get_application_id() ||
            _('Application');
        const detailsBox = new St.BoxLayout({
            style_class: 'simple-taskbar-volume-mixer-details',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this.add_child(detailsBox);

        const titleBox = new St.BoxLayout({
            style_class: 'simple-taskbar-volume-mixer-title',
            x_expand: true,
        });
        detailsBox.add_child(titleBox);

        const appLabel = new St.Label({
            text: name,
            style_class: 'simple-taskbar-volume-mixer-app-name',
            y_align: Clutter.ActorAlign.CENTER,
        });
        appLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        titleBox.add_child(appLabel);

        this._windowLabel = new St.Label({
            style_class: 'simple-taskbar-volume-mixer-window-title',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._windowLabel.clutter_text.ellipsize =
            Pango.EllipsizeMode.END;
        titleBox.add_child(this._windowLabel);

        this.slider = new Slider(0);
        this.slider.accessible_name =
            _('%s volume').replace('%s', name);
        const sliderBin = new St.Bin({
            style_class: 'slider-bin simple-taskbar-volume-mixer-slider',
            child: this.slider,
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        sliderBin.connect(
            'event',
            (actor, event) => this.slider.event(event, false)
        );
        detailsBox.add_child(sliderBin);

        this._sliderChangedId = this.slider.connect(
            'notify::value',
            () => this._sliderChanged()
        );
        stream.connectObject(
            'notify::is-muted', this._sync.bind(this),
            'notify::volume', this._sync.bind(this),
            this
        );
        this._app = app;
        this._window = null;
        if (app) {
            app.connectObject(
                'windows-changed', this._syncWindowTitle.bind(this),
                this
            );
            global.display.connectObject(
                'notify::focus-window',
                this._syncWindowTitle.bind(this),
                this
            );
        }
        this._syncWindowTitle();
        this._sync();
    }

    _syncWindowTitle() {
        let window = null;
        if (this._app) {
            const windows = this._app.get_windows()
                .filter(candidate => !candidate.is_skip_taskbar());
            window = windows.find(candidate => candidate.has_focus()) ||
                windows[0] ||
                null;
        }

        if (window !== this._window) {
            if (this._window)
                this._window.disconnectObject(this);
            this._window = window;
            if (window) {
                window.connectObject(
                    'notify::title',
                    this._syncWindowTitle.bind(this),
                    this
                );
            }
        }

        const title = window ? window.get_title() : null;
        const appName = this._app ? this._app.get_name() : null;
        this._windowLabel.text =
            title && title !== appName ? `— ${title}` : '';
        this._windowLabel.visible = this._windowLabel.text.length > 0;
    }

    _sync() {
        const normalVolume = this._control.get_vol_max_norm();
        const value = this._stream.is_muted
            ? 0
            : Math.clamp(this._stream.volume / normalVolume, 0, 1);

        this.slider.block_signal_handler(this._sliderChangedId);
        this.slider.value = value;
        this.slider.unblock_signal_handler(this._sliderChangedId);
    }

    _sliderChanged() {
        const volume = Math.round(
            this.slider.value * this._control.get_vol_max_norm()
        );
        this._stream.volume = volume;
        if (volume < 1) {
            if (!this._stream.is_muted)
                this._stream.change_is_muted(true);
        } else if (this._stream.is_muted) {
            this._stream.change_is_muted(false);
        }
        this._stream.push_volume();
    }

    destroy() {
        this.slider.disconnect(this._sliderChangedId);
        this._sliderChangedId = 0;
        super.destroy();
    }
});

const VolumeMixerToggle = GObject.registerClass(
class VolumeMixerToggle extends QuickMenuToggle {
    _init(control, appSystem, openSoundSettings) {
        super._init({
            title: _('Mixer'),
            iconName: 'audio-volume-high-symbolic',
            toggleMode: false,
        });

        this._control = control;
        this._appSystem = appSystem;
        this._streamRows = new Map();
        this._emptyItem = null;
        this.menuButtonAccessibleName =
            _('Open application volume controls');
        this.menu.setHeader(
            'audio-volume-high-symbolic',
            _('Application Volume')
        );
        this._streamSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._streamSection);

        this.connect('clicked', openSoundSettings);
        control.connectObject(
            'state-changed', this._syncStreams.bind(this),
            'stream-added', this._syncStreams.bind(this),
            'stream-removed', this._syncStreams.bind(this),
            this
        );
        this._syncStreams();
    }

    _syncStreams() {
        const streams = this._control.get_sink_inputs()
            .filter(stream => !stream.is_event_stream)
            .sort((a, b) => {
                const aName = a.get_name() || a.get_description() || '';
                const bName = b.get_name() || b.get_description() || '';
                return aName.localeCompare(bName);
            });
        const streamIds = new Set(streams.map(stream => stream.get_id()));

        for (const [id, row] of this._streamRows) {
            if (streamIds.has(id))
                continue;

            row.destroy();
            this._streamRows.delete(id);
        }

        for (const stream of streams) {
            const id = stream.get_id();
            if (this._streamRows.has(id))
                continue;

            const row = new ApplicationVolumeRow(
                stream,
                this._control,
                this._appSystem
            );
            this._streamSection.addMenuItem(row);
            this._streamRows.set(id, row);
        }

        if (this._streamRows.size === 0 && !this._emptyItem) {
            this._emptyItem = new PopupMenu.PopupMenuItem(
                _('No applications are playing audio'),
                {reactive: false}
            );
            this._streamSection.addMenuItem(this._emptyItem);
        } else if (this._streamRows.size > 0 && this._emptyItem) {
            this._emptyItem.destroy();
            this._emptyItem = null;
        }
    }

    destroy() {
        super.destroy();
        this._streamRows.clear();
        this._emptyItem = null;
        this._streamSection = null;
        this._control = null;
        this._appSystem = null;
    }
});

const VolumeMixerIndicator = GObject.registerClass(
class VolumeMixerIndicator extends SystemIndicator {
    _init(control, appSystem, openSoundSettings) {
        super._init();

        this.quickSettingsItems.push(
            new VolumeMixerToggle(control, appSystem, openSoundSettings)
        );
    }
});

export class VolumeMixerController {
    constructor(settings, quickSettings) {
        this._settings = settings;
        this._quickSettings = quickSettings;
        this._indicator = null;
        this._control = getMixerControl();
        this._appSystem = Shell.AppSystem.get_default();
    }

    enable() {
        this._settings.connectObject(
            'changed::volume-mixer-enabled',
            this._sync.bind(this),
            this
        );
        this._sync();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._destroyIndicator();
        this._settings = null;
        this._quickSettings = null;
        this._control = null;
        this._appSystem = null;
    }

    _sync() {
        if (this._settings.get_boolean('volume-mixer-enabled')) {
            if (!this._indicator) {
                this._indicator = new VolumeMixerIndicator(
                    this._control,
                    this._appSystem,
                    this._openSoundSettings.bind(this)
                );
                this._quickSettings.addExternalIndicator(this._indicator);
            }
        } else {
            this._destroyIndicator();
        }
    }

    _destroyIndicator() {
        if (!this._indicator)
            return;

        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        this._indicator = null;
    }

    _openSoundSettings() {
        const app = this._appSystem.lookup_app(
            'gnome-sound-panel.desktop'
        );
        if (!app)
            return;

        this._quickSettings.menu.close();
        Main.overview.hide();
        app.activate();
    }
}
