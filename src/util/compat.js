import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

export const SHELL_VERSION = parseInt(Shell.version);

// Feature detection: GNOME 49 replaced get_maximized() with is_maximized()
// and removed the flags parameter from maximize()/unmaximize().
// We check the prototype chain via GObject introspection, falling back to
// version number comparison if the prototype check is inconclusive.
const _hasNewMaximizeAPI = (() => {
    try {
        // GJS exposes GObject methods on the prototype of the wrapper class.
        // On GNOME 49+, Meta.Window.prototype has is_maximized but not
        // get_maximized. Checking both avoids false positives.
        const proto = Meta.Window.prototype;
        if (typeof proto.is_maximized === 'function')
            return true;
        if (typeof proto.get_maximized === 'function')
            return false;
    } catch (_e) {
        // Prototype introspection failed — fall through to version check
    }
    return SHELL_VERSION >= 49;
})();

/**
 * Maximize a window (GNOME 49 removed the flags parameter).
 * @param {Meta.Window} win
 */
export function maximizeWindow(win) {
    if (_hasNewMaximizeAPI)
        win.maximize();
    else
        win.maximize(Meta.MaximizeFlags.BOTH);
}

/**
 * Unmaximize a window (GNOME 49 removed the flags parameter).
 * @param {Meta.Window} win
 */
export function unmaximizeWindow(win) {
    if (_hasNewMaximizeAPI)
        win.unmaximize();
    else
        win.unmaximize(Meta.MaximizeFlags.BOTH);
}

/**
 * Check if a window is fully maximized (GNOME 49 changed return type).
 * @param {Meta.Window} win
 * @returns {boolean}
 */
export function isMaximized(win) {
    if (_hasNewMaximizeAPI)
        return win.is_maximized();
    else
        return win.get_maximized() === Meta.MaximizeFlags.BOTH;
}

/**
 * Check if a window has ANY maximize/tile constraint (full, horizontal, or
 * vertical).  GNOME's native half-tile sets HORIZONTAL or VERTICAL flags
 * which prevent move_resize_frame from working correctly.
 * @param {Meta.Window} win
 * @returns {boolean}
 */
export function isConstrained(win) {
    if (_hasNewMaximizeAPI)
        return win.is_maximized();
    else
        return win.get_maximized() !== Meta.MaximizeFlags.NONE;
}

/**
 * Check if a grab operation is a window resize (not a move).
 * grab-op-begin/end only fires for move and resize operations,
 * so anything that isn't NONE or MOVING is a resize.
 * @param {number} grabOp - Meta.GrabOp value
 * @returns {boolean}
 */
export function isResizeGrab(grabOp) {
    if (!grabOp || grabOp === Meta.GrabOp.MOVING)
        return false;
    return true;
}

/**
 * Get all window actors (GNOME 48 moved this to global.compositor).
 * @returns {Meta.WindowActor[]}
 */
export function getWindowActors() {
    if (SHELL_VERSION >= 48)
        return global.compositor.get_window_actors();
    else
        return global.get_window_actors();
}
