# Keybinding API Reference

## Adding Custom Keybindings

```javascript
Main.wm.addKeybinding(
    'tile-focus-left',              // Name (must match GSettings key)
    this._settings,                  // Gio.Settings object
    Meta.KeyBindingFlags.NONE,       // Flags
    Shell.ActionMode.NORMAL,         // When active
    (display, window, binding) => {  // Handler
        this._focusLeft();
    }
);
```

**Removal (in disable()):**
```javascript
Main.wm.removeKeybinding('tile-focus-left');
```

### GSettings Schema for Keybindings
Keys must be `type="as"` (array of strings):
```xml
<key type="as" name="tile-focus-left">
    <default><![CDATA[['<Super>h']]]></default>
    <summary>Focus window to the left</summary>
</key>
```

## Meta.KeyBindingFlags

| Flag | Use for |
|------|---------|
| `NONE` | Most extension keybindings |
| `PER_WINDOW` | Window-specific actions (handler receives focused window) |
| `IGNORE_AUTOREPEAT` | Toggle actions where rapid repeat is bad |

## Shell.ActionMode

| Mode | Value | When active |
|------|-------|-------------|
| `NORMAL` | 1 | Normal desktop (app window focused) |
| `OVERVIEW` | 2 | Activities overview |
| `POPUP` | 128 | Shell menu/popup open |
| `ALL` | ~0 | Always |

**For tiling:** Use `Shell.ActionMode.NORMAL` for most bindings.

## Overriding Built-in GNOME Keybindings

```javascript
// Override
Meta.keybindings_set_custom_handler('toggle-tiled-left', (display, window, binding) => {
    this._tileFocusLeft(window);
});

// Restore (in disable()) -- pass null
Meta.keybindings_set_custom_handler('toggle-tiled-left', null);
```

## Built-in Keybindings We Need to Override

### org.gnome.mutter.keybindings
| Key | Default | Our behavior |
|-----|---------|-------------|
| `toggle-tiled-left` | `<Super>Left` | Move focus / tile left |
| `toggle-tiled-right` | `<Super>Right` | Move focus / tile right |

### org.gnome.desktop.wm.keybindings
| Key | Default | Our behavior |
|-----|---------|-------------|
| `maximize` | `<Super>Up` | Toggle maximize in tiling tree |
| `unmaximize` | `<Super>Down` | Unmaximize / restore |
| `toggle-maximized` | `<Alt>F10` | Toggle maximize |
| `minimize` | `<Super>h` | **Conflicts with our focus-left!** |

### org.gnome.shell.keybindings
| Key | Default | Our behavior |
|-----|---------|-------------|
| `switch-to-application-1..9` | `<Super>1..<Super>9` | **Conflicts if we use Super+N for workspaces!** |

## Hyprland-Style Default Keybindings (Our Extension)

| Action | Keybind | Hyprland equivalent |
|--------|---------|-------------------|
| Close window | `<Super>q` | `SUPER + Q` |
| Toggle floating | `<Super>v` | `SUPER + V` |
| Toggle fullscreen | `<Super>f` | `SUPER + F` |
| Focus left | `<Super>h` | `SUPER + H` |
| Focus right | `<Super>l` | `SUPER + L` |
| Focus up | `<Super>k` | `SUPER + K` |
| Focus down | `<Super>j` | `SUPER + J` |
| Move window left | `<Super><Shift>h` | `SUPER + SHIFT + H` |
| Move window right | `<Super><Shift>l` | `SUPER + SHIFT + L` |
| Move window up | `<Super><Shift>k` | `SUPER + SHIFT + K` |
| Move window down | `<Super><Shift>j` | `SUPER + SHIFT + J` |
| Workspace 1-9 | `<Super>1-9` | `SUPER + 1-9` |
| Move to workspace 1-9 | `<Super><Shift>1-9` | `SUPER + SHIFT + 1-9` |
| Toggle split direction | `<Super>p` | `SUPER + J` (togglesplit) |
| Toggle scratchpad | `<Super>space` | `SUPER + SPACE` |

**Note:** `<Super>h` conflicts with GNOME's `minimize`. We'll need to either override it or choose a different keybind.
`<Super>1-9` conflicts with GNOME's `switch-to-application-N`. We'll need to override these.

## Alternative: Schema-less Keybinding (for dynamic bindings)

```javascript
let action = global.display.grab_accelerator('<Super>u');
let name = Meta.external_binding_name_for_action(action);
Main.wm.allowKeybinding(name, Shell.ActionMode.ALL);

global.display.connect('accelerator-activated', (display, action, deviceId, timestamp) => {
    // handle
});

// Cleanup:
global.display.ungrab_accelerator(action);
```

## Complete Lifecycle Pattern

```javascript
enable() {
    this._settings = this.getSettings();
    this._keybindings = [];
    this._overriddenBindings = [];

    // Custom keybindings
    this._addKeybinding('tile-focus-left', () => this._focusLeft());
    this._addKeybinding('tile-focus-right', () => this._focusRight());

    // Override built-in
    for (const name of ['toggle-tiled-left', 'toggle-tiled-right']) {
        Meta.keybindings_set_custom_handler(name, (d, w, b) => this._handleOverride(name, w));
        this._overriddenBindings.push(name);
    }
}

disable() {
    for (const name of this._keybindings)
        Main.wm.removeKeybinding(name);
    this._keybindings = [];

    for (const name of this._overriddenBindings)
        Meta.keybindings_set_custom_handler(name, null);
    this._overriddenBindings = [];

    this._settings = null;
}

_addKeybinding(name, handler) {
    Main.wm.addKeybinding(name, this._settings,
        Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL, handler);
    this._keybindings.push(name);
}
```
