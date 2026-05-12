/**
 * Workspace actions for HyperGnome's workspace keybindings.
 *
 * Pure-ish module: all dependencies (workspace manager, dynamic-workspaces
 * flag) are passed in, so this is unit-testable without a live GNOME shell.
 *
 * Index semantics: 0-based throughout (workspace 1 in the UI = index 0).
 * Callers from keybinding handlers should convert from the user-facing
 * 1-based binding name (e.g. tile-workspace-1) to a 0-based index.
 */

/**
 * Switch to the given workspace by 0-based index.
 *
 * In dynamic mode: appends workspaces as needed until `index` exists, then
 * activates it. In fixed mode: no-op when `index` is out of range.
 *
 * @param {object} workspaceManager - Meta.WorkspaceManager (or mock)
 * @param {number} index - 0-based target workspace
 * @param {boolean} dynamic - whether dynamic-workspaces is enabled
 * @param {number} [time] - Clutter event time (default 0)
 */
export function switchToWorkspace(workspaceManager, index, dynamic, time = 0) {
    if (index < 0) return;
    const n = workspaceManager.get_n_workspaces();
    if (index < n) {
        const ws = workspaceManager.get_workspace_by_index(index);
        if (ws) ws.activate(time);
        return;
    }
    if (!dynamic) return;
    // Dynamic mode: append until index exists, activating the last one.
    let current = n;
    while (current <= index) {
        const shouldActivate = current === index;
        workspaceManager.append_new_workspace(shouldActivate, time);
        current += 1;
    }
}

/**
 * Move the focused window to the given workspace and follow it there.
 *
 * @param {object} workspaceManager - Meta.WorkspaceManager (or mock)
 * @param {object|null} focusedWindow - Meta.Window or null
 * @param {number} index - 0-based target workspace
 * @param {boolean} dynamic - whether dynamic-workspaces is enabled
 * @param {number} [time] - Clutter event time
 */
export function moveActiveToWorkspace(workspaceManager, focusedWindow, index, dynamic, time = 0) {
    if (!focusedWindow) return;
    if (index < 0) return;
    const n = workspaceManager.get_n_workspaces();
    if (index >= n) {
        if (!dynamic) return;
        // Append without activating: activation happens after the window has
        // been moved, otherwise the target workspace would become active
        // before the window arrives there.
        let current = n;
        while (current <= index) {
            workspaceManager.append_new_workspace(false, time);
            current += 1;
        }
    }
    focusedWindow.change_workspace_by_index(index, false);
    const ws = workspaceManager.get_workspace_by_index(index);
    if (ws) ws.activate(time);
}

export function cycleWorkspace(_workspaceManager, _direction, _time) {
    // Not yet implemented
}

export function moveActiveAndCycle(_workspaceManager, _focusedWindow, _direction, _time) {
    // Not yet implemented
}
