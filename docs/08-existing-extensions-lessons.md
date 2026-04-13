# Lessons from Existing Tiling Extensions

## Forge (BSP Tree, ~1200 stars, UNMAINTAINED)

### Architecture
5-level tree: ROOT > WORKSPACE > MONITOR > CONTAINER > WINDOW
Bidirectional parent-child references. Percentage-based sizing.

### What to adopt
- Tree hierarchy with ROOT > WORKSPACE > MONITOR > CONTAINER > WINDOW
- Percentage-based window dimensions within containers
- Event queue with ~200ms debounce for layout recalculation
- Session mode handling (keep tree alive during lock screen)

### What to avoid
- Became unmaintained (142 open issues, needs new maintainer)
- Clutter actor lifecycle issues cause crashes on Wayland
- "Objects already disposed" errors when setting properties

---

## Pop Shell (BSP Tree, ~5200 stars, MINIMAL MAINTENANCE)

### Architecture
Binary space partition tree. Nodes are: window, fork (two branches), or stack (tabs).
TypeScript. Tree compression on window close.

### What to adopt
- BSP tree compression when windows close
- Per-app AND per-window floating exceptions
- TypeScript for code quality

### What to avoid
- **Active window hint has numerous lifecycle bugs:**
  - Ghost borders after closing all windows
  - Border stays visible when minimizing last window
  - Border shows above context menus
  - Border appears on empty desktops
  - Border visible in fullscreen
- System76 abandoned the extension approach entirely: "Extensions feel like a hack"
- Their conclusion: GNOME extension model is insufficient for serious tiling

---

## PaperWM (Scrollable tiling, ~4000 stars, ACTIVE)

### Architecture
Horizontal tape per workspace. Viewport scrolls to show windows.
Scratch layer for floating window escape hatch.

### What to adopt
- Scratch layer concept (floating overlay toggled with keybind)
- Gesture support on Wayland

### What to avoid
- **Monkey-patching GNOME internals** (`patches.js`) -- breaks with every GNOME update
- "Built on top of GNOME" approach creates massive maintenance burden

---

## Tiling Shell (Zone-based, ~1800 stars, ACTIVE)

### Architecture
FancyZones-style zone definitions. TypeScript + esbuild.
Single codebase for GNOME 42-49 (conditional code paths).

### What to adopt
- **Single codebase with conditional paths** (not version branches)
- **TypeScript + esbuild** compilation pipeline
- **Smart border radius** (runtime computation adapts to each window)
- Per-workspace, per-monitor layout configuration

### What to avoid
- Zone-based is fundamentally manual, not auto-tiling

---

## Tiling Assistant (~1300 stars, ACTIVE)

### What to adopt
- **Tile Groups** concept: tiled windows that resize together
- Conservative "work with GNOME" approach survives updates better

---

## gTile (~1800 stars, COMMUNITY MAINTAINED)

### What to adopt
- **SOLID architecture**: `core/`, `types/`, `ui/`, `util/` module boundaries
- Composition over inheritance for UI
- Type-only files with no runtime code

---

## Cross-Cutting Findings

### State Storage
No major extension persists window-to-tile assignments across restarts.
Layouts are persisted (GSettings/JSON), actual placement is recalculated.

### The #1 Bug Category: Active Window Overlay Lifecycle
Pop Shell's extensive bug list proves this is the hardest problem.
Every window state change MUST update the overlay:
- Window close, minimize, maximize, fullscreen
- Workspace switch, monitor change
- Window move/resize during grab operations
- Overview show/hide
- Context menu open (z-ordering)
- Empty workspace (hide overlay)

### The Existential Risk: GNOME API Instability
Even System76 with full-time engineers couldn't sustain a GNOME tiling extension.
Our defense: minimize internal dependencies, perfect cleanup, compat module.

### Maximize/Fullscreen Signals: Re-entrancy Hazard
**Never** synchronously call `_applyLayout()` (or anything that calls
`win.unmaximize()` / `win.move_resize_frame()`) from inside a Mutter
state-change signal handler — `notify::maximized-horizontally`,
`notify::maximized-vertically`, `notify::fullscreen`, or `size-changed`.

Why it's dangerous:
- `unmaximize()` synchronously fires `notify::maximized-*` again.
- Apps that fight the compositor (Vivaldi/Chromium re-maximize themselves)
  turn this into an infinite loop that crashes gnome-shell.
- PaperWM's tiling.js explicitly calls this out (issue #73): "Resizing
  from within a size-changed signal is trouble." They use a `_inLayout`
  recursion guard plus `queueLayout()` (async) instead of synchronous
  layout calls.

How other extensions defend:
| Extension  | Pattern                                                    |
|------------|------------------------------------------------------------|
| PaperWM    | `_inLayout` recursion guard + async `queueLayout()`        |
| Pop Shell  | Per-window `Tags.Blocked` flag + global `size_changed_block` via `GObject.signal_handler_block` |
| Forge      | Global `_freezeRender` flag during grab ops                |

HyperGnome's pattern:
- `_inLayout` recursion guard inside `_applyLayout` (PaperWM).
- Fullscreen-exit uses `_queueRelayout()` (200ms debounced) to give
  Mutter time to settle before we touch geometry.
- We deliberately do NOT connect `notify::maximized-*` per-window.
  Maximize state is reconciled lazily — the next relayout (focus change,
  workspace switch, fullscreen exit, etc.) calls `unmaximize()` if the
  window ended up constrained.

## Recommended Code Structure

```
src/
  core/
    extension.js     # Main Extension class
    tilingManager.js  # Per-monitor tiling orchestration
    tree.js           # BSP tree data structure
    layout.js         # Dwindle layout algorithm
  ui/
    indicator.js      # Panel indicator
    border.js         # Active window border overlay
  util/
    signals.js        # Signal tracker helper
    compat.js         # Version compatibility shims
    settings.js       # Settings wrapper
  keybindings.js      # Keybinding registration
  windowFilters.js    # shouldTile() logic, float list
```
