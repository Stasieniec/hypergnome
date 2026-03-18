/**
 * Animation utilities for smooth tiling transitions.
 *
 * Uses actor-transform animation: move_resize_frame() sets the logical
 * position immediately, then Clutter actor transforms (translation, scale)
 * are set to make the window visually appear at its OLD position, then
 * animated back to identity so the window glides to its new spot.
 *
 * Only uses public Clutter APIs — no private GNOME Shell methods.
 */

import Clutter from 'gi://Clutter';

const ANIM_DURATION_MS = 200;
const ANIM_MODE = Clutter.AnimationMode.EASE_OUT_QUAD;

/**
 * Animate a window from its current visual position to a target rect.
 *
 * IMPORTANT: Must be called BEFORE move_resize_frame — it captures the
 * old rect, calls move_resize_frame internally, then sets up the animation.
 *
 * @param {Meta.Window} metaWindow
 * @param {{x: number, y: number, width: number, height: number}} targetRect
 *   Already rounded and clamped to >=1 dimensions.
 */
export function animateWindow(metaWindow, targetRect) {
    const actor = metaWindow.get_compositor_private();
    if (!actor)
        return;

    // Capture the old visual rect BEFORE moving
    const oldRect = metaWindow.get_frame_rect();
    const oldX = oldRect.x;
    const oldY = oldRect.y;
    const oldW = oldRect.width;
    const oldH = oldRect.height;

    const newX = targetRect.x;
    const newY = targetRect.y;
    const newW = targetRect.width;
    const newH = targetRect.height;

    // Skip animation if nothing changed
    if (oldX === newX && oldY === newY && oldW === newW && oldH === newH) {
        metaWindow.move_resize_frame(false, newX, newY, newW, newH);
        return;
    }

    // Cancel any in-flight animation
    actor.remove_all_transitions();

    // Set the new logical position immediately
    metaWindow.move_resize_frame(false, newX, newY, newW, newH);

    // Compute inverse transforms so actor visually stays at old position
    const scaleX = newW > 0 ? oldW / newW : 1;
    const scaleY = newH > 0 ? oldH / newH : 1;
    const transX = oldX - newX;
    const transY = oldY - newY;

    // Skip animation for trivially small moves (< 2px)
    if (Math.abs(transX) < 2 && Math.abs(transY) < 2 &&
        Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01)
        return;

    // Set pivot to top-left so scale grows from the window's origin
    actor.set_pivot_point(0, 0);

    // Apply inverse transforms (visually snaps back to old position)
    actor.translation_x = transX;
    actor.translation_y = transY;
    actor.scale_x = scaleX;
    actor.scale_y = scaleY;

    // Animate back to identity (window glides to new position)
    actor.ease({
        translation_x: 0,
        translation_y: 0,
        scale_x: 1,
        scale_y: 1,
        duration: ANIM_DURATION_MS,
        mode: ANIM_MODE,
    });
}

/**
 * Animate a border St.Bin to a new position/size.
 *
 * @param {St.Bin} border
 * @param {{x: number, y: number, width: number, height: number}} frameRect
 *   The focused window's frame rect.
 * @param {number} borderWidth - Border thickness in pixels.
 */
export function animateBorder(border, frameRect, borderWidth) {
    border.remove_all_transitions();

    border.ease({
        x: frameRect.x - borderWidth,
        y: frameRect.y - borderWidth,
        width: frameRect.width + borderWidth * 2,
        height: frameRect.height + borderWidth * 2,
        duration: ANIM_DURATION_MS,
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
        actor.translation_x = 0;
        actor.translation_y = 0;
        actor.scale_x = 1;
        actor.scale_y = 1;
    }
    metaWindow.move_resize_frame(
        false, targetRect.x, targetRect.y, targetRect.width, targetRect.height,
    );
}
