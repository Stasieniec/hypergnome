import Meta from 'gi://Meta';

/**
 * Determine whether a window should be auto-tiled.
 * @param {Meta.Window} metaWindow
 * @param {string[]} floatList - WM_CLASS values that should always float
 * @returns {boolean}
 */
export function shouldTile(metaWindow, floatList) {
    try {
        if (metaWindow.get_window_type() !== Meta.WindowType.NORMAL)
            return false;

        if (metaWindow.is_skip_taskbar())
            return false;

        if (metaWindow.get_transient_for() !== null)
            return false;

        if (metaWindow.minimized)
            return false;

        if (metaWindow.is_fullscreen())
            return false;

        const wmClass = metaWindow.get_wm_class();
        if (wmClass && floatList.includes(wmClass))
            return false;

        return true;
    } catch (_e) {
        return false;
    }
}
