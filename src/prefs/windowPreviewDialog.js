import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    addSpinRow,
    createSwitchRow,
    setButtonIcon,
} from './preferencesWidgets.js';

const WINDOW_PREVIEW_SETTINGS = [
    'show-window-previews-timeout',
    'leave-timeout',
    'peek-mode',
    'enter-peek-mode-timeout',
    'peek-mode-opacity',
    'preview-middle-click-close',
];

export function createWindowPreviewOptionsButton(settings) {
    const button = new Gtk.Button({
        tooltip_text: _('Window Preview Options'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(button, 'emblem-system-symbolic');
    button.add_css_class('flat');
    button.add_css_class('circular');
    button.connect('clicked', () => {
        const dialog = new WindowPreviewOptionsDialog({
            settings,
            parent: button.get_root(),
        });
        dialog.present();
    });
    return button;
}

export const WindowPreviewOptionsDialog = GObject.registerClass(
class WindowPreviewOptionsDialog extends Adw.Window {
    _init({settings, parent}) {
        super._init({
            title: _('Window Preview Options'),
            transient_for: parent,
            modal: true,
            default_width: 640,
            default_height: 500,
        });

        this._settings = settings;
        this._settingsConnections = [];

        const connectSettings = (object, signal, callback) => {
            const id = object.connect(signal, callback);
            this._settingsConnections.push({object, id});
        };

        const toolbarView = new Adw.ToolbarView();
        this.content = toolbarView;

        const headerBar = new Adw.HeaderBar({
            show_end_title_buttons: false,
            show_start_title_buttons: false,
        });
        toolbarView.add_top_bar(headerBar);

        const resetButton = new Gtk.Button({
            label: _('Reset to Defaults'),
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => this._reset());
        headerBar.pack_start(resetButton);

        const closeButton = new Gtk.Button({
            label: _('Close'),
            valign: Gtk.Align.CENTER,
        });
        closeButton.connect('clicked', () => this.close());
        headerBar.pack_end(closeButton);

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 24,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
        });

        const timingGroup = new Adw.PreferencesGroup({
            title: _('Preview Timing'),
            description: _('Control when previews open and close'),
        });
        content.append(timingGroup);
        addSpinRow(
            timingGroup,
            settings,
            {
                key: 'show-window-previews-timeout',
                title: _('Time Before Showing'),
                subtitle: _('Delay in milliseconds before opening a preview'),
                lower: 0,
                upper: 9999,
                step: 25,
            },
            connectSettings
        );
        addSpinRow(
            timingGroup,
            settings,
            {
                key: 'leave-timeout',
                title: _('Time Before Hiding'),
                subtitle: _('Delay in milliseconds before closing a preview'),
                lower: 0,
                upper: 9999,
                step: 25,
            },
            connectSettings
        );

        const interactionGroup = new Adw.PreferencesGroup({
            title: _('Preview Interaction'),
        });
        content.append(interactionGroup);
        interactionGroup.add(createSwitchRow(settings, {
            key: 'preview-middle-click-close',
            title: _('Middle-Click Closes the Window'),
            subtitle: _('Close a window by middle-clicking its preview'),
        }));

        const peekGroup = new Adw.PreferencesGroup({
            title: _('Window Peeking'),
            description: _('Show a window above other windows while hovering its preview'),
        });
        content.append(peekGroup);
        peekGroup.add(createSwitchRow(settings, {
            key: 'peek-mode',
            title: _('Enable Window Peeking'),
            subtitle: _('Bring the hovered window to the front temporarily'),
        }));
        addSpinRow(
            peekGroup,
            settings,
            {
                key: 'enter-peek-mode-timeout',
                title: _('Time Before Peeking'),
                subtitle: _('Delay in milliseconds before peeking'),
                lower: 50,
                upper: 9999,
                step: 25,
            },
            connectSettings
        );
        addSpinRow(
            peekGroup,
            settings,
            {
                key: 'peek-mode-opacity',
                title: _('Other Window Opacity'),
                subtitle: _('Opacity of other windows while peeking'),
                lower: 0,
                upper: 255,
                step: 10,
            },
            connectSettings
        );

        toolbarView.content = new Gtk.ScrolledWindow({
            child: content,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vexpand: true,
        });

        this.connect('close-request', () => {
            for (const {object, id} of this._settingsConnections)
                object.disconnect(id);
            this._settingsConnections = null;
            this._settings = null;
        });
    }

    _reset() {
        for (const key of WINDOW_PREVIEW_SETTINGS)
            this._settings.reset(key);
    }
}
);
