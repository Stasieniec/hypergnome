# HyperGnome

Hyprland-style tiling window management for GNOME. Automatic dwindle (BSP tree) tiling, smooth animations, configurable gaps, active window borders, and Hyprland-style keybindings — all as a native GNOME Shell extension.

## Why HyperGnome?

HyperGnome started from a specific frustration: Ubuntu is the desktop I want to use day to day — it has the ease of use, community support, and driver support that make it pleasant to live with. But after getting used to tiling workflows, the existing GNOME extensions never quite felt right.

I also tried switching fully to Hyprland. The tiling model was closer to what I wanted, but the overall experience on Ubuntu was worse than staying on GNOME. So HyperGnome is the result: a tiling extension trying to keep Ubuntu and GNOME's strengths while bringing back the parts of Hyprland I missed most.

### How It Compares

- **Tiling Shell / gTile** — great for manual zone-based layouts. HyperGnome is for users who want the layout to happen automatically.
- **Tiling Assistant** — great if you want something conservative and close to stock GNOME. HyperGnome is for a stronger tiling-first workflow.
- **PaperWM** — great if you like scrolling workspaces. HyperGnome is for classic split-based tiling closer to Hyprland.

## Features

- **Dwindle BSP tree** auto-tiling with per-workspace, per-monitor trees
- **Hyprland-style keybindings** (vim keys + arrow keys for focus/move/resize)
- **Hyprland-style workspace switching** (`Super+1..0`, `Super+Shift+1..0` to move window; cycle with `Super+[/]`)
- **Tiled window resize** via keybindings and mouse drag
- **Multi-monitor support** (move/focus windows across monitors)
- **Configurable inner/outer gaps**
- **Active window border** with animated gradient (rotating blue-green default)
- **Focus pulse effect** (window + border scale on keybind-driven focus change)
- **Dim inactive windows** (configurable desaturation)
- **Smooth animations** with configurable speed
- **Window open animations** (scale + fade)
- **Float exceptions** with WM_CLASS list (editable in preferences)
- **Keybinding conflict detection** in preferences (shows overrides + system conflicts)
- **GNOME 46–49 compatible** (single codebase)
- **Panel indicator** with tiling toggle
- **Full preferences window** with color pickers, float list editor, and all settings

## Default Keybindings

| Action | Vim Keys | Arrow Keys |
|--------|----------|------------|
| Focus | `Super+H/J/K/L` | `Super+Arrows` |
| Move window | `Super+Shift+H/J/K/L` | `Super+Shift+Arrows` |
| Resize window | `Super+Ctrl+H/J/K/L` | `Super+Ctrl+Arrows` |
| Toggle float | `Super+V` | |
| Toggle split direction | `Super+P` | |
| Equalize splits | `Super+E` | |
| Close window | `Super+Q` | |

### Workspaces (Hyprland-style)

| Action | Default Accelerator |
|--------|---------------------|
| Switch to Workspace 1..10 | `Super+1..9`, `Super+0` |
| Move Window to Workspace 1..10 | `Super+Shift+1..9`, `Super+Shift+0` |
| Cycle to Previous Workspace | `Super+[` |
| Cycle to Next Workspace | `Super+]` |
| Move Window to Previous Workspace | `Super+Shift+[` |
| Move Window to Next Workspace | `Super+Shift+]` |

### GNOME Integration

HyperGnome overrides several GNOME shortcuts that conflict with its defaults — `Super+H` (minimize), `Super+Left/Right` (half-tile), `Super+Down` (unmaximize), `Super+Shift+Arrows` (move-to-monitor), and `Super+1..9` (favourite-app launch). This is on by default. To disable, open the extension preferences → **Keybindings** → **GNOME Integration** → **Override Conflicting GNOME Shortcuts**. When off, the conflicting GNOME shortcuts keep their native meaning and you may need to rebind HyperGnome's defaults manually. All overrides are fully restored when the extension is disabled. The **Keybindings** tab also surfaces any detected conflicts with your other system shortcuts.

## Requirements

- GNOME Shell 46 or later (Ubuntu 24.04+)
- Works on both Wayland and X11

## Installation

### From extensions.gnome.org

*(Coming soon — pending EGO review)*

### From Source

```bash
git clone https://github.com/Stasieniec/hypergnome.git
cd hypergnome
make install
```

This symlinks the extension to `~/.local/share/gnome-shell/extensions/`. Then:

- **On X11:** Press `Alt+F2`, type `r`, press Enter to restart GNOME Shell.
- **On Wayland:** Log out and log back in.

Then enable the extension:
```bash
gnome-extensions enable hypergnome@hypergnome.dev
```

### Manual Install (from zip)

```bash
make dist
gnome-extensions install dist/hypergnome@hypergnome.dev.zip
```

### Uninstall

```bash
make uninstall
# or, if installed from zip:
gnome-extensions uninstall hypergnome@hypergnome.dev
```

## Configuration

Open preferences from the Extensions app, or:
```bash
gnome-extensions prefs hypergnome@hypergnome.dev
```

Settings include: gaps, border colors, gradient speed, animation duration, dim inactive, focus pulse, float exceptions, and more.

## Development

### Prerequisites

```bash
# Ubuntu/Debian
sudo apt install gnome-shell-extension-prefs libglib2.0-dev-bin
```

### Dev Install

```bash
make install    # Creates symlink + compiles schemas
make schemas    # Recompile schemas only after changing .gschema.xml
```

### Testing

**X11:** `Alt+F2` → `r` → Enter

**Wayland nested session:**
```bash
dbus-run-session -- gnome-shell --nested --wayland
```

**View logs:**
```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

**Unit tests:**
```bash
node --test tests/*.test.js
```

### Building a Release ZIP

```bash
make dist
# Output: dist/hypergnome@hypergnome.dev.zip
```

## Contributing

Bug reports and pull requests are welcome at [github.com/Stasieniec/hypergnome](https://github.com/Stasieniec/hypergnome).

## License

GPLv3 — see [LICENSE](LICENSE).
