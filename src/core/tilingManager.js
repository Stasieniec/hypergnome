/**
 * Tiling manager — orchestrates per-workspace per-monitor BSP trees.
 *
 * Connects to all relevant GNOME Shell signals (window lifecycle, workspace
 * changes, monitor changes), manages the collection of trees, and exposes
 * action methods called by keybindings.
 */

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Tree, NodeType, SplitDirection} from './tree.js';
import {computeLayout, computeNodeRect, findNeighborInDirection} from './layout.js';
import {moveWindowToMonitor, focusOnAdjacentMonitor} from './monitorUtils.js';
import {shouldTile} from '../util/windowFilters.js';
import {unmaximizeWindow, isMaximized, isConstrained, isResizeGrab} from '../util/compat.js';
import {SignalManager} from '../util/signalManager.js';
import {animateWindow, snapWindow, animateSlideIn} from '../util/animator.js';

const DEBOUNCE_MS = 200;

export class TilingManager {
    /**
     * @param {Gio.Settings} settings
     */
    constructor(settings) {
        this._settings = settings;
        this._trees = new Map();             // "wsIndex:monIndex" -> Tree
        this._floatingWindows = new Set();   // Manually floated windows
        this._signals = new SignalManager(); // Global signal connections
        this._windowSignals = new Map();     // Meta.Window -> [{obj, id}]
        this._pendingWindows = new Map();    // Meta.Window -> {actorSignalId, idleSourceId, actor}
        this._debounceSourceId = null;
        this._deferredLayoutSources = new Set(); // Idle source IDs for deferred layout
        this._movingWindow = null;          // Guard for cross-monitor moves
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
        this._signals.connect(display, 'window-created',
            (_d, win) => this._onWindowCreated(win));

        // Focus tracking
        this._signals.connect(display, 'notify::focus-window',
            () => this._onFocusChanged());

        // Grab operations (user drag/resize)
        this._signals.connect(display, 'grab-op-begin',
            (_d, win, op) => this._onGrabBegin(win, op));
        this._signals.connect(display, 'grab-op-end',
            (_d, win, op) => this._onGrabEnd(win, op));

        // Workspace changes
        this._signals.connect(wsManager, 'active-workspace-changed',
            () => this._onWorkspaceChanged());

        // Monitor changes (Main.layoutManager is the stable way across GNOME 46-49)
        this._signals.connect(Main.layoutManager, 'monitors-changed',
            () => this._onMonitorsChanged());

        // Window entered a different monitor (user drag or programmatic move)
        this._signals.connect(display, 'window-entered-monitor',
            (_d, monIndex, win) => this._onWindowEnteredMonitor(win, monIndex));

        // Work area changes (e.g. panel resize)
        this._signals.connect(display, 'workareas-changed',
            () => this._queueRelayout());

        // Settings changes that affect layout
        this._signals.connect(this._settings, 'changed::inner-gap',
            () => this._queueRelayout());
        this._signals.connect(this._settings, 'changed::outer-gap',
            () => this._queueRelayout());
        this._signals.connect(this._settings, 'changed::tiling-enabled',
            () => this._onTilingEnabledChanged());
        this._signals.connect(this._settings, 'changed::float-list',
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

        // Remove deferred layout sources
        for (const sourceId of this._deferredLayoutSources)
            GLib.source_remove(sourceId);
        this._deferredLayoutSources.clear();

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
        this._signals.destroy();

        // Destroy all trees
        for (const [_key, tree] of this._trees)
            tree.destroy();
        this._trees.clear();

        // Clear remaining state
        this._floatingWindows.clear();
        this._grabbedWindow = null;
        this._movingWindow = null;
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
        if (neighbor) {
            neighbor.activate(global.get_current_time());
        } else {
            // No neighbor in same tree — try focusing on adjacent monitor
            focusOnAdjacentMonitor(focused, direction, this._monitorCtx());
        }
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
            // Swap within same tree
            tree.swap(focused, neighbor);
            const ws = focused.get_workspace();
            if (ws)
                this._applyLayout(ws.index(), focused.get_monitor());
        } else {
            // No neighbor in tree — try moving to the adjacent monitor
            moveWindowToMonitor(focused, direction, this._monitorCtx());
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

        // Apply immediately for instant visual feedback (don't debounce)
        const ws = focused.get_workspace();
        if (ws)
            this._applyLayout(ws.index(), focused.get_monitor());
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

    /**
     * Resize the focused window in a direction by adjusting the
     * nearest compatible ancestor fork's splitRatio.
     * @param {string} direction - 'left'|'right'|'up'|'down'
     */
    resizeDirection(direction) {
        if (!this._isTilingActive())
            return;

        const focused = global.display.get_focus_window();
        if (!focused)
            return;

        const tree = this._findTreeContaining(focused);
        if (!tree)
            return;

        const result = tree.findResizableFork(focused, direction);
        if (!result)
            return;

        const step = this._settings.get_double('resize-step');
        const {fork, delta} = result;

        fork.splitRatio = Math.min(0.9, Math.max(0.1, fork.splitRatio + delta * step));

        const ws = focused.get_workspace();
        if (ws)
            this._applyLayout(ws.index(), focused.get_monitor());
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

    _onGrabEnd(metaWindow, grabOp) {
        this._grabbedWindow = null;

        if (!metaWindow)
            return;
        if (this._floatingWindows.has(metaWindow))
            return;

        const tree = this._findTreeContaining(metaWindow);
        if (!tree)
            return;

        if (isResizeGrab(grabOp)) {
            // Mouse resize: compute new splitRatio from post-drag geometry
            try {
                this._handleResizeGrab(metaWindow, tree);
            } catch (e) {
                logError(e, 'HyperGnome: resize grab');
                this._queueRelayout();
            }
        } else {
            // Move grab: snap back to tiled position
            this._queueRelayout();
        }
    }

    _onWorkspaceChanged() {
        if (!this._isTilingActive())
            return;

        this._relayoutActiveWorkspace();

        // Slide-in animation for windows on the new workspace
        if (this._settings.get_boolean('animation-enabled')) {
            try {
                const wsIndex = global.workspace_manager.get_active_workspace_index();
                const nMonitors = global.display.get_n_monitors();
                const SLIDE_OFFSET = 60;
                for (let i = 0; i < nMonitors; i++) {
                    const tree = this._trees.get(`${wsIndex}:${i}`);
                    if (!tree)
                        continue;
                    for (const win of tree.getWindows()) {
                        animateSlideIn(win, 0, SLIDE_OFFSET);
                    }
                }
            } catch (_e) {
                // Non-critical — slide animation failure shouldn't break tiling
            }
        }
    }

    _onWindowEnteredMonitor(metaWindow, monIndex) {
        // Ignore during our own cross-monitor moves
        if (this._movingWindow === metaWindow)
            return;
        if (!this._isTilingActive())
            return;
        if (this._floatingWindows.has(metaWindow))
            return;

        const floatList = this._settings.get_strv('float-list');
        if (!shouldTile(metaWindow, floatList))
            return;

        // Check if the window is in a tree for a DIFFERENT monitor
        const existingTree = this._findTreeContaining(metaWindow);
        if (existingTree) {
            // Find which tree key it belongs to
            for (const [key, tree] of this._trees) {
                if (tree !== existingTree)
                    continue;
                const [, oldMon] = key.split(':').map(Number);
                if (oldMon !== monIndex) {
                    // Window moved monitors — remove from old tree, insert into new
                    tree.remove(metaWindow);
                    const ws = metaWindow.get_workspace();
                    if (ws) {
                        const wsIndex = ws.index();
                        const newTree = this._getTree(wsIndex, monIndex);
                        const workArea = ws.get_work_area_for_monitor(monIndex);
                        const defaultRatio = this._settings.get_double('split-ratio');
                        let nodeRect = workArea;
                        const lastLeaf = newTree._findLastLeaf(newTree.root);
                        if (lastLeaf)
                            nodeRect = computeNodeRect(lastLeaf, workArea);
                        newTree.insert(metaWindow, null, defaultRatio, nodeRect);
                        this._applyLayout(wsIndex, oldMon);
                        this._applyLayout(wsIndex, monIndex);
                    }
                }
                break;
            }
        }
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
        // Ignore during cross-monitor moves (we handle tree ops ourselves)
        if (this._movingWindow === metaWindow)
            return;

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
        const defaultRatio = this._settings.get_double('split-ratio');

        // Compute nodeRect from the last leaf for proper dwindle direction
        let nodeRect = workArea;
        const lastLeaf = tree._findLastLeaf(tree.root);
        if (lastLeaf)
            nodeRect = computeNodeRect(lastLeaf, workArea);

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

        const workArea = ws.get_work_area_for_monitor(monIndex);
        const defaultRatio = this._settings.get_double('split-ratio');

        // Find the split target: focused window if it's in THIS tree, else null
        // (tree.insert falls back to the last leaf when target is null)
        const focusedWindow = global.display.get_focus_window();
        const splitTarget = (focusedWindow && tree.contains(focusedWindow))
            ? focusedWindow : null;

        // Compute the rect of the target leaf for aspect ratio split direction
        let nodeRect = workArea;
        const targetLeaf = splitTarget
            ? tree.findLeaf(splitTarget)
            : tree._findLastLeaf(tree.root);
        if (targetLeaf)
            nodeRect = computeNodeRect(targetLeaf, workArea);

        tree.insert(metaWindow, splitTarget, defaultRatio, nodeRect);
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

        let needsDeferredPass = false;

        for (const [metaWindow, rect] of rects) {
            try {
                if (metaWindow.minimized || metaWindow.is_fullscreen())
                    continue;

                // Guard against zero/negative dimensions from gap math
                const targetRect = {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.max(1, Math.round(rect.width)),
                    height: Math.max(1, Math.round(rect.height)),
                };

                // Clear any maximize/tile constraint (full, half, or quarter).
                // GNOME's native tiling sets MaximizeFlags that prevent
                // move_resize_frame from working correctly.
                if (isConstrained(metaWindow)) {
                    unmaximizeWindow(metaWindow);
                    needsDeferredPass = true;
                }

                // animateWindow captures old rect, calls move_resize_frame,
                // then animates the actor from old to new position.
                animateWindow(metaWindow, targetRect);
            } catch (_e) {
                // Window may have been destroyed between layout calc and apply
            }
        }

        // Deferred pass: re-apply without animation after an idle tick
        // so that any unmaximize operations have settled.
        if (needsDeferredPass)
            this._scheduleDeferredLayout(wsIndex, monIndex);
    }

    /**
     * Schedule a one-shot deferred layout pass to catch windows whose
     * move_resize_frame was overridden by a concurrent unmaximize.
     */
    _scheduleDeferredLayout(wsIndex, monIndex) {
        const sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._deferredLayoutSources.delete(sourceId);
            try {
                if (!this._enabled)
                    return GLib.SOURCE_REMOVE;

                const tree = this._getTree(wsIndex, monIndex);
                if (tree.isEmpty())
                    return GLib.SOURCE_REMOVE;

                const ws = global.workspace_manager.get_workspace_by_index(wsIndex);
                if (!ws)
                    return GLib.SOURCE_REMOVE;

                const workArea = ws.get_work_area_for_monitor(monIndex);
                const innerGap = this._settings.get_int('inner-gap');
                const outerGap = this._settings.get_int('outer-gap');
                const rects = computeLayout(tree.root, workArea, innerGap, outerGap);

                for (const [metaWindow, rect] of rects) {
                    try {
                        if (metaWindow.minimized || metaWindow.is_fullscreen())
                            continue;
                        const targetRect = {
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            width: Math.max(1, Math.round(rect.width)),
                            height: Math.max(1, Math.round(rect.height)),
                        };
                        snapWindow(metaWindow, targetRect);
                    } catch (_e) {}
                }
            } catch (e) {
                logError(e, 'HyperGnome: deferred layout');
            }
            return GLib.SOURCE_REMOVE;
        });
        this._deferredLayoutSources.add(sourceId);
    }

    /**
     * After a mouse resize grab, compute new splitRatio from the
     * window's post-drag geometry and update the tree.
     *
     * Compares post-drag frame rect to the expected tiled rect to
     * determine which edges moved, then walks up the tree to find
     * the fork that controls each moved edge.
     */
    _handleResizeGrab(metaWindow, tree) {
        const leaf = tree.findLeaf(metaWindow);
        if (!leaf || !leaf.parent)
            return;

        const ws = metaWindow.get_workspace();
        if (!ws)
            return;

        const monIndex = metaWindow.get_monitor();
        const wsIndex = ws.index();
        const workArea = ws.get_work_area_for_monitor(monIndex);
        const innerGap = this._settings.get_int('inner-gap');
        const outerGap = this._settings.get_int('outer-gap');

        // Get the expected tiled rect for this window
        const rects = computeLayout(tree.root, workArea, innerGap, outerGap);
        const expectedRect = rects.get(metaWindow);
        if (!expectedRect)
            return;

        const newFrame = metaWindow.get_frame_rect();
        const THRESHOLD = 5;

        // Determine which edges moved significantly
        const dLeft   = newFrame.x - expectedRect.x;
        const dRight  = (newFrame.x + newFrame.width) - (expectedRect.x + expectedRect.width);
        const dTop    = newFrame.y - expectedRect.y;
        const dBottom = (newFrame.y + newFrame.height) - (expectedRect.y + expectedRect.height);

        let changed = false;

        // Horizontal edge change: find the nearest HORIZONTAL fork
        if (Math.abs(dLeft) > THRESHOLD || Math.abs(dRight) > THRESHOLD) {
            // Pick the edge that moved more
            const useLeft = Math.abs(dLeft) > Math.abs(dRight);
            this._applyEdgeResize(leaf, SplitDirection.HORIZONTAL, useLeft, workArea, innerGap);
            changed = true;
        }

        // Vertical edge change: find the nearest VERTICAL fork
        if (Math.abs(dTop) > THRESHOLD || Math.abs(dBottom) > THRESHOLD) {
            const useTop = Math.abs(dTop) > Math.abs(dBottom);
            this._applyEdgeResize(leaf, SplitDirection.VERTICAL, useTop, workArea, innerGap);
            changed = true;
        }

        if (changed)
            this._applyLayout(wsIndex, monIndex);
        else
            this._queueRelayout(); // No significant change — snap back
    }

    /**
     * Walk up from a leaf to find the fork controlling a specific edge,
     * then compute the new splitRatio from the post-drag window geometry.
     *
     * @param {import('./tree.js').Node} leaf
     * @param {string} splitDir - SplitDirection to match
     * @param {boolean} isStartEdge - true for left/top edge, false for right/bottom
     * @param {{x, y, width, height}} workArea
     * @param {number} innerGap
     */
    _applyEdgeResize(leaf, splitDir, isStartEdge, workArea, innerGap) {
        const halfGap = Math.round(innerGap / 2);
        const metaWindow = leaf.window;
        const newFrame = metaWindow.get_frame_rect();

        // Walk up to find the nearest fork with the matching split direction
        // where the moved edge corresponds to the boundary between childA and childB
        let current = leaf;
        while (current.parent !== null) {
            const fork = current.parent;
            const isChildA = fork.childA === current;

            if (fork.splitDirection === splitDir) {
                // The split boundary is the right/bottom edge of childA
                // (equivalently, the left/top edge of childB).
                // - If window is in childA and right/bottom edge moved → this fork
                // - If window is in childB and left/top edge moved → this fork
                if ((isChildA && !isStartEdge) || (!isChildA && isStartEdge)) {
                    const forkRect = computeNodeRect(fork, workArea);

                    let newRatio;
                    if (splitDir === SplitDirection.HORIZONTAL) {
                        if (isChildA) {
                            const splitX = newFrame.x + newFrame.width + halfGap;
                            newRatio = (splitX - forkRect.x) / forkRect.width;
                        } else {
                            const splitX = newFrame.x - halfGap;
                            newRatio = (splitX - forkRect.x) / forkRect.width;
                        }
                    } else {
                        if (isChildA) {
                            const splitY = newFrame.y + newFrame.height + halfGap;
                            newRatio = (splitY - forkRect.y) / forkRect.height;
                        } else {
                            const splitY = newFrame.y - halfGap;
                            newRatio = (splitY - forkRect.y) / forkRect.height;
                        }
                    }

                    fork.splitRatio = Math.min(0.9, Math.max(0.1, newRatio));
                    return;
                }
            }

            current = fork;
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
            const tree = this._getTree(wsIndex, monIndex);

            let lastInserted = null;

            for (const metaWindow of sorted) {
                if (this._floatingWindows.has(metaWindow))
                    continue;

                if (tree.contains(metaWindow))
                    continue;

                if (isMaximized(metaWindow))
                    unmaximizeWindow(metaWindow);

                // Compute nodeRect from the last inserted window's leaf for
                // proper dwindle split direction (alternating H/V)
                let nodeRect = workArea;
                if (lastInserted && tree.contains(lastInserted)) {
                    const targetLeaf = tree.findLeaf(lastInserted);
                    if (targetLeaf)
                        nodeRect = computeNodeRect(targetLeaf, workArea);
                }

                tree.insert(metaWindow, lastInserted, defaultRatio, nodeRect);
                this._connectWindowSignals(metaWindow);
                lastInserted = metaWindow;
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
     * Build context object for cross-monitor utility functions.
     * @returns {object}
     */
    _monitorCtx() {
        return {
            findTreeContaining: (w) => this._findTreeContaining(w),
            getTree: (ws, mon) => this._getTree(ws, mon),
            applyLayout: (ws, mon) => this._applyLayout(ws, mon),
            setMovingWindow: (w) => { this._movingWindow = w; },
            settings: this._settings,
        };
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

}
