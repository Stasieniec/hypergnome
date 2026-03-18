# Window Management API Reference

## Meta.Window

### Moving and Resizing
```javascript
// move_resize_frame(user_op, x, y, width, height)
// user_op=false for programmatic tiling (no constraints)
// user_op=true for simulating user actions (applies min-size constraints)
window.move_resize_frame(false, 100, 100, 800, 600);
```

### Getting Geometry
```javascript
// Frame rect = what the user sees. USE THIS for tiling.
const rect = window.get_frame_rect(); // {x, y, width, height}

// Buffer rect = actual pixmap (includes CSD shadows). DON'T use for tiling.
const bufRect = window.get_buffer_rect();
```

### Work Area (usable screen minus panels/docks)
```javascript
const workArea = window.get_work_area_current_monitor();
const workArea = window.get_work_area_for_monitor(monitorIndex);
```

### Maximize / Fullscreen
```javascript
// GNOME 46-48:
window.maximize(Meta.MaximizeFlags.BOTH);
window.unmaximize(Meta.MaximizeFlags.BOTH);
window.get_maximized(); // Returns Meta.MaximizeFlags bitmask

// GNOME 49+ (breaking change!):
window.maximize();      // No flags parameter
window.unmaximize();    // No flags parameter
window.is_maximized();  // Returns boolean
```

### Window Identity
```javascript
window.get_wm_class();          // "Firefox", "org.gnome.Terminal"
window.get_title();              // "My Document - Firefox"
window.get_window_type();        // Meta.WindowType enum
window.get_monitor();            // Monitor index
window.get_workspace();          // Meta.Workspace
window.get_transient_for();      // Parent window (for dialogs) or null
window.get_compositor_private(); // Meta.WindowActor (Clutter actor)
```

### Capabilities
```javascript
window.can_maximize();
window.can_minimize();
window.is_skip_taskbar();
window.is_on_all_workspaces();
window.is_fullscreen();
```

### Meta.WindowType (What to Tile)
| Type | Value | Tile? |
|------|-------|-------|
| `NORMAL` | 0 | **Yes** |
| `DIALOG` | 3 | Maybe (check transient_for) |
| Everything else | | No |

### Filtering Pattern
```javascript
function shouldTile(window) {
    if (window.get_window_type() !== Meta.WindowType.NORMAL) return false;
    if (window.is_skip_taskbar()) return false;
    if (window.get_transient_for() !== null) return false;
    if (window.minimized) return false;
    return true;
}
```

### Signals on Meta.Window
| Signal | When |
|--------|------|
| `position-changed` | Position may have changed |
| `size-changed` | Size may have changed |
| `focus` | Window gains focus |
| `unmanaging` | About to be destroyed (still valid -- disconnect here) |
| `workspace-changed` | Moved to different workspace |
| `notify::minimized` | Minimize state changed |
| `notify::maximized-horizontally` | Maximize state changed |
| `notify::fullscreen` | Fullscreen state changed |

### Timing Issue: Moving Windows After Creation
On Wayland, `move_resize_frame()` may fail if called too early. Reliable pattern:
```javascript
global.display.connect('window-created', (display, window) => {
    const actor = window.get_compositor_private();
    if (!actor) return;
    const id = actor.connect('first-frame', () => {
        actor.disconnect(id);
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            window.move_resize_frame(false, x, y, w, h);
            return GLib.SOURCE_REMOVE;
        });
    });
});
```

## Meta.Display (global.display)

### Key Methods
```javascript
global.display.get_focus_window();              // Meta.Window or null
global.display.get_current_monitor();            // Monitor index under cursor
global.display.get_n_monitors();                 // Total monitors
global.display.get_monitor_geometry(i);          // Meta.Rectangle
global.display.get_primary_monitor();            // Primary monitor index
global.display.get_monitor_scale(i);             // Scale factor
global.display.list_all_windows();               // Array of Meta.Window
global.display.sort_windows_by_stacking(windows);// Sort by z-order
```

### Key Signals
| Signal | Callback | When |
|--------|----------|------|
| `window-created` | `(display, window)` | New window created |
| `grab-op-begin` | `(display, window, grabOp)` | User starts dragging/resizing |
| `grab-op-end` | `(display, window, grabOp)` | User stops dragging/resizing |
| `notify::focus-window` | `()` | Focus changed |
| `window-entered-monitor` | `(display, monIdx, window)` | Window enters monitor |
| `workareas-changed` | `()` | Work areas changed |
| `restacked` | `()` | Stacking order changed |

## Meta.WorkspaceManager (global.workspace_manager)

```javascript
const wm = global.workspace_manager;
wm.get_active_workspace();
wm.get_active_workspace_index();
wm.get_n_workspaces();
wm.get_workspace_by_index(i);
```

### Signals
| Signal | When |
|--------|------|
| `active-workspace-changed` | Active workspace changes |
| `workspace-added` | New workspace added |
| `workspace-removed` | Workspace removed |

## Meta.Workspace

```javascript
ws.list_windows();                       // All windows on workspace
ws.get_work_area_for_monitor(monIdx);    // Work area for monitor
ws.activate(timestamp);                  // Switch to workspace
ws.activate_with_focus(window, timestamp);
ws.index();
```

### Signals
- `window-added` -- `(workspace, window)`
- `window-removed` -- `(workspace, window)`

## Grab Operations

```javascript
global.display.connect('grab-op-begin', (display, window, grabOp) => {
    if (grabOp === Meta.GrabOp.MOVING) { /* user dragging */ }
});

global.display.connect('grab-op-end', (display, window, grabOp) => {
    if (grabOp === Meta.GrabOp.MOVING) { /* user dropped window */ }
});
```

Key `Meta.GrabOp` values: `NONE`, `MOVING`, `RESIZING_N/S/E/W/NE/NW/SE/SW`

## Multi-Monitor

```javascript
// Monitor changes (use Main.layoutManager -- Meta.MonitorManager.get() is NOT available on GNOME 46)
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
Main.layoutManager.connect('monitors-changed', () => { /* rebuild layouts */ });

// Get monitor neighbor
const leftMon = global.display.get_monitor_neighbor_index(i, Meta.DisplayDirection.LEFT);

// Which monitor covers a rect
const monIdx = global.display.get_monitor_index_for_rect(rect);
```
