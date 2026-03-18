# St Widgets, Stage Structure & Overlay API

## St.Bin -- Active Window Border Overlay

```javascript
let border = new St.Bin({
    style_class: 'hypergnome-active-border',
    style: 'border: 3px solid rgba(33, 150, 243, 0.8); border-radius: 8px;',
    reactive: false,
    can_focus: false,
    track_hover: false,
});

// Position relative to window
let rect = metaWindow.get_frame_rect();
let inset = 3;
border.set_position(rect.x - inset, rect.y - inset);
border.set_size(rect.width + inset * 2, rect.height + inset * 2);

// Add to window group (z-ordered with windows)
global.window_group.add_child(border);

// Z-order: place just above the focused window's actor
global.window_group.insert_child_above(border, metaWindow.get_compositor_private());
```

## St.Widget Base Properties

| Property | Type | Description |
|----------|------|-------------|
| `style` | string | Inline CSS |
| `style_class` | string | CSS class names |
| `can_focus` | boolean | Can receive keyboard focus |
| `reactive` | boolean | Responds to input events |
| `track_hover` | boolean | Track hover state |

### Style Class Methods
```javascript
widget.add_style_class_name('my-class');
widget.remove_style_class_name('my-class');
widget.has_style_class_name('my-class');
```

## St.BoxLayout (Panel Indicators)

```javascript
let box = new St.BoxLayout({
    style_class: 'panel-status-indicators-box',
});
let icon = new St.Icon({
    icon_name: 'view-grid-symbolic',
    style_class: 'system-status-icon',
});
box.add_child(icon);
```

**GNOME 48+:** Use `orientation: Clutter.Orientation.VERTICAL` instead of `vertical: true`.

## Supported CSS Properties for St Widgets

### Box Model
`width`, `height`, `min-width`, `min-height`, `max-width`, `max-height`
`padding`, `padding-top/right/bottom/left`
`margin`, `margin-top/right/bottom/left`

### Borders
`border-width`, `border-color`, `border-style` (solid)
`border-radius`, `border-top-left-radius`, etc.

### Background
`background-color`
`background-gradient-direction` (vertical, horizontal)
`background-gradient-start`, `background-gradient-end`

### Text
`color`, `font-family`, `font-size`, `font-weight`

### Shadows
`box-shadow` (e.g., `0 2px 4px rgba(0,0,0,0.5)`)

### Example stylesheet.css
```css
.hypergnome-active-border {
    border-width: 3px;
    border-color: rgba(33, 150, 243, 0.8);
    border-style: solid;
    border-radius: 8px;
}

.hypergnome-indicator {
    padding: 0 4px;
}

/* GNOME 47+ accent colors */
.hypergnome-accent-border {
    border-color: -st-accent-color;
}
```

## GNOME Shell Stage Hierarchy

```
global.stage                          (root)
  |
  +-- Main.layoutManager.uiGroup     (contains ALL UI)
        |
        +-- global.window_group       (window actors live here)
        |     +-- Meta.WindowActor    (individual windows)
        |     +-- St.Bin overlays     (our border overlays go here)
        |
        +-- global.top_window_group   (above windows)
        +-- panelBox                  (top panel)
        +-- overviewGroup             (Activities overview)
```

## Where to Add Actors

| Location | Method | Use Case |
|----------|--------|----------|
| `global.window_group` | `.add_child(actor)` | Border overlays (z-ordered with windows) |
| `Main.layoutManager` | `.addChrome(actor, params)` | UI below top window group |
| `Main.layoutManager` | `.addTopChrome(actor, params)` | Above everything |

### addChrome Options
```javascript
Main.layoutManager.addChrome(myActor, {
    affectsStruts: false,      // Reserve space (like a panel)
    affectsInputRegion: true,  // Accept input
    trackFullscreen: true,     // Hide when fullscreen active
});

// Cleanup:
Main.layoutManager.removeChrome(myActor);
```

## Z-Ordering

```javascript
container.insert_child_above(actor, referenceActor);
container.insert_child_below(actor, referenceActor);
container.set_child_above_sibling(actor, null);   // Move to top
container.set_child_below_sibling(actor, null);    // Move to bottom
```

## Multi-Monitor

```javascript
let monitors = Main.layoutManager.monitors;
let primary = Main.layoutManager.primaryMonitor;

// Monitor properties: x, y, width, height, index
let mon = monitors[0];

// Per-monitor work area
let workArea = workspace.get_work_area_for_monitor(mon.index);
```
