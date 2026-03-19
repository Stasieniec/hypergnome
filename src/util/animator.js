/**
 * Animation utilities for smooth tiling transitions.
 *
 * Uses the Clone + Opacity Zero technique: a Clutter.Clone is created at
 * the window's old position, the real actor is hidden (opacity 0), the
 * logical window is moved instantly, and the clone animates from old to
 * new position.  When the animation completes, the clone is destroyed and
 * the real actor is revealed.
 *
 * This avoids conflicts with Mutter's sync_actor_geometry (which overrides
 * actor x/y on every frame) and GNOME Shell's built-in size-change handler
 * (which overwrites translation_x/y and scale_x/y for maximize/unmaximize).
 *
 * Only uses public Clutter APIs — no private GNOME Shell methods.
 */

import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';

const DEFAULT_DURATION_MS = 200;
const ANIM_MODE = Clutter.AnimationMode.EASE_OUT_QUAD;

/**
 * Animate a window from its current position/size to a target rect.
 *
 * @param {Meta.Window} metaWindow
 * @param {{x: number, y: number, width: number, height: number}} targetRect
 *   Already rounded and clamped to >=1 dimensions.
 * @param {number} [durationMs] - Animation duration in ms (default 200).
 */
export function animateWindow(metaWindow, targetRect, durationMs) {
    const duration = durationMs ?? DEFAULT_DURATION_MS;
    const actor = metaWindow.get_compositor_private();
    if (!actor)
        return;

    const oldRect = metaWindow.get_frame_rect();
    const newX = targetRect.x;
    const newY = targetRect.y;
    const newW = targetRect.width;
    const newH = targetRect.height;

    // Skip if nothing changed
    if (oldRect.x === newX && oldRect.y === newY &&
        oldRect.width === newW && oldRect.height === newH) {
        metaWindow.move_resize_frame(false, newX, newY, newW, newH);
        return;
    }

    // Skip animation for trivially small changes (< 2px)
    const dx = Math.abs(oldRect.x - newX);
    const dy = Math.abs(oldRect.y - newY);
    const dw = Math.abs(oldRect.width - newW);
    const dh = Math.abs(oldRect.height - newH);
    if (dx < 2 && dy < 2 && dw < 2 && dh < 2) {
        metaWindow.move_resize_frame(false, newX, newY, newW, newH);
        return;
    }

    // CSD shadow offset: buffer rect (actor bounds) includes shadows,
    // frame rect does not.  We need the offset to position the clone correctly.
    const xShadow = oldRect.x - actor.get_x();
    const yShadow = oldRect.y - actor.get_y();

    // Cancel any in-flight animation on the real actor
    actor.remove_all_transitions();

    // 1. Create a clone at the OLD visual position
    let clone;
    const cloneX = oldRect.x - xShadow;
    const cloneY = oldRect.y - yShadow;
    const cloneW = oldRect.width + 2 * xShadow;
    const cloneH = oldRect.height + 2 * yShadow;
    try {
        clone = new Clutter.Clone({
            source: actor,
            reactive: false,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        // Set position/size before adding to avoid allocation warnings
        clone.set_position(cloneX, cloneY);
        clone.set_size(cloneW, cloneH);
        global.window_group.add_child(clone);
    } catch (_e) {
        // Clone creation failed — fall back to instant move
        metaWindow.move_resize_frame(false, newX, newY, newW, newH);
        return;
    }

    // 2. Hide the real actor while the clone animates
    actor.opacity = 0;

    // 3. Move the real window to its target immediately (invisible)
    metaWindow.move_resize_frame(false, newX, newY, newW, newH);

    // 4. Animate the clone from old position to new position
    clone.ease({
        x: newX - xShadow,
        y: newY - yShadow,
        width: newW + 2 * xShadow,
        height: newH + 2 * yShadow,
        duration,
        mode: ANIM_MODE,
        onStopped: () => {
            // 5. Restore the real actor and destroy the clone
            try {
                actor.opacity = 255;
                actor.scale_x = 1;
                actor.scale_y = 1;
                actor.translation_x = 0;
                actor.translation_y = 0;
            } catch (_e) {
                // Actor may have been destroyed during animation
            }
            try {
                clone.destroy();
            } catch (_e) {
                // Clone may already be destroyed
            }
        },
    });
}

/**
 * Animate a border St.Bin to a new position/size.
 *
 * @param {St.Bin} border
 * @param {{x: number, y: number, width: number, height: number}} frameRect
 *   The focused window's frame rect.
 * @param {number} borderWidth - Border thickness in pixels.
 * @param {number} [durationMs] - Animation duration in ms (default 200).
 */
export function animateBorder(border, frameRect, borderWidth, durationMs) {
    border.remove_all_transitions();

    border.ease({
        x: frameRect.x - borderWidth,
        y: frameRect.y - borderWidth,
        width: frameRect.width + borderWidth * 2,
        height: frameRect.height + borderWidth * 2,
        duration: durationMs ?? DEFAULT_DURATION_MS,
        mode: ANIM_MODE,
    });
}

/**
 * Instantly move a window without animation (for correction passes).
 *
 * @param {Meta.Window} metaWindow
 * @param {{x: number, y: number, width: number, height: number}} targetRect
 */
export function snapWindow(metaWindow, targetRect) {
    const actor = metaWindow.get_compositor_private();
    if (actor) {
        actor.remove_all_transitions();
        // Ensure real actor is visible (in case animation was interrupted)
        actor.opacity = 255;
        actor.translation_x = 0;
        actor.translation_y = 0;
        actor.scale_x = 1;
        actor.scale_y = 1;
    }
    metaWindow.move_resize_frame(
        false, targetRect.x, targetRect.y, targetRect.width, targetRect.height,
    );
}

/**
 * Animate a window sliding in from an offset (workspace switch effect).
 *
 * @param {Meta.Window} metaWindow
 * @param {number} offsetX - Horizontal slide offset in pixels
 * @param {number} offsetY - Vertical slide offset in pixels
 * @param {number} [durationMs] - Animation duration in ms (default 200).
 */
export function animateSlideIn(metaWindow, offsetX, offsetY, durationMs) {
    const actor = metaWindow.get_compositor_private();
    if (!actor)
        return;

    const duration = Math.round((durationMs ?? DEFAULT_DURATION_MS) * 1.5);

    actor.remove_all_transitions();
    actor.translation_x = offsetX;
    actor.translation_y = offsetY;
    actor.opacity = 0;

    actor.ease({
        translation_x: 0,
        translation_y: 0,
        opacity: 255,
        duration,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
}
