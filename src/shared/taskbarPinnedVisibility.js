// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

export function shouldHidePinnedApplications(settings, isSecondary) {
    return settings.get_boolean('hide-pinned-taskbar-apps') ||
        (isSecondary &&
            settings.get_boolean('hide-pinned-secondary-monitors'));
}
