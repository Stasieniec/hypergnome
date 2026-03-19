# HyperGnome

Hyprland-style tiling window management for GNOME. Automatic dwindle (BSP tree) tiling, smooth animations, configurable gaps, active window borders, and Hyprland-style keybindings — all as a native GNOME Shell extension.

## Features

- Dwindle BSP tree auto-tiling with per-workspace, per-monitor trees
- Hyprland-style keybindings (vim keys and arrow keys for focus/move/resize)
- Tiled window resize via keybindings and mouse drag
- Multi-monitor support (move/focus windows across monitors)
- Configurable inner/outer gaps
- Active window border with animated gradient (blue-green default, rotating)
- Focus pulse effect (window and border scale on focus change)
- Dim inactive windows (configurable desaturation)
- Smooth animations with configurable speed
- Window open animations (scale + fade)
- Workspace switch slide-in animation
- Float exceptions with WM_CLASS list (editable in preferences)
- GNOME 46-49 compatibility (single codebase with compat shims)
- Panel indicator with tiling toggle
- Full preferences window with color pickers, float list editor, and all settings exposed

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

## Requirements

- GNOME Shell 46 or later (Ubuntu 24.04+)
- Works on both Wayland and X11

## Installation

### From Source (Development)

```bash
git clone https://github.com/Stasieniec/hypergnome.git
cd hypergnome
make install
```

This symlinks the extension to `~/.local/share/gnome-shell/extensions/`. Then:

**On X11:** Press `Alt+F2`, type `r`, press Enter to restart GNOME Shell.

**On Wayland:** Log out and log back in (or use a nested session — see Development section).

Then enable the extension:
```bash
gnome-extensions enable hypergnome@hypergnome.dev
```

### Uninstall

```bash
make uninstall
```

## Configuration

Open preferences from the Extensions app, or:
```bash
gnome-extensions prefs hypergnome@hypergnome.dev
```

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

**X11 (easiest):** `Alt+F2` → `r` → Enter

**Wayland nested session:**
```bash
dbus-run-session -- gnome-shell --nested --wayland
```

**View logs:**
```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

**Enable/disable:**
```bash
gnome-extensions enable hypergnome@hypergnome.dev
gnome-extensions disable hypergnome@hypergnome.dev
```

### Building a Release ZIP

```bash
make dist
# Output: hypergnome@hypergnome.dev.zip
```

## License

GPLv3 — see [LICENSE](LICENSE).
