/**
 * Tiling manager — orchestrates per-workspace per-monitor BSP trees.
 *
 * Connects to all relevant GNOME Shell signals (window lifecycle, workspace
 * changes, monitor changes), manages the collection of trees, and exposes
 * action methods called by keybindings.
 */

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Tree, NodeType, SplitDirection} from './tree.js';
import {computeLayout, computeNodeRect, findNeighborInDirection} from './layout.js';
import {shouldTile} from '../util/windowFilters.js';
import {unmaximizeWindow, isMaximized} from '../util/compat.js';

const DEBOUNCE_MS = 200;

export class TilingManager {
    /**
     * @param {Gio.Settings} settings
     */
    constructor(settings) {
        this._settings = settings;
        this._trees = new Map();             // "wsIndex:monIndex" -> Tree
        this._floatingWindows = new Set();   // Manually floated windows
        this._signals = [];                  // Global signal connections
        this._windowSignals = new Map();     // Meta.Window -> [{obj, id}]
        this._pendingWindows = new Map();    // Meta.Window -> {actorSignalId, idleSourceId, actor}
        this._debounceSourceId = null;
        this._enabled = false;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    enable() {
        this._enabled = true;
        const display = global.display;
        const wsManager = global.workspace_manager;

        // Window creation
        this._connectSignal(display, 'window-created',
            (_d, win) => this._onWindowCreated(win));

        // Focus tracking
        this._connectSignal(display, 'notify::focus-window',
            () => this._onFocusChanged());

        // Grab operations (user drag/resize)
        this._connectSignal(display, 'grab-op-begin',
            (_d, win, op) => this._onGrabBegin(win, op));
        this._connectSignal(display, 'grab-op-end',
            (_d, win, op) => this._onGrabEnd(win, op));

        // Workspace changes
        this._connectSignal(wsManager, 'active-workspace-changed',
            () => this._onWorkspaceChanged());

        // Monitor changes (Main.layoutManager is the stable way across GNOME 46-49)
        this._connectSignal(Main.layoutManager, 'monitors-changed',
            () => this._onMonitorsChanged());

        // Work area changes (e.g. panel resize)
        this._connectSignal(display, 'workareas-changed',
            () => this._queueRelayout());

        // Settings changes that affect layout
        this._connectSignal(this._settings, 'changed::inner-gap',
            () => this._queueRelayout());
        this._connectSignal(this._settings, 'changed::outer-gap',
            () => this._queueRelayout());
        this._connectSignal(this._settings, 'changed::tiling-enabled',
            () => this._onTilingEnabledChanged());
        this._connectSignal(this._settings, 'changed::float-list',
            () => this._onFloatListChanged());

        // Tile existing windows on the active workspace
        if (this._settings.get_boolean('tiling-enabled'))
            this._tileExistingWindows();
    }

    disable() {
        this._enabled = false;

        // Remove debounce timer
        if (this._debounceSourceId !== null) {
            GLib.source_remove(this._debounceSourceId);
            this._debounceSourceId = null;
        }

        // Clean up pending window operations
        for (const [_win, pending] of this._pendingWindows) {
            if (pending.actorSignalId !== null) {
                try { pending.actor.disconnect(pending.actorSignalId); } catch (_e) {}
            }
            if (pending.idleSourceId !== null)
                GLib.source_remove(pending.idleSourceId);
        }
        this._pendingWindows.clear();

        // Disconnect per-window signals
        for (const [_win, sigs] of this._windowSignals) {
            for (const {obj, id} of sigs) {
                try { obj.disconnect(id); } catch (_e) {}
            }
        }
        this._windowSignals.clear();

        // Disconnect global signals
        for (const {obj, id} of this._signals) {
            try { obj.disconnect(id); } catch (_e) {}
        }
        this._signals = [];

        // Destroy all trees
        for (const [_key, tree] of this._trees)
            tree.destroy();
        this._trees.clear();

        // Clear remaining state
        this._floatingWindows.clear();
        this._grabbedWindow = null;
        this._settings = null;
    }

    // =========================================================================
    // Public action methods (called by keybindings)
    // =========================================================================

    /**
     * Move focus to the nearest window in a direction.
     * @param {string} direction - 'left'|'right'|'up'|'down'
     */
    focusDirection(direction) {
        if (!this._isTilingActive())
            return;

        const focused = global.display.get_focus_window();
        if (!focused)
            return;

        const tree = this._findTreeContaining(focused);
        if (!tree)
            return;

        const rects = this._computeLayoutForWindow(focused);
        if (!rects)
            return;

        const neighbor = findNeighborInDirection(rects, focused, direction);
        if (neighbor)
            neighbor.activate(global.get_current_time());
    }

    /**
     * Swap the focused window with its neighbor in a direction.
     * @param {string} direction - 'left'|'right'|'up'|'down'
     */
    moveDirection(direction) {
        if (!this._isTilingActive())
            return;

        const focused = global.display.get_focus_window();
        if (!focused)
            return;

        const tree = this._findTreeContaining(focused);
        if (!tree)
            return;

        const rects = this._computeLayoutForWindow(focused);
        if (!rects)
            return;

        const neighbor = findNeighborInDirection(rects, focused, direction);
        if (neighbor) {
            tree.swap(focused, neighbor);
            const ws = focused.get_workspace();
            if (ws)
                this._applyLayout(ws.index(), focused.get_monitor());
        }
    }

    /**
     * Toggle the focused window between tiled and floating.
     */
    toggleFloat() {
        const focused = global.display.get_focus_window();
        if (!focused)
            return;

        if (this._floatingWindows.has(focused)) {
            this._floatingWindows.delete(focused);
            if (this._isTilingActive())
                this._insertWindow(focused);
        } else {
            const tree = this._findTreeContaining(focused);
            if (tree) {
                tree.remove(focused);
                this._floatingWindows.add(focused);
                this._queueRelayout();
            } else {
                // Not in any tree — just mark as floating
                this._floatingWindows.add(focused);
            }
        }
    }

    /**
     * Close the focused window.
     */
    closeWindow() {
        const focused = global.display.get_focus_window();
        if (focused)
            focused.delete(global.get_current_time());
    }

    /**
     * Toggle the split direction of the focused window's parent fork.
     */
    toggleSplit() {
        if (!this._isTilingActive())
            return;

        const focused = global.display.get_focus_window();
        if (!focused)
            return;

        const tree = this._findTreeContaining(focused);
        if (!tree)
            return;

        const leaf = tree.findLeaf(focused);
        if (!leaf || !leaf.parent)
            return;

        const fork = leaf.parent;
        fork.splitDirection = fork.splitDirection === SplitDirection.HORIZONTAL
            ? SplitDirection.VERTICAL
            : SplitDirection.HORIZONTAL;

        this._queueRelayout();
    }

    /**
     * Reset all split ratios on the active workspace to 0.5.
     */
    equalize() {
        if (!this._isTilingActive())
            return;

        const wsIndex = global.workspace_manager.get_active_workspace_index();
        const nMonitors = global.display.get_n_monitors();

        for (let i = 0; i < nMonitors; i++) {
            const tree = this._getTree(wsIndex, i);
            this._resetRatios(tree.root);
            this._applyLayout(wsIndex, i);
        }
    }

    // =========================================================================
    // Signal handlers
    // =========================================================================

    _onWindowCreated(metaWindow) {
        if (!this._isTilingActive())
            return;

        const floatList = this._settings.get_strv('float-list');
        if (!shouldTile(metaWindow, floatList))
            return;

        // Wait for first frame before moving (Wayland requirement)
        const actor = metaWindow.get_compositor_private();
        if (!actor)
            return;

        const actorSignalId = actor.connect('first-frame', () => {
            // Disconnect the first-frame signal immediately
            const pending = this._pendingWindows.get(metaWindow);
            if (pending)
                pending.actorSignalId = null;

            try { actor.disconnect(actorSignalId); } catch (_e) {}

            const idleSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._pendingWindows.delete(metaWindow);
                try {
                    this._insertWindow(metaWindow);
                } catch (e) {
                    logError(e, 'HyperGnome: error inserting window');
                }
                return GLib.SOURCE_REMOVE;
            });

            if (this._pendingWindows.has(metaWindow))
                this._pendingWindows.get(metaWindow).idleSourceId = idleSourceId;
        });

        this._pendingWindows.set(metaWindow, {actorSignalId, idleSourceId: null, actor});
    }

    _onFocusChanged() {
        // Focus tracking is implicit — we read focus at action time.
        // This handler exists as a hook for future features (e.g. active border).
    }

    _onGrabBegin(metaWindow, _grabOp) {
        this._grabbedWindow = metaWindow;
    }

    _onGrabEnd(metaWindow, _grabOp) {
        this._grabbedWindow = null;

        if (!metaWindow)
            return;
        if (this._floatingWindows.has(metaWindow))
            return;

        // After user drag/resize, snap back to tiled position
        if (this._findTreeContaining(metaWindow))
            this._queueRelayout();
    }

    _onWorkspaceChanged() {
        if (this._isTilingActive())
            this._relayoutActiveWorkspace();
    }

    _onMonitorsChanged() {
        // Destroy all trees and re-tile from scratch
        for (const [_key, tree] of this._trees)
            tree.destroy();
        this._trees.clear();

        if (this._isTilingActive())
            this._tileExistingWindows();
    }

    _onTilingEnabledChanged() {
        const enabled = this._settings.get_boolean('tiling-enabled');
        if (!enabled) {
            // Disconnect per-window signals, destroy trees
            for (const [win, _sigs] of this._windowSignals)
                this._disconnectWindowSignals(win);
            for (const [_key, tree] of this._trees)
                tree.destroy();
            this._trees.clear();
            this._floatingWindows.clear();
        } else {
            this._tileExistingWindows();
        }
    }

    _onFloatListChanged() {
        const floatList = this._settings.get_strv('float-list');

        for (const [_key, tree] of this._trees) {
            const windows = tree.getWindows();
            for (const win of windows) {
                if (!shouldTile(win, floatList)) {
                    tree.remove(win);
                    this._disconnectWindowSignals(win);
                }
            }
        }
        this._queueRelayout();
    }

    // -- Per-window signal handlers --

    _onWindowUnmanaging(metaWindow) {
        this._disconnectWindowSignals(metaWindow);
        this._cleanupPending(metaWindow);
        this._floatingWindows.delete(metaWindow);

        const tree = this._findTreeContaining(metaWindow);
        if (tree) {
            tree.remove(metaWindow);
            this._queueRelayout();
        }
    }

    _onWindowWorkspaceChanged(metaWindow) {
        // Remove from whichever tree currently contains it
        const oldTree = this._findTreeContaining(metaWindow);
        if (oldTree)
            oldTree.remove(metaWindow);

        // Insert into new tree
        if (!this._isTilingActive())
            return;
        if (this._floatingWindows.has(metaWindow))
            return;

        const floatList = this._settings.get_strv('float-list');
        if (!shouldTile(metaWindow, floatList))
            return;

        const ws = metaWindow.get_workspace();
        if (!ws)
            return;

        const wsIndex = ws.index();
        const monIndex = metaWindow.get_monitor();
        const tree = this._getTree(wsIndex, monIndex);
        const workArea = ws.get_work_area_for_monitor(monIndex);
        const nodeRect = tree.isEmpty() ? workArea : workArea;
        const defaultRatio = this._settings.get_double('split-ratio');

        tree.insert(metaWindow, null, defaultRatio, nodeRect);
        this._queueRelayout();
    }

    _onWindowMinimizedChanged(metaWindow) {
        if (metaWindow.minimized) {
            const tree = this._findTreeContaining(metaWindow);
            if (tree) {
                tree.remove(metaWindow);
                this._queueRelayout();
            }
        } else {
            // Restored from minimize — re-insert
            if (this._isTilingActive())
                this._insertWindow(metaWindow);
        }
    }

    _onWindowFullscreenChanged(metaWindow) {
        if (metaWindow.is_fullscreen()) {
            const tree = this._findTreeContaining(metaWindow);
            if (tree) {
                tree.remove(metaWindow);
                this._queueRelayout();
            }
        } else {
            // Exited fullscreen — re-insert
            if (this._isTilingActive())
                this._insertWindow(metaWindow);
        }
    }

    // =========================================================================
    // Core tiling logic
    // =========================================================================

    /**
     * Insert a window into its workspace/monitor tree.
     * @param {Meta.Window} metaWindow
     */
    _insertWindow(metaWindow) {
        if (!this._enabled)
            return;

        const floatList = this._settings.get_strv('float-list');
        if (!shouldTile(metaWindow, floatList))
            return;
        if (this._floatingWindows.has(metaWindow))
            return;

        const ws = metaWindow.get_workspace();
        if (!ws)
            return;

        const wsIndex = ws.index();
        const monIndex = metaWindow.get_monitor();
        const tree = this._getTree(wsIndex, monIndex);

        if (tree.contains(metaWindow))
            return;

        // Unmaximize if maximized — we manage tiling
        if (isMaximized(metaWindow))
            unmaximizeWindow(metaWindow);

        const focusedWindow = global.display.get_focus_window();
        const workArea = ws.get_work_area_for_monitor(monIndex);
        const defaultRatio = this._settings.get_double('split-ratio');

        // Compute the rect of the target leaf for aspect ratio split direction
        let nodeRect = workArea;
        if (focusedWindow && tree.contains(focusedWindow)) {
            const targetLeaf = tree.findLeaf(focusedWindow);
            if (targetLeaf)
                nodeRect = computeNodeRect(targetLeaf, workArea);
        }

        tree.insert(metaWindow, focusedWindow, defaultRatio, nodeRect);
        this._connectWindowSignals(metaWindow);
        this._applyLayout(wsIndex, monIndex);
    }

    /**
     * Apply computed layout to all windows in a workspace/monitor tree.
     * @param {number} wsIndex
     * @param {number} monIndex
     */
    _applyLayout(wsIndex, monIndex) {
        const tree = this._getTree(wsIndex, monIndex);
        if (tree.isEmpty())
            return;

        const ws = global.workspace_manager.get_workspace_by_index(wsIndex);
        if (!ws)
            return;

        const workArea = ws.get_work_area_for_monitor(monIndex);
        const innerGap = this._settings.get_int('inner-gap');
        const outerGap = this._settings.get_int('outer-gap');
        const rects = computeLayout(tree.root, workArea, innerGap, outerGap);

        for (const [metaWindow, rect] of rects) {
            try {
                if (metaWindow.minimized || metaWindow.is_fullscreen())
                    continue;

                if (isMaximized(metaWindow))
                    unmaximizeWindow(metaWindow);

                metaWindow.move_resize_frame(
                    false,
                    Math.round(rect.x),
                    Math.round(rect.y),
                    Math.round(rect.width),
                    Math.round(rect.height),
                );
            } catch (_e) {
                // Window may have been destroyed between layout calc and apply
            }
        }
    }

    /**
     * Tile all existing windows on the active workspace.
     */
    _tileExistingWindows() {
        const wsIndex = global.workspace_manager.get_active_workspace_index();
        const ws = global.workspace_manager.get_active_workspace();
        const nMonitors = global.display.get_n_monitors();
        const floatList = this._settings.get_strv('float-list');

        for (let monIndex = 0; monIndex < nMonitors; monIndex++) {
            const windows = ws.list_windows().filter(w =>
                w.get_monitor() === monIndex && shouldTile(w, floatList)
            );

            const sorted = global.display.sort_windows_by_stacking(windows);
            const workArea = ws.get_work_area_for_monitor(monIndex);
            const defaultRatio = this._settings.get_double('split-ratio');

            for (const metaWindow of sorted) {
                if (this._floatingWindows.has(metaWindow))
                    continue;

                const tree = this._getTree(wsIndex, monIndex);
                if (tree.contains(metaWindow))
                    continue;

                if (isMaximized(metaWindow))
                    unmaximizeWindow(metaWindow);

                // For split direction: use node rect if tree has content, else work area
                let nodeRect = workArea;
                const focusedWindow = global.display.get_focus_window();
                if (focusedWindow && tree.contains(focusedWindow)) {
                    const targetLeaf = tree.findLeaf(focusedWindow);
                    if (targetLeaf)
                        nodeRect = computeNodeRect(targetLeaf, workArea);
                }

                tree.insert(metaWindow, null, defaultRatio, nodeRect);
                this._connectWindowSignals(metaWindow);
            }

            this._applyLayout(wsIndex, monIndex);
        }
    }

    // =========================================================================
    // Debounce
    // =========================================================================

    _queueRelayout() {
        if (this._debounceSourceId !== null) {
            GLib.source_remove(this._debounceSourceId);
            this._debounceSourceId = null;
        }

        this._debounceSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._debounceSourceId = null;
            try {
                this._relayoutActiveWorkspace();
            } catch (e) {
                logError(e, 'HyperGnome: error during relayout');
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _relayoutActiveWorkspace() {
        const wsIndex = global.workspace_manager.get_active_workspace_index();
        const nMonitors = global.display.get_n_monitors();
        for (let i = 0; i < nMonitors; i++)
            this._applyLayout(wsIndex, i);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    _isTilingActive() {
        return this._enabled && this._settings &&
               this._settings.get_boolean('tiling-enabled');
    }

    /**
     * Get or create tree for a workspace+monitor pair.
     * @param {number} wsIndex
     * @param {number} monIndex
     * @returns {Tree}
     */
    _getTree(wsIndex, monIndex) {
        const key = `${wsIndex}:${monIndex}`;
        if (!this._trees.has(key))
            this._trees.set(key, new Tree());
        return this._trees.get(key);
    }

    /**
     * Find which tree contains a given window.
     * @param {Meta.Window} metaWindow
     * @returns {Tree|null}
     */
    _findTreeContaining(metaWindow) {
        for (const [_key, tree] of this._trees) {
            if (tree.contains(metaWindow))
                return tree;
        }
        return null;
    }

    /**
     * Compute layout rects for the tree containing a given window.
     * @param {Meta.Window} metaWindow
     * @returns {Map|null}
     */
    _computeLayoutForWindow(metaWindow) {
        const tree = this._findTreeContaining(metaWindow);
        if (!tree)
            return null;

        const ws = metaWindow.get_workspace();
        if (!ws)
            return null;

        const monIndex = metaWindow.get_monitor();
        const workArea = ws.get_work_area_for_monitor(monIndex);
        const innerGap = this._settings.get_int('inner-gap');
        const outerGap = this._settings.get_int('outer-gap');

        return computeLayout(tree.root, workArea, innerGap, outerGap);
    }

    /**
     * Reset all split ratios in a subtree to 0.5.
     * @param {import('./tree.js').Node} node
     */
    _resetRatios(node) {
        if (!node || node.type !== NodeType.FORK)
            return;
        node.splitRatio = 0.5;
        this._resetRatios(node.childA);
        this._resetRatios(node.childB);
    }

    // =========================================================================
    // Per-window signal management
    // =========================================================================

    _connectWindowSignals(metaWindow) {
        // Don't double-connect
        if (this._windowSignals.has(metaWindow))
            return;

        const sigs = [];

        sigs.push({
            obj: metaWindow,
            id: metaWindow.connect('unmanaging', () => {
                try { this._onWindowUnmanaging(metaWindow); }
                catch (e) { logError(e, 'HyperGnome: unmanaging'); }
            }),
        });

        sigs.push({
            obj: metaWindow,
            id: metaWindow.connect('workspace-changed', () => {
                try { this._onWindowWorkspaceChanged(metaWindow); }
                catch (e) { logError(e, 'HyperGnome: workspace-changed'); }
            }),
        });

        sigs.push({
            obj: metaWindow,
            id: metaWindow.connect('notify::minimized', () => {
                try { this._onWindowMinimizedChanged(metaWindow); }
                catch (e) { logError(e, 'HyperGnome: minimized'); }
            }),
        });

        sigs.push({
            obj: metaWindow,
            id: metaWindow.connect('notify::fullscreen', () => {
                try { this._onWindowFullscreenChanged(metaWindow); }
                catch (e) { logError(e, 'HyperGnome: fullscreen'); }
            }),
        });

        this._windowSignals.set(metaWindow, sigs);
    }

    _disconnectWindowSignals(metaWindow) {
        const sigs = this._windowSignals.get(metaWindow);
        if (!sigs)
            return;
        for (const {obj, id} of sigs) {
            try { obj.disconnect(id); } catch (_e) {}
        }
        this._windowSignals.delete(metaWindow);
    }

    _cleanupPending(metaWindow) {
        const pending = this._pendingWindows.get(metaWindow);
        if (!pending)
            return;
        if (pending.actorSignalId !== null) {
            try { pending.actor.disconnect(pending.actorSignalId); } catch (_e) {}
        }
        if (pending.idleSourceId !== null)
            GLib.source_remove(pending.idleSourceId);
        this._pendingWindows.delete(metaWindow);
    }

    // =========================================================================
    // Global signal management
    // =========================================================================

    _connectSignal(obj, signal, handler) {
        const id = obj.connect(signal, handler);
        this._signals.push({obj, id});
        return id;
    }
}
