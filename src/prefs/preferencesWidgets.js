// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {SettingsSignalTracker} from './settingsSignalTracker.js';

export function createPreferencesDialogContent(dialog, cleanup = null) {
    const signalTracker = new SettingsSignalTracker();
    const toolbarView = new Adw.ToolbarView();
    dialog.content = toolbarView;

    const headerBar = new Adw.HeaderBar({
        show_end_title_buttons: false,
        show_start_title_buttons: false,
    });
    toolbarView.add_top_bar(headerBar);

    const resetButton = new Gtk.Button({
        label: _('Reset to Defaults'),
        valign: Gtk.Align.CENTER,
    });
    resetButton.connect('clicked', () => dialog._reset());
    headerBar.pack_start(resetButton);

    const closeButton = new Gtk.Button({
        label: _('Close'),
        valign: Gtk.Align.CENTER,
    });
    closeButton.connect('clicked', () => dialog.close());
    headerBar.pack_end(closeButton);

    const content = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 24,
        margin_top: 24,
        margin_bottom: 24,
        margin_start: 24,
        margin_end: 24,
    });
    toolbarView.content = new Gtk.ScrolledWindow({
        child: content,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vexpand: true,
    });

    const releaseSettings = () => {
        signalTracker.destroy();
        if (cleanup)
            cleanup();
        dialog._settings = null;
    };
    const closeRequestId = dialog.connect('close-request', releaseSettings);
    dialog._settingsSearchDispose = () => {
        dialog.disconnect(closeRequestId);
        releaseSettings();
        dialog.destroy();
    };

    return {
        content,
        connectSettings: (object, signal, callback) =>
            signalTracker.connect(object, signal, callback),
    };
}

export function createPreferencesDialogButton(
    settings,
    tooltip,
    DialogClass,
    dialogOptions = {}
) {
    const button = new Gtk.Button({
        tooltip_text: tooltip,
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(button, 'emblem-system-symbolic');
    button.add_css_class('flat');
    button.add_css_class('circular');
    button._settingsSearchCreateDialog = parent =>
        new DialogClass({
            settings,
            parent,
            ...dialogOptions,
        });
    button.connect('clicked', () => {
        const dialog = button._settingsSearchCreateDialog(button.get_root());
        dialog.present();
    });
    return button;
}

export function setButtonIcon(button, iconName) {
    button.set_child(new Gtk.Image({
        icon_name: iconName,
    }));
}

export function createSwitchRow(settings, {
    key,
    title,
    subtitle = '',
}) {
    const row = new Adw.SwitchRow({
        title,
        subtitle,
        active: settings.get_boolean(key),
    });
    settings.bind(
        key,
        row,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    return row;
}

export function createSwitchExpanderRow(settings, {
    title,
    subtitle = '',
    getKey,
    keyChangedKey = null,
    inverted = false,
}, connectSettings) {
    const row = new Adw.ExpanderRow({title, subtitle, show_enable_switch: true});
    const flags = inverted
        ? Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.INVERT_BOOLEAN
        : Gio.SettingsBindFlags.DEFAULT;
    const bindKey = () => {
        Gio.Settings.unbind(row, 'enable-expansion');
        settings.bind(getKey(), row, 'enable-expansion', flags);
    };
    if (keyChangedKey)
        connectSettings(settings, `changed::${keyChangedKey}`, bindKey);
    bindKey();
    return row;
}

export function addSwitchRow(group, settings, {
    key,
    title,
    subtitle = '',
    addSuffix = () => {},
}) {
    const toggle = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: settings.get_boolean(key),
    });
    const row = new Adw.ActionRow({title, subtitle});
    addSuffix(row);
    row.add_suffix(toggle);
    row.activatable_widget = toggle;
    group.add(row);
    settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
    return {row, toggle};
}

export function addSpinRow(group, settings, {
    key,
    getKey = () => key,
    changedKeys = [key],
    title,
    subtitle,
    lower,
    upper,
    step = 1,
}, connectSettings) {
    const row = Adw.SpinRow.new_with_range(lower, upper, step);
    row.title = title;
    row.subtitle = subtitle;
    row.set_value(settings.get_int(getKey()));
    row.connect('notify::value', widget => {
        const value = Math.round(widget.get_value());
        if (value !== settings.get_int(getKey()))
            settings.set_int(getKey(), value);
    });
    const syncValue = () => {
        const value = settings.get_int(getKey());
        if (row.get_value() !== value)
            row.set_value(value);
    };
    for (const changedKey of changedKeys)
        connectSettings(settings, `changed::${changedKey}`, syncValue);
    group.add(row);
    return row;
}

export function createPanelOrderRow(settings, {
    key,
    positionState = null,
    title,
    subtitle = '',
    choices,
    fixedPosition = null,
    visibleKey = null,
    visibleState = null,
    optionsButton = null,
}, connectSettings) {
    let currentChoices = choices;
    const createModel = availableChoices => {
        const model = new Gtk.StringList();
        for (const choice of availableChoices)
            model.append(choice.label);
        return model;
    };
    const positionDropDown = new Gtk.DropDown({
        model: createModel(currentChoices),
        tooltip_text: _('Item Position'),
        valign: Gtk.Align.CENTER,
    });
    let syncingPosition = false;
    const syncPosition = value => {
        const index = currentChoices.findIndex(
            choice => choice.value === value
        );
        if (index < 0 || positionDropDown.selected === index)
            return;

        syncingPosition = true;
        positionDropDown.selected = index;
        syncingPosition = false;
    };
    const setChoices = availableChoices => {
        currentChoices = availableChoices;
        syncingPosition = true;
        positionDropDown.set_model(createModel(currentChoices));
        const value = fixedPosition ?? (positionState ? positionState.get() : settings.get_string(key));
        const index = currentChoices.findIndex(
            choice => choice.value === value
        );
        positionDropDown.selected = index < 0 ? 0 : index;
        syncingPosition = false;
    };
    if (fixedPosition) {
        syncPosition(fixedPosition);
        positionDropDown.sensitive = false;
    } else {
        const position = positionState ?? {
            get: () => settings.get_string(key),
            set: value => settings.set_string(key, value),
            changedKeys: [key],
        };
        syncPosition(position.get());
        positionDropDown.connect('notify::selected', widget => {
            if (syncingPosition)
                return;

            const choice = currentChoices[widget.selected];
            if (choice)
                position.set(choice.value);
        });
        for (const changedKey of position.changedKeys) {
            connectSettings(settings, `changed::${changedKey}`, () => {
                syncPosition(position.get());
            });
        }
    }

    const upButton = new Gtk.Button({
        tooltip_text: _('Move Up'),
        valign: Gtk.Align.CENTER,
    });
    const downButton = new Gtk.Button({
        tooltip_text: _('Move Down'),
        valign: Gtk.Align.CENTER,
    });
    setButtonIcon(upButton, 'go-up-symbolic');
    setButtonIcon(downButton, 'go-down-symbolic');
    upButton.add_css_class('flat');
    downButton.add_css_class('flat');
    const moveBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 2,
        valign: Gtk.Align.CENTER,
    });
    moveBox.append(upButton);
    moveBox.append(downButton);

    const visibility = visibleState ?? (visibleKey
        ? {
            get: () => settings.get_boolean(visibleKey),
            set: value => settings.set_boolean(visibleKey, value),
            changedKeys: [visibleKey],
        }
        : null);
    const visibleButton = visibility
        ? new Gtk.ToggleButton({
            label: _('Visible'),
            active: visibility.get(),
            valign: Gtk.Align.CENTER,
        })
        : null;
    if (visibleButton) {
        let syncingVisibility = false;
        const syncVisibility = () => {
            const active = visibility.get();
            if (visibleButton.active === active)
                return;

            syncingVisibility = true;
            visibleButton.active = active;
            syncingVisibility = false;
        };
        visibleButton.connect('notify::active', widget => {
            if (!syncingVisibility)
                visibility.set(widget.active);
        });
        for (const key of visibility.changedKeys)
            connectSettings(settings, `changed::${key}`, syncVisibility);
    }

    const row = new Adw.ActionRow({title, subtitle});
    row.add_prefix(moveBox);
    if (optionsButton)
        row.add_suffix(optionsButton);
    if (visibleButton)
        row.add_suffix(visibleButton);
    row.add_suffix(positionDropDown);
    row.activatable_widget = positionDropDown;

    return {
        row,
        positionDropDown,
        visibleButton,
        optionsButton,
        upButton,
        downButton,
        setChoices,
        syncPosition,
        group: null,
    };
}

export function addComboRow(group, settings, {
    key,
    title,
    subtitle = '',
    choices,
    initialValue = null,
    getValue = () => settings.get_string(key),
    choicesProvider = () => choices,
    choicesChangedKey = null,
    choicesChangedKeys = choicesChangedKey ? [choicesChangedKey] : [],
    setValue = value => settings.set_string(key, value),
    configureDropDown = () => {},
    addSuffix = () => {},
}, connectSettings) {
    const createModel = availableChoices => {
        const model = new Gtk.StringList();
        for (const choice of availableChoices)
            model.append(choice.label);
        return model;
    };
    let currentChoices = choicesProvider();
    let syncingChoices = false;

    const dropDown = new Gtk.DropDown({
        model: createModel(currentChoices),
        valign: Gtk.Align.CENTER,
    });
    const row = new Adw.ActionRow({title, subtitle});
    addSuffix(row);
    row.add_suffix(dropDown);
    row.activatable_widget = dropDown;
    configureDropDown(dropDown);
    const currentValue = initialValue ?? getValue();
    const selected = currentChoices.findIndex(
        choice => choice.value === currentValue
    );
    dropDown.selected = Math.max(selected, 0);
    dropDown.connect('notify::selected', widget => {
        if (syncingChoices)
            return;

        const choice = currentChoices[widget.selected];
        if (choice)
            setValue(choice.value);
    });
    connectSettings(settings, `changed::${key}`, () => {
        const value = getValue();
        const index = currentChoices.findIndex(
            choice => choice.value === value
        );
        if (index >= 0 && dropDown.selected !== index) {
            syncingChoices = true;
            dropDown.selected = index;
            syncingChoices = false;
        }
    });
    for (const changedKey of choicesChangedKeys) {
        connectSettings(settings, `changed::${changedKey}`, () => {
            currentChoices = choicesProvider();
            syncingChoices = true;
            dropDown.set_model(createModel(currentChoices));
            const value = getValue();
            const index = currentChoices.findIndex(
                choice => choice.value === value
            );
            dropDown.selected = Math.max(index, 0);
            syncingChoices = false;
        });
    }
    group.add(row);
    return row;
}

export function addColorRow(group, settings, {
    key,
    title,
}, connectSettings) {
    const dialog = new Gtk.ColorDialog({title});
    const button = new Gtk.ColorDialogButton({
        dialog,
        valign: Gtk.Align.CENTER,
    });
    const row = new Adw.ActionRow({title});
    row.add_suffix(button);
    row.activatable_widget = button;

    let syncing = false;
    const syncColor = () => {
        const color = new Gdk.RGBA();
        color.parse(settings.get_string(key));
        syncing = true;
        button.rgba = color;
        syncing = false;
    };
    button.connect('notify::rgba', () => {
        if (!syncing)
            settings.set_string(key, button.rgba.to_string());
    });
    connectSettings(settings, `changed::${key}`, syncColor);
    syncColor();
    group.add(row);
    return row;
}

export function addToggleChoiceRow(group, settings, {
    key,
    title,
    subtitle = '',
    choices,
    setValue = value => settings.set_string(key, value),
    addSuffix = () => {},
}, connectSettings) {
    const box = new Gtk.Box({
        valign: Gtk.Align.CENTER,
        css_classes: ['linked'],
    });
    const buttons = new Map();
    let firstButton = null;
    let syncing = false;
    for (const {value, label} of choices) {
        const button = new Gtk.ToggleButton({label, group: firstButton});
        firstButton ??= button;
        button.connect('toggled', () => {
            if (!syncing && button.active)
                setValue(value);
        });
        buttons.set(value, button);
        box.append(button);
    }
    const sync = () => {
        syncing = true;
        buttons.get(settings.get_string(key)).active = true;
        syncing = false;
    };
    const row = new Adw.ActionRow({title, subtitle});
    addSuffix(row);
    row.add_suffix(box);
    connectSettings(settings, `changed::${key}`, sync);
    sync();
    group.add(row);
    return row;
}
