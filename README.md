# HyperGnome

Hyprland-style tiling window management for GNOME. Automatic dwindle (BSP tree) tiling, smooth animations, configurable gaps, active window borders, and Hyprland-style keybindings — all as a native GNOME Shell extension.

## Features

- [x] Dwindle BSP tree auto-tiling with per-workspace, per-monitor trees
- [x] Hyprland-style keybindings (vim-style focus/move/resize, toggle float/split, equalize)
- [x] Tiled window resize via keybindings (`Super+Ctrl+Arrow`) and mouse drag
- [x] Multi-monitor support (move/focus windows across monitors)
- [x] Configurable inner/outer gaps
- [x] Active window border highlight (color, width, radius)
- [x] Smooth animations (Clone+Opacity Zero technique for window transitions, border easing)
- [x] GNOME 46-49 compatibility (single codebase with compat shims)
- [x] Panel indicator with tiling toggle
- [x] Preferences window
- [ ] Float exceptions UI (backend exists via `float-list` GSettings key)
- [ ] Scratchpad (toggle-able overlay windows)
- [ ] Shader effects and gradient borders

## Default Keybindings

| Key | Action |
|-----|--------|
| `Super+H/J/K/L` | Focus left/down/up/right |
| `Super+Shift+H/J/K/L` | Move window left/down/up/right |
| `Super+Ctrl+Arrow` | Resize window in direction |
| `Super+V` | Toggle float |
| `Super+P` | Toggle split direction |
| `Super+E` | Equalize split ratios |
| `Super+Q` | Close window |

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
