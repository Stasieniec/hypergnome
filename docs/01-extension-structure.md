# GNOME Shell Extension Structure & Lifecycle

## Required Files

```
~/.local/share/gnome-shell/extensions/<uuid>/
  extension.js          # Main code (runs in gnome-shell process)
  metadata.json         # Extension metadata
  prefs.js              # Preferences window (runs in separate GTK process)
  stylesheet.css        # CSS styles (applies to GNOME Shell only, NOT prefs)
  schemas/
    org.gnome.shell.extensions.<name>.gschema.xml
    gschemas.compiled
```

## metadata.json

```json
{
    "uuid": "hypergnome@example.com",
    "name": "HyperGnome",
    "description": "Hyprland-style tiling for GNOME",
    "version": 1,
    "shell-version": ["46", "47", "48", "49"],
    "url": "https://github.com/example/hypergnome",
    "settings-schema": "org.gnome.shell.extensions.hypergnome",
    "gettext-domain": "hypergnome",
    "session-modes": ["user"]
}
```

**UUID format:** `descriptive-name@author-or-domain`. Directory name MUST match.

## ESM Module System (Mandatory Since GNOME 45)

### GObject Introspection (`gi://`)
```javascript
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Mtk from 'gi://Mtk';
```

### GNOME Shell Internals (`resource://`)
```javascript
// In extension.js (lowercase path):
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// In prefs.js (CAPITALIZED path -- different process!):
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
```

### Critical Rule
- `extension.js`: MUST NOT import Gdk, Gtk, or Adw
- `prefs.js`: MUST NOT import Clutter, Meta, St, or Shell

## Extension Class

```javascript
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class MyExtension extends Extension {
    enable() {
        // Called when extension activates.
        // Create UI, connect signals, register keybinds here.
    }

    disable() {
        // Called when deactivating.
        // MUST undo EVERYTHING done in enable().
    }
}
```

### Available Properties/Methods on Extension
| Property/Method | Returns | Purpose |
|---|---|---|
| `this.uuid` | `string` | Extension UUID |
| `this.metadata` | `object` | Parsed `metadata.json` |
| `this.dir` | `Gio.File` | Extension directory |
| `this.path` | `string` | Extension directory path |
| `this.getSettings()` | `Gio.Settings` | GSettings for the declared schema |
| `this.openPreferences()` | `void` | Opens preferences window |

### Static Lookup (from anywhere)
```javascript
let ext = Extension.lookupByUUID('hypergnome@example.com');
let ext = Extension.lookupByURL(import.meta.url);
```

## Cleanup Requirements in disable()

**ALL of these MUST happen:**

1. Destroy all created actors/widgets and null references
2. Disconnect all signal connections
3. Remove all GLib.timeout/idle sources
4. Clear all InjectionManager overrides
5. Remove all keybindings
6. Restore all overridden GNOME keybind handlers
7. Clear module-scope dynamic data (Maps, Sets, etc.)

**NEVER create objects, connect signals, or modify Shell in the constructor.**

## Session Modes

Extensions declared with `"session-modes": ["user"]` (default) are disabled during lock screen.
GNOME calls `disable()` then `enable()` on session mode changes.

## EGO Review Guidelines (Summary)

### Forbidden
- No initialization side effects (constructor/module scope must be clean)
- No deprecated imports (ByteArray, Lang, Mainloop)
- No GTK in Shell process / No Shell libs in prefs process
- No obfuscation or minification
- No excessive logging
- No telemetry
- No binary executables
- No imaginary APIs

### Required
- Schema ID MUST use `org.gnome.shell.extensions` as base prefix
- Schema path MUST use `/org/gnome/shell/extensions/` as base prefix
- Code must be readable and well-structured
