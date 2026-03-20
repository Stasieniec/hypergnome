/**
 * Cross-monitor navigation utilities.
 *
 * Standalone functions for finding adjacent monitors and moving
 * windows/focus between them.  Extracted from TilingManager to
 * keep file sizes manageable.
 */

import {Direction} from './tree.js';
import {computeLayout, computeNodeRect} from './layout.js';

/**
 * Find the adjacent monitor in a direction using geometric comparison.
 * @param {number} fromMonIndex
 * @param {string} direction - 'left'|'right'|'up'|'down'
 * @returns {number} monitor index, or -1 if none found
 */
export function findAdjacentMonitor(fromMonIndex, direction) {
    const nMonitors = global.display.get_n_monitors();
    if (nMonitors <= 1)
        return -1;

    const fromGeo = global.display.get_monitor_geometry(fromMonIndex);
    const fromCenterX = fromGeo.x + fromGeo.width / 2;
    const fromCenterY = fromGeo.y + fromGeo.height / 2;

    let bestMon = -1;
    let bestDist = Infinity;

    for (let i = 0; i < nMonitors; i++) {
        if (i === fromMonIndex)
            continue;

        const geo = global.display.get_monitor_geometry(i);
        const centerX = geo.x + geo.width / 2;
        const centerY = geo.y + geo.height / 2;

        let inDirection = false;
        let dist = Infinity;

        switch (direction) {
        case Direction.LEFT:
            inDirection = centerX < fromCenterX;
            if (inDirection)
                dist = fromGeo.x - (geo.x + geo.width);
            break;
        case Direction.RIGHT:
            inDirection = centerX > fromCenterX;
            if (inDirection)
                dist = geo.x - (fromGeo.x + fromGeo.width);
            break;
        case Direction.UP:
            inDirection = centerY < fromCenterY;
            if (inDirection)
                dist = fromGeo.y - (geo.y + geo.height);
            break;
        case Direction.DOWN:
            inDirection = centerY > fromCenterY;
            if (inDirection)
                dist = geo.y - (fromGeo.y + fromGeo.height);
            break;
        }

        if (inDirection && Math.abs(dist) < bestDist) {
            bestDist = Math.abs(dist);
            bestMon = i;
        }
    }

    return bestMon;
}

/**
 * Move a window to the adjacent monitor in a direction.
 *
 * Removes from the source tree, inserts into the target tree, moves the
 * window via move_resize_frame, and re-layouts both monitors.
 *
 * @param {Meta.Window} metaWindow
 * @param {string} direction
 * @param {object} ctx - TilingManager context
 * @param {Function} ctx.findTreeContaining
 * @param {Function} ctx.getTree
 * @param {Function} ctx.applyLayout
 * @param {Function} ctx.setMovingWindow - guard setter to suppress signal handlers
 * @param {Gio.Settings} ctx.settings
 */
export function moveWindowToMonitor(metaWindow, direction, ctx) {
    const fromMonIndex = metaWindow.get_monitor();
    const targetMon = findAdjacentMonitor(fromMonIndex, direction);
    if (targetMon < 0)
        return;

    const ws = metaWindow.get_workspace();
    if (!ws)
        return;

    const wsIndex = ws.index();

    // Remove from source tree
    const sourceTree = ctx.findTreeContaining(metaWindow);
    if (sourceTree)
        sourceTree.remove(metaWindow);

    // Insert into target tree
    const targetTree = ctx.getTree(wsIndex, targetMon);
    const workArea = ws.get_work_area_for_monitor(targetMon);
    const defaultRatio = ctx.settings.get_double('split-ratio');

    let nodeRect = workArea;
    const lastLeaf = targetTree._findLastLeaf(targetTree.root);
    if (lastLeaf)
        nodeRect = computeNodeRect(lastLeaf, workArea);

    targetTree.insert(metaWindow, null, defaultRatio, nodeRect);

    // Move using move_frame + move_resize_frame — more reliable than
    // move_to_monitor because it forces an immediate coordinate change.
    // user_op=true avoids work area clamping on multi-monitor setups.
    ctx.setMovingWindow(metaWindow);
    const tempX = Math.round(workArea.x + workArea.width / 4);
    const tempY = Math.round(workArea.y + workArea.height / 4);
    const tempW = Math.round(workArea.width / 2);
    const tempH = Math.round(workArea.height / 2);
    metaWindow.move_frame(true, tempX, tempY);
    metaWindow.move_resize_frame(true, tempX, tempY, tempW, tempH);
    ctx.setMovingWindow(null);

    // Re-layout both monitors
    ctx.applyLayout(wsIndex, fromMonIndex);
    ctx.applyLayout(wsIndex, targetMon);
}

/**
 * Focus the nearest window on the adjacent monitor in a direction.
 *
 * Finds the window in the target monitor's tree whose position is closest
 * along the perpendicular axis (so moving right focuses the window at
 * the same height on the next monitor).
 *
 * @param {Meta.Window} fromWindow
 * @param {string} direction
 * @param {object} ctx - TilingManager context
 * @param {Function} ctx.getTree
 * @param {Gio.Settings} ctx.settings
 */
export function focusOnAdjacentMonitor(fromWindow, direction, ctx) {
    const fromMonIndex = fromWindow.get_monitor();
    const targetMon = findAdjacentMonitor(fromMonIndex, direction);
    if (targetMon < 0)
        return;

    const ws = fromWindow.get_workspace();
    if (!ws)
        return;

    const wsIndex = ws.index();
    const targetTree = ctx.getTree(wsIndex, targetMon);
    if (targetTree.isEmpty())
        return;

    const workArea = ws.get_work_area_for_monitor(targetMon);
    const innerGap = ctx.settings.get_int('inner-gap');
    const outerGap = ctx.settings.get_int('outer-gap');
    const targetRects = computeLayout(targetTree.root, workArea, innerGap, outerGap);

    const fromRect = fromWindow.get_frame_rect();
    const fromCenterY = fromRect.y + fromRect.height / 2;
    const fromCenterX = fromRect.x + fromRect.width / 2;

    // Pick the window closest along the perpendicular axis
    let bestWindow = null;
    let bestDist = Infinity;

    for (const [win, rect] of targetRects) {
        const candCenterY = rect.y + rect.height / 2;
        const candCenterX = rect.x + rect.width / 2;

        let dist;
        if (direction === Direction.LEFT || direction === Direction.RIGHT)
            dist = Math.abs(candCenterY - fromCenterY);
        else
            dist = Math.abs(candCenterX - fromCenterX);

        if (dist < bestDist) {
            bestDist = dist;
            bestWindow = win;
        }
    }

    if (bestWindow)
        bestWindow.activate(global.get_current_time());
}
