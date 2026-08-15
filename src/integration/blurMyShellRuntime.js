// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function getPanelBlur() {
    const panelBlur = global.blur_my_shell?._panel_blur;
    return panelBlur?.enabled ? panelBlur : null;
}

export function getPopupBlur() {
    const popupBlur = global.blur_my_shell?._popup;
    return popupBlur?.enabled ? popupBlur : null;
}
