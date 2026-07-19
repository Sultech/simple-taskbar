# Simple Taskbar

A focused GNOME Shell 50 extension that turns the native panel into a
configurable application taskbar.

## Features

- Uses GNOME's native panel as a taskbar at the top or bottom of the primary
  monitor, with matching secondary panels enabled by default.
- Automatically disables Dash to Panel when Simple Taskbar is enabled.
- Optional Default GNOME Panel mode starts at the top at 32px, hides taskbar
  applications, restores GNOME's original Overview Dash and keeps a native-style
  panel on every monitor. Normal taskbar mode starts on the desktop after login.
  Default GNOME Panel mode keeps GNOME's startup Overview unless Ubuntu Dock or
  Dash to Dock is active. The other panel options remain customizable.
- Keeps Activities, the workspace indicator, clock, calendar, notifications,
  Quick Settings and extension-provided panel indicators.
- Activities can be hidden independently. The clock and Quick Settings can each
  be placed at the left, center or right.
- Shows GNOME favourites and running applications without duplicates. Favourite
  order is shared with GNOME's original Dash.
- Supports drag reordering, dragging a running application into the favourite
  section to pin it, and an optional taskbar lock.
- Optional settings hide stopped favourite applications or show running
  applications from the current workspace only.
- Left click launches, focuses or minimizes an application. Middle click opens
  a new window, and right click opens GNOME's application menu.
- Running, multi-window and focused states use dedicated indicators and a glass
  highlight. Minimize animations target the matching taskbar icon.
- Hovering a running application shows live window previews. Each preview can
  activate or close its exact window; stopped applications show a native-style
  tooltip.
- Clicking an application with multiple windows opens an Overview window spread
  by default. This can be disabled to use the multi-preview flyout instead.
- Includes a Show Desktop button at the panel edge.
- Application icons can be 16–48px with 0–16px spacing. Panel height can be
  32–80px, and incompatible icon/panel sizes are corrected automatically.
- Application icons and the Start button can be left-aligned or centered. Start
  padding is adjustable from 0–20px, and a custom Start icon can be selected.
- The Eleven-style Start Menu is enabled by default and provides search,
  separately pinned Start applications, recommendations, All Apps and a user
  shortcut. It can use the GNOME Shell, dark or light theme.
- The Start menu is monitor-centered by default. The original GNOME Applications
  button can be shown when the Eleven-style Start Menu is disabled.
- Optional Super+Tab or custom shortcuts can open the Eleven-style Start Menu.
  Neither shortcut is enabled by default, and Super+Tab is restored to GNOME
  when turned off.
- Right clicking the Eleven-style Start button opens the Start Menu settings
  page.
- Optional animated auto-hide works on every panel with screen-edge reveal.
- Transparency is enabled by default at 10% and can be adjusted from 0–100%.
  The taskbar follows the GNOME Shell theme by default, or can be forced to a
  light or dark theme.
- Blur My Shell panel styles are supported on the primary panel. Secondary
  panels intentionally use Simple Taskbar's own background and transparency.
- Scrolling over empty panel space switches workspaces. It is enabled by default
  with an adjustable 5–250ms delay.
- Panel menus require a click before switching to another panel menu by default,
  preventing accidental menu changes while moving the pointer.
- Notification banners follow the panel edge and clock alignment by default.
- The empty-panel context menu opens Task Manager, locks the taskbar or opens
  Taskbar Settings. The Task Manager application is configurable and defaults
  to Resources.
- An optional folder button lists a selected folder and opens its files with
  their default applications.
- Reset All Settings restores extension defaults without changing GNOME's
  favourite applications.

Open the settings from Extension Manager, or run:

```sh
gnome-extensions prefs simple-taskbar@sultech
```

You can also right click empty taskbar space and choose **Taskbar Settings**.

## Install for development

### Recommended workflow

GNOME Shell caches imported extension modules for the lifetime of its process.
Extension Manager can install and enable an extension, but disabling and
re-enabling it cannot load edited JavaScript into the same Shell process.

From the project root, run the included development helper:

```sh
./dev.sh
```

On Ubuntu, GNOME 50's development window requires Mutter's development kit:

```sh
sudo apt install mutter-dev-bin
```

On its first run, the helper creates this symlink:

```text
~/.local/share/gnome-shell/extensions/simple-taskbar@sultech
    -> /path/to/simple-taskbar
```

This removes the copy step. It then starts a fresh GNOME 50 development Shell
in a window and compiles the extension's GSettings schema. After changing the
extension, close that window and run `./dev.sh` again. Your real desktop
session remains running. Once this version is loaded, changes made in the
preferences window are applied to the taskbar immediately.

If the extension was previously copied into the extensions directory, the
helper will refuse to overwrite it. Disable the extension and remove that old
copied directory once, or move it somewhere outside the extensions directory,
then rerun the helper. Backup directories left inside the extensions directory
are still scanned by GNOME Shell and cause UUID mismatch warnings. You may need
to enable Simple Taskbar once from a terminal inside the nested session.

### Manual installation

From the project root, build and install the extension archive:

```sh
./package.sh
gnome-extensions install --force \
    dist/simple-taskbar@sultech.shell-extension.zip
```

On GNOME 50, log out and back in so the real Shell discovers the extension,
then enable it with Extension Manager or:

```sh
gnome-extensions enable simple-taskbar@sultech
```

You can test it in a separate Shell instead with:

```sh
dbus-run-session gnome-shell --devkit --wayland
```

Open a terminal inside that session and enable the extension there. Use
Looking Glass (`Alt`+`F2`, then `lg`) or the journal to inspect errors:

```sh
journalctl -f -o cat /usr/bin/gnome-shell
```

GNOME 50 also provides `gnome-shell-test-tool` for automated extension tests.

## Package

Build the complete installable archive from the project root:

```sh
./package.sh
```

The helper compiles the settings schema and includes `COPYING`, every imported
JavaScript module and the bundled Start icon. The archive is written to:

```text
dist/simple-taskbar@sultech.shell-extension.zip
```

Passing a directory changes the output location:

```sh
./package.sh /tmp/simple-taskbar-package
```

## Compatibility

The extension uses the current ES module format and supports GNOME Shell 50.
Other GNOME versions are deliberately not declared until they have been
tested.

All runtime objects, signal handlers, popup menus, and Shell changes are
created in `enable()` and removed or restored in `disable()`. The extension
does not load GTK libraries, spawn subprocesses, access the network, or collect
telemetry. `dev.sh` is a project-only development helper and is not included in
the extension package.

The permanent extension UUID is `simple-taskbar@sultech`, and the installation
directory must use the same name. Source code and issue tracking are available
on [GitHub](https://github.com/Sultech/simple-taskbar).

## Uninstall

```sh
gnome-extensions disable simple-taskbar@sultech
rm -rf ~/.local/share/gnome-shell/extensions/simple-taskbar@sultech
```

## Licence

Simple Taskbar is distributed under `GPL-2.0-or-later`. See `COPYING`.
