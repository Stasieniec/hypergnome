# HyperGnome -- Project Decisions

## Goal
Hyprland-level coolness with GNOME-level ease of use. A GNOME Shell extension that provides
automatic tiling window management with smooth animations, gaps, active window highlighting,
and Hyprland-style keybindings.

## Locked-In Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tiling layout | **Dwindle (BSP tree)** | Hyprland's default. Auto-tiles with no user thought. Pluggable architecture so master-stack can be added later. |
| GNOME keybind handling | **Override selectively** | Use `Meta.keybindings_set_custom_handler()` to intercept conflicting GNOME keybinds. Restore originals in `disable()`. |
| Target GNOME versions | **46+** | Covers Ubuntu 24.04 LTS. Uses ESM module system. Need minor compat shims for 48/49 breaking changes. |
| Animation approach | **Clutter.ease() only** (initially) | Built-in easing with 41 modes. GLSL shaders for later phases. |
| Active window highlight | **St.Bin overlay border** | No unfocused dimming. Overlay tracks focused window. Must handle all lifecycle events to avoid ghost borders. |
| Window exceptions | **Simple float-list in GSettings** | Array of WM_CLASS strings. Full rule engine is a future phase. |
| Scratchpad approach | **Actor visibility** | Hide/show window actors. Don't mess with GNOME dynamic workspaces. |
| X11 + Wayland | **Both** | Extension runs inside Mutter -- APIs are protocol-agnostic. Just avoid X11-only APIs. |

## Architecture Principles (Learned from Existing Extensions)

1. **Never monkey-patch GNOME internals** -- Use documented extension APIs and signal system only
2. **Perfect cleanup in disable()** -- Every signal disconnected, every actor destroyed, every timeout removed
3. **Never throw uncaught exceptions** -- JS errors in extensions cause cumulative memory leaks in gnome-shell
4. **Single codebase for all GNOME versions** -- Conditional code paths, not version branches
5. **Minimize GNOME internal dependencies** -- Use only the stable public API surface
6. **Debounce layout recalculations** -- Event queue prevents thrashing from rapid window events
7. **Percentage-based sizing** -- Window dimensions stored as ratios within their parent container, not absolute pixels

## Phased Roadmap

1. **Phase 1 -- Skeleton**: Extension scaffolding, enable/disable, indicator in system menu, GSettings schema, preferences window
2. **Phase 2 -- Basic Tiling**: Dwindle BSP tree, auto-tile new windows, basic keybinds (move focus, move window, toggle float)
3. **Phase 3 -- Gaps + Borders**: Configurable inner/outer gaps, active window border overlay
4. **Phase 4 -- Animations**: Smooth Clutter.ease() transitions for tiling/resizing/workspace switch
5. **Phase 5 -- Window Rules**: Float exceptions, per-app settings
6. **Phase 6 -- Scratchpads**: Toggle-able overlay windows
7. **Phase 7 -- Polish**: Shader effects, gradient borders, more layout engines
