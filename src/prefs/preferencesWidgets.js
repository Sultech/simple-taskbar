// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function addSpinRow(group, settings, {
    key,
    title,
    subtitle,
    lower,
    upper,
    step = 1,
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
    group.add(row);
    return row;
}

export function createPanelOrderRow(settings, {
    key,
    title,
    subtitle = '',
    choices,
    fixedPosition = null,
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

    const row = new Adw.ActionRow({title, subtitle});
    row.add_prefix(moveBox);
    row.add_suffix(positionDropDown);
    row.activatable_widget = positionDropDown;

    return {
        row,
        positionDropDown,
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
    choicesProvider = () => choices,
    choicesChangedKey = null,
}, connectSettings) {
    const createModel = availableChoices => {
        const model = new Gtk.StringList();
        for (const choice of availableChoices)
            model.append(choice.label);
        return model;
    };
    let currentChoices = choicesProvider();
    let syncingChoices = false;

    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: createModel(currentChoices),
    });
    const currentValue = initialValue ?? settings.get_string(key);
    const selected = currentChoices.findIndex(
        choice => choice.value === currentValue
    );
    row.set_selected(Math.max(selected, 0));
    row.connect('notify::selected', widget => {
        if (syncingChoices)
            return;

        const choice = currentChoices[widget.get_selected()];
        if (choice)
            settings.set_string(key, choice.value);
    });
    connectSettings(settings, `changed::${key}`, () => {
        const value = settings.get_string(key);
        const index = currentChoices.findIndex(
            choice => choice.value === value
        );
        if (index >= 0 && row.get_selected() !== index)
            row.set_selected(index);
    });
    if (choicesChangedKey) {
        connectSettings(settings, `changed::${choicesChangedKey}`, () => {
            currentChoices = choicesProvider();
            syncingChoices = true;
            row.set_model(createModel(currentChoices));
            const value = settings.get_string(key);
            const index = currentChoices.findIndex(
                choice => choice.value === value
            );
            row.set_selected(Math.max(index, 0));
            syncingChoices = false;
        });
    }
    group.add(row);
    return row;
}

export function addColorRow(group, settings, {key, title}, connectSettings) {
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
