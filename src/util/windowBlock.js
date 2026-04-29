/**
 * Per-window "we just touched this" flag.
 *
 * After HyperGnome calls move_frame / move_resize_frame / unmaximize on a
 * window, Mutter fires a `size-changed` and/or `position-changed` signal
 * back at us — the same signals we listen to in order to catch external
 * geometry drift (e.g. Chromium re-broadcasting its preferred frame size
 * after a workspace switch).  Without a guard, that echo bounces straight
 * back into _applyLayout and we either thrash or, with apps that fight
 * the compositor, infinite-loop.
 *
 * Pop Shell uses the same pattern and calls it `Tags.Blocked`.  We store
 * a wall-clock expiry on the Meta.Window so multiple call sites don't
 * have to coordinate counters; whichever caller pushes the flag latest
 * wins, and the flag self-clears when its deadline passes.
 *
 * Kept GI-free so the unit tests can exercise it under plain Node.
 */

// 300 ms covers two concerns:
//   1. Slow Wayland configure-ack round trips can run 100-200 ms on weak
//      hardware; 150 ms left some echoes leaking past the block.
//   2. _applyLayout iterates every window in a tree and arms the flag once
//      per window before its move_resize_frame.  On a workspace with many
//      tiles, the first window's flag could otherwise expire before the
//      last window's signal traffic settles.
const SELF_CHANGE_BLOCK_MS = 300;

/**
 * Mark a window as having been moved/resized by us, so per-window
 * size-changed / position-changed handlers can ignore the echo.
 *
 * @param {object} metaWindow - any object the caller can hang a property on
 * @param {number} [durationMs]
 */
export function blockWindowSignals(metaWindow, durationMs) {
    metaWindow._hypergnomeBlockedUntil =
        Date.now() + (durationMs ?? SELF_CHANGE_BLOCK_MS);
}

/**
 * Whether a per-window geometry signal should be ignored because we
 * just issued the move/resize ourselves.
 *
 * @param {object} metaWindow
 * @returns {boolean}
 */
export function isWindowBlocked(metaWindow) {
    const until = metaWindow._hypergnomeBlockedUntil;
    return until !== undefined && Date.now() < until;
}

/**
 * Forget the block flag for a window.  Call when the window is being
 * unmanaged so we don't leak the property onto a stale Meta.Window
 * reference (in practice the GObject is going away, but explicit cleanup
 * keeps the contract obvious).
 *
 * @param {object} metaWindow
 */
export function clearWindowBlock(metaWindow) {
    delete metaWindow._hypergnomeBlockedUntil;
}
