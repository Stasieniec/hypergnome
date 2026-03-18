# GSettings Schema & Preferences Window

## Schema XML Format

File: `schemas/org.gnome.shell.extensions.hypergnome.gschema.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema id="org.gnome.shell.extensions.hypergnome"
          path="/org/gnome/shell/extensions/hypergnome/">

    <!-- Boolean -->
    <key name="show-indicator" type="b">
      <default>true</default>
      <summary>Show panel indicator</summary>
    </key>

    <!-- Integer -->
    <key name="inner-gap" type="i">
      <default>5</default>
      <summary>Gap between windows in pixels</summary>
    </key>

    <key name="outer-gap" type="i">
      <default>10</default>
      <summary>Gap between windows and screen edges in pixels</summary>
    </key>

    <!-- Double -->
    <key name="split-ratio" type="d">
      <default>0.5</default>
      <summary>Default split ratio for new windows</summary>
    </key>

    <!-- String -->
    <key name="active-border-color" type="s">
      <default>'rgba(33, 150, 243, 0.8)'</default>
      <summary>Active window border color</summary>
    </key>

    <!-- Array of strings (float list) -->
    <key name="float-list" type="as">
      <default>[]</default>
      <summary>WM_CLASS values that should always float</summary>
    </key>

    <!-- Keybindings (type="as" for key combos) -->
    <key name="tile-focus-left" type="as">
      <default><![CDATA[['<Super>h']]]></default>
      <summary>Focus window to the left</summary>
    </key>

  </schema>
</schemalist>
```

### GVariant Type Codes
| Code | Type | Example |
|------|------|---------|
| `b` | boolean | `true` |
| `i` | int32 | `5` |
| `u` | uint32 | `3` |
| `d` | double | `0.5` |
| `s` | string | `'hello'` |
| `as` | string array | `['a', 'b']` |
| `ai` | int array | `[1, 2, 3]` |
| `a{ss}` | string dict | `{'key': 'val'}` |

### Schema Rules (EGO Requirements)
- ID MUST start with `org.gnome.shell.extensions`
- Path MUST start with `/org/gnome/shell/extensions/`
- Include both `.gschema.xml` and `gschemas.compiled` in extension ZIP

### Compile Schemas
```bash
glib-compile-schemas schemas/
```

## Accessing Settings in extension.js

```javascript
enable() {
    this._settings = this.getSettings();

    // Read values
    let gap = this._settings.get_int('inner-gap');
    let show = this._settings.get_boolean('show-indicator');
    let apps = this._settings.get_strv('float-list');
    let ratio = this._settings.get_double('split-ratio');

    // Write values
    this._settings.set_int('inner-gap', 10);
    this._settings.set_strv('float-list', ['Calculator', 'Nautilus']);

    // Bind setting to widget property
    this._settings.bind('show-indicator', this._indicator, 'visible',
        Gio.SettingsBindFlags.DEFAULT);

    // Listen for changes
    this._settingsId = this._settings.connect('changed::inner-gap', () => {
        let newGap = this._settings.get_int('inner-gap');
        this._relayout();
    });
}

disable() {
    this._settings.disconnect(this._settingsId);
    this._settings = null;
}
```

## Preferences Window (prefs.js)

```javascript
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class HyperGnomePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Page
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // Group
        const group = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Configure gaps and borders'),
        });
        page.add(group);

        // Boolean toggle
        const toggleRow = new Adw.SwitchRow({
            title: _('Show Indicator'),
            subtitle: _('Show icon in the top panel'),
        });
        group.add(toggleRow);
        settings.bind('show-indicator', toggleRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // Integer spinner
        const gapRow = new Adw.SpinRow({
            title: _('Inner Gap'),
            subtitle: _('Pixels between tiled windows'),
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 64, step_increment: 1,
            }),
        });
        group.add(gapRow);
        settings.bind('inner-gap', gapRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        // Combo row
        const layoutRow = new Adw.ComboRow({
            title: _('Layout'),
            model: new Gtk.StringList({
                strings: ['Dwindle', 'Master-Stack'],
            }),
        });
        group.add(layoutRow);

        window._settings = settings;
    }
}
```

**GNOME 47+:** `fillPreferencesWindow()` can be `async`.
