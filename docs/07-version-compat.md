# GNOME Version Compatibility (46-49)

## Version Detection
```javascript
import Shell from 'gi://Shell';
const SHELL_VERSION = parseInt(Shell.version);
```

## Breaking Changes by Version

### GNOME 46
- `Clutter.Container` removed -- Use `Clutter.Actor.add_child()` / `remove_child()`
- **`Clutter.Canvas` NOT available** -- Use `St.DrawingArea` with `repaint` signal, `get_context()`, `get_surface_size()`, and `queue_repaint()`
- Signal names: `"actor-added"/"actor-removed"` -> `"child-added"/"child-removed"`
- `St.Bin` no longer auto-expands per `Clutter.ActorAlign.FILL` -- needs explicit `x_expand`/`y_expand`
- `St.Button` label defaults to plain text (not Pango markup)
- **`Meta.MonitorManager.get()` NOT available** -- Use `Main.layoutManager` with `'monitors-changed'` signal instead

### GNOME 47
- `Clutter.Color` removed -- Use `Cogl.Color()`
- `fillPreferencesWindow()` is now async (awaited)
- PopupBaseMenuItem: use `:selected` CSS pseudo-class instead of `"selected"` style class
- **Accent colors introduced:** Use CSS vars `-st-accent-color`, `-st-accent-fg-color`

### GNOME 48
- `vertical: true` deprecated on St widgets -- Use `orientation: Clutter.Orientation.VERTICAL`
- `Clutter.Image` removed -- Use `St.ImageContent`
- `Meta.disable_unredirect_for_display()` -> `global.compositor.disable_unredirect()`
- `Meta.get_window_actors()` -> `global.compositor.get_window_actors()`
- `Meta.CursorTracker.get_for_display()` -> `global.backend.get_cursor_tracker()`
- New `getLogger()` method on ExtensionBase

### GNOME 49
- **`Meta.Rectangle` fully removed** -- Use `Mtk.Rectangle`:
  ```javascript
  import Mtk from 'gi://Mtk';
  new Mtk.Rectangle({x: 0, y: 0, width: 100, height: 100});
  ```

- **Maximize API changed:**
  ```javascript
  // Old (46-48):
  window.maximize(Meta.MaximizeFlags.BOTH);
  window.unmaximize(Meta.MaximizeFlags.BOTH);
  window.get_maximized(); // Returns flags bitmask

  // New (49+):
  window.maximize();
  window.unmaximize();
  window.is_maximized(); // Returns boolean
  ```

- `Clutter.ClickAction` and `Clutter.TapAction` removed -- Use `Clutter.ClickGesture()`

## Compatibility Patterns

### Rectangle Creation
```javascript
function createRectangle(x, y, width, height) {
    if (SHELL_VERSION >= 49) {
        const Mtk = imports.gi.Mtk;  // or dynamic import
        return new Mtk.Rectangle({x, y, width, height});
    }
    return new Meta.Rectangle({x, y, width, height});
}
```

### Maximize
```javascript
function maximizeWindow(window) {
    if (SHELL_VERSION >= 49)
        window.maximize();
    else
        window.maximize(Meta.MaximizeFlags.BOTH);
}

function unmaximizeWindow(window) {
    if (SHELL_VERSION >= 49)
        window.unmaximize();
    else
        window.unmaximize(Meta.MaximizeFlags.BOTH);
}

function isMaximized(window) {
    if (SHELL_VERSION >= 49)
        return window.is_maximized();
    else
        return window.get_maximized() === Meta.MaximizeFlags.BOTH;
}
```

### St.BoxLayout Orientation
```javascript
function createVerticalBox(styleClass) {
    const props = { style_class: styleClass };
    if (SHELL_VERSION >= 48)
        props.orientation = Clutter.Orientation.VERTICAL;
    else
        props.vertical = true;
    return new St.BoxLayout(props);
}
```

### Window Actors List
```javascript
function getWindowActors() {
    if (SHELL_VERSION >= 48)
        return global.compositor.get_window_actors();
    else
        return global.get_window_actors();
}
```

## Strategy: Compat Module

Create a `compat.js` module that centralizes all version-dependent code:

```javascript
// compat.js
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

export const SHELL_VERSION = parseInt(Shell.version);

export function maximizeWindow(win) { ... }
export function unmaximizeWindow(win) { ... }
export function isMaximized(win) { ... }
export function createRectangle(x, y, w, h) { ... }
```

This keeps version checks out of business logic.
