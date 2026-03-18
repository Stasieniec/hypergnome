import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

export const SHELL_VERSION = parseInt(Shell.version);

/**
 * Maximize a window (GNOME 49 removed the flags parameter).
 * @param {Meta.Window} win
 */
export function maximizeWindow(win) {
    if (SHELL_VERSION >= 49)
        win.maximize();
    else
        win.maximize(Meta.MaximizeFlags.BOTH);
}

/**
 * Unmaximize a window (GNOME 49 removed the flags parameter).
 * @param {Meta.Window} win
 */
export function unmaximizeWindow(win) {
    if (SHELL_VERSION >= 49)
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
    if (SHELL_VERSION >= 49)
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
    if (SHELL_VERSION >= 49)
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
