# HyperGnome — Claude Development Instructions

## Project Goal
HyperGnome is a GNOME Shell extension that brings Hyprland-style tiling window management to GNOME. The goal is Hyprland-level coolness with GNOME-level ease of use: automatic dwindle (BSP tree) tiling, smooth animations, configurable gaps, active window borders, Hyprland-style keybindings, and a simple float-list for window exceptions.

## Documentation
All reference documentation lives in `docs/` (files 00-09). **Always consult these files before writing code.** They contain:
- Project decisions and architecture (`00`)
- GNOME extension structure and lifecycle rules (`01`)
- Window management API reference (`02`)
- Keybinding API reference (`03`)
- Animation (Clutter.ease) API reference (`04`)
- St widgets, stage hierarchy, overlay patterns (`05`)
- GSettings schema and preferences window patterns (`06`)
- GNOME 46-49 version compatibility and breaking changes (`07`)
- Lessons learned from existing tiling extensions (`08`)
- Hyprland feature reference — what we're replicating (`09`)

## Mandatory Rules

### GNOME Extension Compliance
- Follow official GNOME extension guidelines and EGO (extensions.gnome.org) review requirements at all times
- Never import GTK/Adw in extension.js or Clutter/Meta/St in prefs.js
- Never monkey-patch GNOME Shell internals
- Schema ID must use `org.gnome.shell.extensions.hypergnome` prefix
- Schema path must use `/org/gnome/shell/extensions/hypergnome/` prefix
- No initialization side-effects in constructor or module scope
- No deprecated APIs (ByteArray, Lang, Mainloop, etc.)

### Perfect Cleanup
Every `enable()` must have a corresponding complete `disable()`:
- Disconnect ALL signal connections
- Destroy ALL created actors/widgets
- Remove ALL GLib.timeout_add / GLib.idle_add sources
- Remove ALL keybindings via Main.wm.removeKeybinding()
- Restore ALL overridden GNOME keybind handlers via `Meta.keybindings_set_custom_handler(name, null)`
- Null ALL references

### Error Handling
- Never let exceptions propagate uncaught — JS errors in extensions cause cumulative memory leaks in gnome-shell
- Wrap signal handlers and callbacks in try/catch where appropriate
- Use structured logging sparingly (no console.log spam)

### Version Compatibility
- Target: GNOME 46+ (Ubuntu 24.04 LTS+)
- Use `compat.js` module for all version-dependent code
- Check `docs/07-version-compat.md` before using any API that may have changed

### Architecture
- Pluggable layout engine (dwindle first, interface for future layouts)
- Percentage-based sizing in tree nodes (not absolute pixels)
- Debounce layout recalculations (~200ms)
- Per-monitor, per-workspace tiling management
- Single codebase — no version branches

## Git Workflow

### Conventional Commits
All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) format:
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`, `ci`, `build`

Scopes (use as appropriate): `tree`, `layout`, `keybinds`, `animation`, `border`, `settings`, `prefs`, `indicator`, `compat`, `scratchpad`

### Commit Granularity
One complete, logical change = one commit. Examples:
- Adding a new keybinding = one commit
- Fixing a signal cleanup bug = one commit
- Adding a new GSettings key + its pref UI = one commit
- Do NOT bundle unrelated changes

### Pull Requests
- PR title follows conventional commits format
- PR body has Summary (bullet points) and Test Plan sections
- Keep PRs focused on a single feature or fix

## Development Setup
- Extension UUID: `hypergnome@hypergnome.dev`
- Dev install: symlink to `~/.local/share/gnome-shell/extensions/hypergnome@hypergnome.dev`
- Test on X11: `Alt+F2 → r` to restart shell
- Test on Wayland: nested session via `dbus-run-session -- gnome-shell --nested --wayland`
- Enable: `gnome-extensions enable hypergnome@hypergnome.dev`
- Logs: `journalctl -f -o cat /usr/bin/gnome-shell`
