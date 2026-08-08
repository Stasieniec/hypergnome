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

import {blockWindowSignals} from './windowBlock.js';

const DEFAULT_DURATION_MS = 200;
const ANIM_MODE = Clutter.AnimationMode.EASE_OUT_QUAD;

// A bad ratio upstream (e.g. division by a zero-size fork) can produce
// NaN/Infinity here - move_frame() doesn't validate and crashes the shell.
function _isValidRect(rect) {
    return Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) && Number.isFinite(rect.height);
}

/**
 * Animate a window from its current position/size to a target rect.
 *
 * @param {Meta.Window} metaWindow
 * @param {{x: number, y: number, width: number, height: number}} targetRect
 *   Already rounded and clamped to >=1 dimensions.
 * @param {number} [durationMs] - Animation duration in ms (default 200).
 */
export function animateWindow(metaWindow, targetRect, durationMs) {
    if (!_isValidRect(targetRect)) {
        logError(new Error('HyperGnome: refusing to move window to invalid rect'),
            JSON.stringify(targetRect));
        return;
    }

    const duration = durationMs ?? DEFAULT_DURATION_MS;
    const actor = metaWindow.get_compositor_private();
    if (!actor)
        return;

    const oldRect = metaWindow.get_frame_rect();
    const newX = targetRect.x;
    const newY = targetRect.y;
    const newW = targetRect.width;
    const newH = targetRect.height;

    // Already at target — no compositor work needed.
    if (oldRect.x === newX && oldRect.y === newY &&
        oldRect.width === newW && oldRect.height === newH)
        return;

    // Skip animation for trivially small changes (< 2px) — but still issue
    // the move so the window snaps to the rounded coordinates.
    const dx = Math.abs(oldRect.x - newX);
    const dy = Math.abs(oldRect.y - newY);
    const dw = Math.abs(oldRect.width - newW);
    const dh = Math.abs(oldRect.height - newH);
    if (dx < 2 && dy < 2 && dw < 2 && dh < 2) {
        blockWindowSignals(metaWindow);
        metaWindow.move_frame(true, newX, newY);
        metaWindow.move_resize_frame(true, newX, newY, newW, newH);
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
        blockWindowSignals(metaWindow);
        metaWindow.move_frame(true, newX, newY);
        metaWindow.move_resize_frame(true, newX, newY, newW, newH);
        return;
    }

    // 2. Hide the real actor while the clone animates
    actor.opacity = 0;

    // 3. Move the real window to its target immediately (invisible)
    //    move_frame first ensures position takes effect even on apps
    //    (e.g. terminals) that ignore position changes in move_resize_frame.
    //    user_op=true avoids work area clamping on multi-monitor setups.
    blockWindowSignals(metaWindow);
    metaWindow.move_frame(true, newX, newY);
    metaWindow.move_resize_frame(true, newX, newY, newW, newH);

    // 4. Animate the clone from old position to new position
    clone.ease({
        x: newX - xShadow,
        y: newY - yShadow,
        width: newW + 2 * xShadow,
        height: newH + 2 * yShadow,
        duration,
        mode: ANIM_MODE,
        onStopped: () => {
            // 5. Restore the real actor and destroy the clone.
            //
            // Only reset properties that DON'T currently have a
            // transition on them — otherwise we overwrite an in-flight
            // workspace-switch slide-in (which eases translation_y,
            // opacity and scale_{x,y}) at this clone's end-of-life, and
            // the slide-in then snaps back to its interpolated value
            // on the next frame, producing a visible one-frame pop.
            try {
                if (!actor.get_transition('opacity'))
                    actor.opacity = 255;
                if (!actor.get_transition('scale-x'))
                    actor.scale_x = 1;
                if (!actor.get_transition('scale-y'))
                    actor.scale_y = 1;
                if (!actor.get_transition('translation-x'))
                    actor.translation_x = 0;
                if (!actor.get_transition('translation-y'))
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

    // Also ease scale, translation and opacity back to canonical: the
    // remove_all_transitions above cuts any in-flight pulse or slide-in,
    // which would otherwise leave the border at scale != 1 or
    // translation != 0 for the duration of this resize (visible as the
    // border being "bigger" or offset from the window).
    border.ease({
        x: frameRect.x - borderWidth,
        y: frameRect.y - borderWidth,
        width: frameRect.width + borderWidth * 2,
        height: frameRect.height + borderWidth * 2,
        scale_x: 1,
        scale_y: 1,
        translation_x: 0,
        translation_y: 0,
        opacity: 255,
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
    if (!_isValidRect(targetRect)) {
        logError(new Error('HyperGnome: refusing to move window to invalid rect'),
            JSON.stringify(targetRect));
        return;
    }

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
    blockWindowSignals(metaWindow);
    metaWindow.move_frame(true, targetRect.x, targetRect.y);
    metaWindow.move_resize_frame(
        true, targetRect.x, targetRect.y, targetRect.width, targetRect.height,
    );
}

