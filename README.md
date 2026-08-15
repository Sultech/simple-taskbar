# <img src="docs/images/simple-taskbar-logo.png" alt="Simple Taskbar logo" width="52" align="absmiddle"> Simple Taskbar

<p>
  <a href="https://extensions.gnome.org/extension/10448/simple-taskbar/"><img
    src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true"
    alt="Get it on GNOME Extensions"
    width="180"
    align="middle"></a>
  <a href="https://www.buymeacoffee.com/sultech"><img
    src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png"
    alt="Buy Me a Coffee"
    width="174"
    height="41"
    align="middle"></a>
</p>

Simple Taskbar turns GNOME Shell's native panel into a configurable desktop
taskbar. It keeps GNOME's Activities, clock, calendar, Quick Settings and
extension indicators while adding pinned applications, running applications,
window previews and an optional Eleven-style Start Menu.

> Simple Taskbar supports GNOME Shell 48, 49 and 50 only.

## Preview

<p align="center">
  <img src="docs/images/taskbars4.png" alt="Simple Taskbar showing light, dark and Windows XP taskbar styles" width="100%">
</p>

<p align="center"><sub>Taskbar mode and Windows XP Theme.</sub></p>

<br>

<p align="center">
  <img src="docs/images/start-menus1.png" alt="Eleven-style Start Menu in dark and light themes" width="100%">
</p>

<p align="center"><sub>Hide pinned titles enabled; show recommendations off.</sub></p>

## Choose a panel style

| Style | What it does |
| --- | --- |
| **Taskbar** | Shows GNOME favourites and running applications on the panel, starts on the desktop, and hides GNOME's original Overview Dash. |
| **Default GNOME Panel** | Hides taskbar applications and Start buttons, restores GNOME's original Dash in Overview, and keeps the panel customisation options. |
| **Windows XP Theme** | Applies a Windows XP-inspired appearance with a 30px panel, 16px application icons, fixed spacing, XP artwork and a classic taskbar layout. |

Default GNOME Panel mode normally keeps GNOME's usual startup Overview. Dash to
Dock and Ubuntu Dock can change that startup behaviour when they are active.

Windows XP Theme applies its own dimensions and layout. Controls that conflict
with the XP appearance are disabled while it is active, and standard Taskbar
defaults are applied when it is turned off.
Default GNOME Panel mode keeps panel position, height, themes, item order and
multi-monitor settings available, while taskbar application and Start button
controls remain disabled until Taskbar mode is restored.

## Taskbar

### General

Simple Taskbar uses GNOME's application favourites and their order. Changes to
favourites are reflected in the taskbar and GNOME's original Dash.

The panel can be placed at the top or bottom of the screen. Applications and
the Start button can be aligned left or centre independently, or the Start
button can follow the application alignment.

### Application Icons

Application buttons support:

- Left click to launch, focus or minimise an application.
- Middle click to open a new window, or close all its windows when **Middle
  Click Closes Applications** is enabled.
- Right click to open GNOME's application menu.
- Dragging to reorder pinned applications and move running application groups.
- Hovering to preview open windows. A preview can focus or close its exact
  window.

Click an application with multiple windows to spread only those windows in
Overview, including windows on other workspaces.

### Panel Appearance

- Standard panel height: 32–80px.
- Application icons: 15–48px.
- Application spacing: 0–16px.
- Panel button padding: automatic or an explicit 0–20px value. Automatic uses
  Just Perfection's padding when available, otherwise 3px. An explicit value
  takes precedence without changing Just Perfection's setting.
- Default GNOME Panel mode uses 12px padding and restores Automatic when
  Taskbar mode returns.
- Light, dark or GNOME Shell-following panel themes.
- Adjustable transparency.
- Separate borders for light and dark themes.
- Optional translucent and blurred styling through Blur My Shell on the
  primary panel. Secondary panels use Simple Taskbar's own background.

<p align="center">
  <img src="docs/images/settings-taskbar.png" alt="Taskbar settings showing general, application icon and panel appearance options" width="100%">
</p>

<p align="center"><sub>Taskbar settings: general, application icons and panel appearance.</sub></p>

### Taskbar Behaviour

- Animated auto-hide on every panel.
- A bottom hot edge that toggles Overview, enabled by default, with adjustable
  activation pressure and an optional ripple animation.
- Workspace switching by scrolling over empty panel space, with an adjustable
  delay between workspace changes.
- An application volume mixer inside Quick Settings, enabled by default, for
  adjusting individual streams or opening GNOME's Volume Levels settings.
- Tray icons collected behind a panel arrow, enabled by default.
- A Task Manager action in the empty-panel context menu. It opens the selected
  installed application; the default is Resources, followed by GNOME System
  Monitor and Mission Center when the selected application is unavailable.
- The taskbar can be shown on every connected monitor.

### Panel Items

The panel has separate **Left**, **Center** and **Right** item lists. These can
contain:

- Start and Activities buttons.
- Applications.
- Folder Menu.
- Tray icons.
- Quick Settings.
- Clock.
- Show Desktop.

Activities and Show Desktop can be shown or hidden, and Folder Menu is
optional. The Folder Menu opens files from a selected directory with their
default applications. Show Desktop is a narrow button that minimizes or
restores all windows and is limited to the Left and Right lists.

Each list also has a fixed box row for other GNOME Shell and extension items.
Managed items can be placed before or after that row. Move Up and Move Down
keep each item within its current list.

**Reset All Settings** restores the extension defaults without changing the
taskbar favourites or Start Menu pins, including their order.

<p align="center">
  <img src="docs/images/settings-taskbar-behaviour.png" alt="Taskbar settings showing taskbar behaviour and panel item options" width="100%">
</p>

<p align="center"><sub>Taskbar settings: behaviour and optional panel items.</sub></p>

<p align="center">
  <img src="docs/images/settings-panel-items.png" alt="Taskbar settings showing panel item placement and reset options" width="100%">
</p>

<p align="center"><sub>Taskbar settings: panel item placement and reset.</sub></p>

## Window Switching

Grid Alt-Tab is enabled by default. It replaces the normal application switcher
with a responsive grid of live window previews while preserving normal
Alt+Tab and Shift+Alt+Tab selection.

It supports pointer and arrow-key navigation and activates the selected window
when Alt is released. Configure:

- Maximum preview card height.
- All workspaces or only the current workspace.
- All monitors or only the monitor showing the switcher.
- The current monitor or always the primary monitor for the popup.

<p align="center">
  <img src="docs/images/settings-window-switching.png" alt="Window Switching settings showing Grid Alt-Tab options" width="100%">
</p>

<p align="center"><sub>Window Switching settings: Grid Alt-Tab options.</sub></p>

## Start Menu

The Eleven-style Start Menu is enabled by default. It provides:

- A separate pinned-app grid with drag-and-drop ordering.
- GNOME global search, including compatible system and extension providers.
- An All Apps view with selectable categories, or one alphabetical list.
- Scrollbars for long pinned and All Apps views.
- Delayed tooltips with application names and descriptions.
- Keyboard navigation with Tab and the arrow keys.
- Application menus with open-window, launcher-action, App Details, Quit,
  Pin to Start and Pin to Taskbar actions.
- Dragging an application from All Apps onto the taskbar to pin it.
- Dark, light or GNOME Shell-following themes.
- Optional monitor-centred positioning.

### Start Button

The Start button can use the Eleven-style button or the original GNOME
Applications button. It can follow application alignment, use a custom
padding value and use a bundled or personal icon. Both Start buttons can be
hidden. Right-click the Eleven-style button to open its settings.

### Keyboard shortcuts

- **Super** opens the Start Menu by default and moves Overview to **Super+Tab**.
- Turn off the Super shortcut to use **Super+Tab** for the Start Menu instead.
- When both built-in shortcuts are off, a custom shortcut can open the Start
  Menu.

Shortcuts can be disabled, and the extension checks for conflicts between its
own shortcuts. It does not change GNOME's saved shortcuts. When the Start Menu
uses the Super key, the previous Mutter overlay-key setting is restored when
the extension is disabled.

Global search results can request that provider-supplied text be copied to the
clipboard when a result is activated.

<p align="center">
  <img src="docs/images/settings-start-menu.png" alt="Start Menu settings showing Start button, menu and keyboard shortcut options" width="100%">
</p>

<p align="center"><sub>Start Menu settings: Start button, menu and keyboard shortcuts.</sub></p>

## Advanced

Less commonly used taskbar, file manager and Start Menu options are on the
Advanced page.

### Appearance

Running, focused and multi-window applications have separate indicators. Use
rounded or straight indicator ends and optionally choose custom focused and
unfocused colours.

The Advanced page also provides a custom panel colour and light or dark panel
text.

### Application Behaviour

Applications can be displayed in three grouping modes:

| Mode | Behaviour |
| --- | --- |
| **Always** | One button per application. This is the default. |
| **Only When Full** | Separate buttons while they fit, then combine them. |
| **Never** | One button for every window. |

When buttons are not combined, window labels can be hidden so that the buttons
show icons only. If the taskbar is full, application overflow can show extra
buttons in a popup. When overflow is disabled, a taskbar wider than the
available panel area can be scrolled horizontally. The overflow popup has a
taskbar-style flyout and an application-list style. Dragging works across the
visible and overflow buttons, and the overflow popup remains open while
dragging. With overflow disabled, scrolling over an overfull taskbar moves
through its buttons instead of switching workspaces.

Other taskbar options include:

- Show or hide favourite applications that are not running.
- Use pinned applications as launchers while showing their running windows in
  separate buttons.
- Show applications from only the current workspace.
- Show applications only on the monitor where their taskbar is displayed.
- Lock the taskbar against accidental rearrangement.

### Behaviour

- Panel menus switch only after a click, instead of on hover.
- Notification banners align with the panel edge and clock position.

### File Manager

- **Super+E** opens the home folder with the default file manager.
- Nautilus can show Home, Desktop, Documents, Downloads, Music, Pictures and
  Videos shortcuts in its application menu; they are enabled by default.

### Start Menu Options

- Recommended applications can be based on frequently used apps, excluding
  apps already pinned to the Start Menu or taskbar.
- Open the Start Menu directly in All Apps.
- Show an account profile picture.
- Use an optional footer power menu with available Suspend, Restart, Power Off,
  Lock Screen, Log Out and Switch User actions. It replaces the Quick Settings
  power menu while enabled.
- Follow the panel's transparency in the Start Menu.
- Hide titles below pinned application icons.

<p align="center">
  <img src="docs/images/settings-advanced-appearance.png" alt="Advanced settings showing indicator and application behaviour options" width="100%">
</p>

<p align="center"><sub>Advanced settings: indicator appearance and application behaviour.</sub></p>

<p align="center">
  <img src="docs/images/settings-advanced-behaviour.png" alt="Advanced settings showing behaviour, file manager and Start Menu options" width="100%">
</p>

<p align="center"><sub>Advanced settings: behaviour, file manager and Start Menu options.</sub></p>

## Installation

Install Simple Taskbar from
[GNOME Extensions](https://extensions.gnome.org/extension/10448/simple-taskbar/)
or Extension Manager.

To install the current source version:

    git clone https://github.com/Sultech/simple-taskbar.git
    cd simple-taskbar
    ./package.sh
    gnome-extensions install --force dist/simple-taskbar@sultech.shell-extension.zip
    gnome-extensions enable simple-taskbar@sultech

Log out and back in if GNOME Shell does not discover a newly installed
extension immediately.

## Open the settings

Use Extension Manager, right-click empty taskbar space and choose **Taskbar
Settings**, or run:

    gnome-extensions prefs simple-taskbar@sultech

## Compatibility and integrations

Simple Taskbar supports GNOME Shell 48, 49 and 50. Other GNOME versions are
not declared until they have been tested.

Dash to Panel is disabled while Simple Taskbar is active because both
extensions restructure GNOME's main panel. Dash to Dock and Ubuntu Dock are
disabled only while Taskbar mode is active; both remain available in Default
GNOME Panel mode.

Blur My Shell panel styling is supported on the primary panel. When a supported
desktop-icons extension is active, Start Menu application menus can also add or
remove desktop shortcuts.

## Development

GNOME Shell caches imported extension modules for the lifetime of the Shell
process. Disable and re-enable is not enough to load edited JavaScript into the
same process.

On Ubuntu, install:

    sudo apt install mutter-dev-bin gettext

Then run:

    ./dev.sh

The helper compiles the schema, creates a development symlink under
<code>~/.local/share/gnome-shell/extensions/</code> and starts a fresh GNOME
Shell 50 development session in a window. Close that window and run
<code>./dev.sh</code> again after changing JavaScript. The real desktop session
remains running.

If a copied installation already occupies the destination, disable the
extension and move or remove that directory before running the helper. Do not
keep backup extension directories under
<code>~/.local/share/gnome-shell/extensions</code>, because GNOME Shell still
scans them.

For runtime problems, use Looking Glass or the journal:

    journalctl -f -o cat /usr/bin/gnome-shell

## Build a package

Building requires <code>msgfmt</code> from GNU gettext,
<code>glib-compile-schemas</code> and <code>gnome-extensions</code>:

    ./package.sh

The package is written to:

    dist/simple-taskbar@sultech.shell-extension.zip

An alternative output directory can be supplied:

    ./package.sh /tmp/simple-taskbar-package

The archive contains the runtime modules, preferences, schema, licence,
bundled artwork, attribution notices and compiled translations. Development
scripts, translation sources and generated schema binaries are left out.

## Privacy

Simple Taskbar does not collect telemetry, access the network or run bundled
external programs. GNOME's global search providers remain responsible for
their own results. Some providers can ask Simple Taskbar to copy result text
to the clipboard when that result is activated.

## Uninstall

    gnome-extensions disable simple-taskbar@sultech
    rm -rf ~/.local/share/gnome-shell/extensions/simple-taskbar@sultech

## Licence

Simple Taskbar is distributed under
[GPL-2.0-or-later](COPYING). Bundled third-party icon credits and trademark
notices are listed in [ASSET-CREDITS.md](ASSET-CREDITS.md).
