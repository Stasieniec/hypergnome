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

export function moveActiveToWorkspace(_workspaceManager, _focusedWindow, _index, _dynamic, _time) {
    // Filled in by Task 4
}

export function cycleWorkspace(_workspaceManager, _direction, _time) {
    // Filled in by Task 5
}

export function moveActiveAndCycle(_workspaceManager, _focusedWindow, _direction, _time) {
    // Filled in by Task 5
}
