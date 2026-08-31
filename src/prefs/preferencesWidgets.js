// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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

export function addSpinRow(group, settings, {
    key,
    title,
    subtitle,
    lower,
    upper,
    step = 1,
    addRow = row => group.add(row),
}, connectSettings) {
    const row = Adw.SpinRow.new_with_range(lower, upper, step);
    row.title = title;
    row.subtitle = subtitle;
    row.set_value(settings.get_int(key));
    row.connect('notify::value', widget => {
        settings.set_int(key, Math.round(widget.get_value()));
    });
    connectSettings(settings, `changed::${key}`, () => {
        const value = settings.get_int(key);
        if (row.get_value() !== value)
            row.set_value(value);
    });
    addRow(row);
    return row;
}

export function createPanelOrderRow(settings, {
    key,
    title,
    subtitle = '',
    choices,
    fixedPosition = null,
    visibleKey = null,
    visibleState = null,
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
        tooltip_text: _('Panel Position'),
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
        const value = fixedPosition ?? settings.get_string(key);
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
        syncPosition(settings.get_string(key));
        positionDropDown.connect('notify::selected', widget => {
            if (syncingPosition)
                return;

            const choice = currentChoices[widget.selected];
            if (choice)
                settings.set_string(key, choice.value);
        });
        connectSettings(settings, `changed::${key}`, () => {
            syncPosition(settings.get_string(key));
        });
    }

    const upButton = new Gtk.Button({
        icon_name: 'go-up-symbolic',
        tooltip_text: _('Move Up'),
        valign: Gtk.Align.CENTER,
    });
    const downButton = new Gtk.Button({
        icon_name: 'go-down-symbolic',
        tooltip_text: _('Move Down'),
        valign: Gtk.Align.CENTER,
    });
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
    if (visibleButton)
        row.add_suffix(visibleButton);
    row.add_suffix(positionDropDown);
    row.activatable_widget = positionDropDown;

    return {
        row,
        positionDropDown,
        visibleButton,
        upButton,
        downButton,
        setChoices,
        syncPosition,
        group: null,
    };
}

export function createItemOrderRow({title, subtitle = ''}) {
    const upButton = new Gtk.Button({
        icon_name: 'go-up-symbolic',
        tooltip_text: _('Move Up'),
        valign: Gtk.Align.CENTER,
    });
    const downButton = new Gtk.Button({
        icon_name: 'go-down-symbolic',
        tooltip_text: _('Move Down'),
        valign: Gtk.Align.CENTER,
    });
    upButton.add_css_class('flat');
    downButton.add_css_class('flat');
    const moveBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 2,
        valign: Gtk.Align.CENTER,
    });
    moveBox.append(upButton);
    moveBox.append(downButton);

    const row = new Adw.ActionRow({title, subtitle});
    row.add_prefix(moveBox);

    return {row, upButton, downButton, group: null};
}

export function addComboRow(group, settings, {
    key,
    title,
    subtitle = '',
    choices,
    initialValue = null,
    choicesProvider = () => choices,
    choicesChangedKey = null,
    choicesChangedKeys = choicesChangedKey ? [choicesChangedKey] : [],
    setValue = value => settings.set_string(key, value),
    configureDropDown = () => {},
    addSuffix = () => {},
    addRow = row => group.add(row),
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
    const currentValue = initialValue ?? settings.get_string(key);
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
        const value = settings.get_string(key);
        const index = currentChoices.findIndex(
            choice => choice.value === value
        );
        if (index >= 0 && dropDown.selected !== index)
            dropDown.selected = index;
    });
    for (const changedKey of choicesChangedKeys) {
        connectSettings(settings, `changed::${changedKey}`, () => {
            currentChoices = choicesProvider();
            syncingChoices = true;
            dropDown.set_model(createModel(currentChoices));
            const value = settings.get_string(key);
            const index = currentChoices.findIndex(
                choice => choice.value === value
            );
            dropDown.selected = Math.max(index, 0);
            syncingChoices = false;
        });
    }
    addRow(row);
    return row;
}

export function addColorRow(group, settings, {
    key,
    title,
    addRow = row => group.add(row),
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
    addRow(row);
    return row;
}
