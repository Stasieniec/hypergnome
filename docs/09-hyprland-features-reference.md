# Hyprland Feature Reference (What We're Replicating)

## Dwindle Layout (Our Primary Layout)

Binary tree. Each new window splits the focused window's space in half.
Split direction determined by aspect ratio: W > H = side-by-side, H > W = top-and-bottom.

### Key Config We'll Want to Expose
| Setting | Hyprland Default | Description |
|---------|-----------------|-------------|
| `preserve_split` | false | Lock split direction on resize |
| `force_split` | 0 | 0=follows focus, 1=always left/top, 2=always right/bottom |
| `smart_split` | false | Split direction based on cursor position |
| `no_gaps_when_only` | false | Remove gaps when only one window |
| `special_scale_factor` | 0.8 | Scratchpad window scale |

## Default Keybindings

### Window Management
| Hyprland | Action |
|----------|--------|
| `SUPER + Q` | Close window |
| `SUPER + V` | Toggle floating |
| `SUPER + F` | Toggle fullscreen |
| `SUPER + P` | Toggle pseudotile |
| `SUPER + J` | Toggle split direction |

### Focus (vim-style)
| Hyprland | Action |
|----------|--------|
| `SUPER + H` | Focus left |
| `SUPER + L` | Focus right |
| `SUPER + K` | Focus up |
| `SUPER + J` | Focus down |

### Move Window
| Hyprland | Action |
|----------|--------|
| `SUPER + SHIFT + H/L/K/J` | Move in direction |

### Resize
| Hyprland | Action |
|----------|--------|
| `SUPER + CTRL + arrows` | Resize active window |

### Workspaces
| Hyprland | Action |
|----------|--------|
| `SUPER + 1-9,0` | Switch to workspace 1-10 |
| `SUPER + SHIFT + 1-9,0` | Move window to workspace |
| `SUPER + mouse_scroll` | Next/prev workspace |

### Scratchpad
| Hyprland | Action |
|----------|--------|
| `SUPER + SPACE` | Toggle special workspace |
| `SUPER + SHIFT + SPACE` | Move to special workspace |

### Mouse
| Hyprland | Action |
|----------|--------|
| `SUPER + Left Click Drag` | Move window |
| `SUPER + Right Click Drag` | Resize window |

## Gaps

```
gaps_in = 5     # Between windows (pixels)
gaps_out = 20   # Between windows and screen edges
```
Both support CSS-style 4-value notation: `top right bottom left`

## Active Window Border

```
border_size = 2
col.active_border = 0xffffffff         # Solid color
col.active_border = rgba(33ccffee) rgba(00ff99ee) 45deg  # Gradient!
col.inactive_border = 0xff444444
```
Borders support animated gradients (animated angle rotation).

## Animations (What Makes Hyprland Feel Smooth)

### Animation Tree (inheritance)
```
global
 |-- windows (windowsIn, windowsOut, windowsMove)
 |-- fade (fadeIn, fadeOut, fadeSwitch, fadeShadow)
 |-- border, borderangle
 |-- workspaces
 |-- specialWorkspace
```

### Config Format
```
animation = NAME, ONOFF, SPEED, CURVE [, STYLE]
bezier = NAME, X0, Y0, X1, Y1
```

### Styles
- Windows: `slide`, `popin [percentage]`
- Workspaces: `slide`, `slidevert`, `fade`, `slidefade [%]`

### What Makes It Feel Smooth
1. Custom bezier curves (fast start + gentle stop = responsive feel)
2. Per-event animation control (different anim for open/close/move)
3. Fine-grained timing (decaseconds, 100ms units)
4. Rendered at monitor refresh rate

## Window Rules (Our Float-List is a Simplified Version)

Hyprland matches on: class, title, xwayland, floating, fullscreen, pinned, workspace, etc.
Actions: float, tile, fullscreen, maximize, move, size, workspace, opacity, etc.

Our Phase 1: Just a list of WM_CLASS strings that always float.
Future: Full regex matching with multiple actions.

## Scratchpad (Special Workspaces)

Hidden workspace that toggles as an overlay on current workspace.
Windows scaled down by `special_scale_factor` (0.8) and centered.
Background dimmed via `dim_special`.
Slides in with its own animation.

## Other Visual Features (Future Phases)

- **Rounded corners:** `rounding = 10` (per-window override possible)
- **Blur:** Dual-Kawase on transparent windows (NOT possible in GNOME extension)
- **Shadows:** Per-window with active/inactive colors
- **Opacity:** Active/inactive opacity control
- **Inactive dimming:** `dim_inactive = true; dim_strength = 0.1`
- **Window groups (tabs):** Tabbed containers within tiling layout
