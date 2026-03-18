# Clutter Animation API Reference

## actor.ease()

GNOME Shell monkey-patches `ease()` onto all `Clutter.Actor` instances.

```javascript
actor.ease({
    // Animatable properties (any numeric Clutter.Actor property):
    x: 100,
    y: 200,
    opacity: 255,       // 0-255
    scale_x: 1.0,
    scale_y: 1.0,
    width: 400,
    height: 300,
    rotation_angle_z: 45,
    translation_x: 0,
    translation_y: 0,

    // Animation options:
    duration: 500,                                    // milliseconds
    mode: Clutter.AnimationMode.EASE_OUT_QUAD,       // easing function
    delay: 0,                                         // delay before start (ms)

    // Callbacks:
    onComplete: () => { /* animation finished successfully */ },
    onStopped: (isFinished) => { /* stopped; isFinished=true if completed normally */ },
});
```

### Async Variant
```javascript
await actor.easeAsync({
    opacity: 0,
    duration: 300,
    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
});
// continues after animation completes
```

## actor.ease_property()

For non-implicit animation properties (e.g., effect parameters):
```javascript
actor.ease_property('@effects.desaturate.factor', 1.0, {
    duration: 500,
    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
});
```

## All Clutter.AnimationMode Values

### Recommended for tiling animations:
| Mode | Feel | Best for |
|------|------|----------|
| `EASE_OUT_QUAD` | Quick start, gentle stop | Window move/resize (responsive feel) |
| `EASE_OUT_CUBIC` | Slightly sharper than quad | Workspace transitions |
| `EASE_OUT_EXPO` | Very fast start, very slow stop | Window open animations |
| `EASE_IN_OUT_QUAD` | Smooth both ends | Workspace switch |
| `EASE_OUT_BACK` | Slight overshoot | Playful window open (pop-in) |
| `EASE_OUT_ELASTIC` | Spring bounce | Fun but may be too much |

### Full List (41 modes):
```
LINEAR

EASE_IN_QUAD, EASE_OUT_QUAD, EASE_IN_OUT_QUAD
EASE_IN_CUBIC, EASE_OUT_CUBIC, EASE_IN_OUT_CUBIC
EASE_IN_QUART, EASE_OUT_QUART, EASE_IN_OUT_QUART
EASE_IN_QUINT, EASE_OUT_QUINT, EASE_IN_OUT_QUINT
EASE_IN_SINE, EASE_OUT_SINE, EASE_IN_OUT_SINE
EASE_IN_EXPO, EASE_OUT_EXPO, EASE_IN_OUT_EXPO
EASE_IN_CIRC, EASE_OUT_CIRC, EASE_IN_OUT_CIRC
EASE_IN_ELASTIC, EASE_OUT_ELASTIC, EASE_IN_OUT_ELASTIC
EASE_IN_BACK, EASE_OUT_BACK, EASE_IN_OUT_BACK
EASE_IN_BOUNCE, EASE_OUT_BOUNCE, EASE_IN_OUT_BOUNCE
STEPS, STEP_START, STEP_END
CUBIC_BEZIER, EASE, EASE_IN, EASE_OUT, EASE_IN_OUT
CUSTOM_MODE, ANIMATION_LAST
```

## Animatable Properties on Clutter.Actor

| Property | Type | Description |
|----------|------|-------------|
| `opacity` | uint (0-255) | Transparency |
| `x` | float | Horizontal position |
| `y` | float | Vertical position |
| `width` | float | Width |
| `height` | float | Height |
| `scale_x` | float | Horizontal scale |
| `scale_y` | float | Vertical scale |
| `rotation_angle_x/y/z` | float | Rotation (degrees) |
| `translation_x/y/z` | float | Translation offset |
| `pivot_point` | Graphene.Point | Transform origin (0,0 to 1,1) |

## Pivot Point (Critical for Scale/Rotation)

```javascript
actor.set_pivot_point(0.5, 0.5);  // Center (default for scale animations)
actor.set_pivot_point(0.5, 1.0);  // Bottom center (grow from bottom)
actor.set_pivot_point(0.0, 0.0);  // Top-left
```

## Cancelling Animations

```javascript
actor.remove_all_transitions();          // Remove ALL running transitions
actor.remove_transition('opacity');       // Remove specific (use hyphenated names)
actor.remove_transition('scale-x');
```

**Important:** Calling `ease()` on a property already being animated automatically removes the previous transition for that property.

## Chaining Animations

```javascript
// Via callbacks:
actor.ease({
    scale_x: 1.2, scale_y: 1.2,
    duration: 200,
    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    onComplete: () => {
        actor.ease({
            scale_x: 1.0, scale_y: 1.0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });
    },
});

// Via async/await:
await actor.easeAsync({ scale_x: 1.2, scale_y: 1.2, duration: 200 });
await actor.easeAsync({ scale_x: 1.0, scale_y: 1.0, duration: 200 });
```

## Window Actor Animations (from GNOME Shell's own code)

### Window Open
```javascript
actor.set_pivot_point(0.5, 1.0);
actor.scale_x = 0.01;
actor.scale_y = 0.05;
actor.opacity = 0;

actor.ease({
    opacity: 255, scale_x: 1, scale_y: 1,
    duration: 150,
    mode: Clutter.AnimationMode.EASE_OUT_EXPO,
});
```

### Window Close
```javascript
actor.set_pivot_point(0.5, 0.5);
actor.ease({
    opacity: 0, scale_x: 0.8, scale_y: 0.8,
    duration: 150,
    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
});
```

## Applying Effects to Window Actors

```javascript
let effect = new Clutter.DesaturateEffect({ factor: 0.0 });
windowActor.add_effect_with_name('desaturate', effect);

// Animate the effect
windowActor.ease_property('@effects.desaturate.factor', 1.0, {
    duration: 500,
    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
});

// Remove
windowActor.remove_effect_by_name('desaturate');
```

## GLSL Shaders (Future Reference)

Use `Shell.GLSLEffect` (extends `Clutter.OffscreenEffect`):
```javascript
class MyShader extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, declarations, code, true);
    }
}
```
Shader source is cached **per GType** (per class, not per instance).
Use `Clutter.Timeline` for frame-synced animation driving.
