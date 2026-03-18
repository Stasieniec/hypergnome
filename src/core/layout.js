/**
 * Dwindle layout engine.
 *
 * Takes a BSP tree and a work area, computes pixel rectangles for every leaf.
 * All gap logic lives here — the tree itself stores only ratios.
 */

import {NodeType, SplitDirection, Direction} from './tree.js';

/**
 * Compute pixel rectangles for all leaf nodes.
 * @param {import('./tree.js').Node} root
 * @param {{x: number, y: number, width: number, height: number}} workArea
 * @param {number} innerGap - Gap between windows (pixels)
 * @param {number} outerGap - Gap between windows and screen edges (pixels)
 * @returns {Map<Meta.Window, {x: number, y: number, width: number, height: number}>}
 */
export function computeLayout(root, workArea, innerGap, outerGap) {
    const result = new Map();
    if (!root)
        return result;

    const paddedArea = {
        x: workArea.x + outerGap,
        y: workArea.y + outerGap,
        width: workArea.width - 2 * outerGap,
        height: workArea.height - 2 * outerGap,
    };

    _traverse(root, paddedArea, innerGap, result);
    return result;
}

/**
 * Recursive traversal that splits areas and collects leaf rects.
 * @param {import('./tree.js').Node} node
 * @param {{x: number, y: number, width: number, height: number}} area
 * @param {number} innerGap
 * @param {Map} result
 */
function _traverse(node, area, innerGap, result) {
    if (node.type === NodeType.LEAF) {
        if (node.window)
            result.set(node.window, {x: area.x, y: area.y, width: area.width, height: area.height});
        return;
    }

    const halfGap = Math.round(innerGap / 2);

    if (node.splitDirection === SplitDirection.HORIZONTAL) {
        const splitX = Math.round(area.x + area.width * node.splitRatio);
        const areaA = {
            x: area.x,
            y: area.y,
            width: splitX - area.x - halfGap,
            height: area.height,
        };
        const areaB = {
            x: splitX + halfGap,
            y: area.y,
            width: area.x + area.width - splitX - halfGap,
            height: area.height,
        };
        _traverse(node.childA, areaA, innerGap, result);
        _traverse(node.childB, areaB, innerGap, result);
    } else {
        const splitY = Math.round(area.y + area.height * node.splitRatio);
        const areaA = {
            x: area.x,
            y: area.y,
            width: area.width,
            height: splitY - area.y - halfGap,
        };
        const areaB = {
            x: area.x,
            y: splitY + halfGap,
            width: area.width,
            height: area.y + area.height - splitY - halfGap,
        };
        _traverse(node.childA, areaA, innerGap, result);
        _traverse(node.childB, areaB, innerGap, result);
    }
}

/**
 * Compute the pixel rect for a specific node by walking from root.
 * Used to determine split direction when inserting (aspect ratio check).
 * @param {import('./tree.js').Node} targetNode
 * @param {{x: number, y: number, width: number, height: number}} workArea
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function computeNodeRect(targetNode, workArea) {
    // Build path from root to target
    const path = [];
    let current = targetNode;
    while (current !== null) {
        path.unshift(current);
        current = current.parent;
    }

    let area = {x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height};

    for (let i = 0; i < path.length - 1; i++) {
        const fork = path[i];
        const child = path[i + 1];

        if (fork.type !== NodeType.FORK)
            break;

        if (fork.splitDirection === SplitDirection.HORIZONTAL) {
            const splitX = Math.round(area.x + area.width * fork.splitRatio);
            if (fork.childA === child)
                area = {x: area.x, y: area.y, width: splitX - area.x, height: area.height};
            else
                area = {x: splitX, y: area.y, width: area.x + area.width - splitX, height: area.height};
        } else {
            const splitY = Math.round(area.y + area.height * fork.splitRatio);
            if (fork.childA === child)
                area = {x: area.x, y: area.y, width: area.width, height: splitY - area.y};
            else
                area = {x: area.x, y: splitY, width: area.width, height: area.y + area.height - splitY};
        }
    }

    return area;
}

/**
 * Find the nearest window in a direction from a given window.
 * Uses geometric search: among windows whose center is in the correct direction,
 * pick the one closest to the source window's edge with perpendicular overlap.
 *
 * @param {Map<Meta.Window, {x, y, width, height}>} layoutRects
 * @param {Meta.Window} fromWindow
 * @param {string} direction - Direction.LEFT/RIGHT/UP/DOWN
 * @returns {Meta.Window|null}
 */
export function findNeighborInDirection(layoutRects, fromWindow, direction) {
    const fromRect = layoutRects.get(fromWindow);
    if (!fromRect)
        return null;

    const fromCenterX = fromRect.x + fromRect.width / 2;
    const fromCenterY = fromRect.y + fromRect.height / 2;

    let bestWindow = null;
    let bestDistance = Infinity;

    for (const [win, rect] of layoutRects) {
        if (win === fromWindow)
            continue;

        const candCenterX = rect.x + rect.width / 2;
        const candCenterY = rect.y + rect.height / 2;

        // Check candidate is in the correct direction
        let inDirection = false;
        let distance = Infinity;

        switch (direction) {
        case Direction.LEFT:
            inDirection = candCenterX < fromCenterX;
            if (inDirection)
                distance = fromRect.x - (rect.x + rect.width);
            break;
        case Direction.RIGHT:
            inDirection = candCenterX > fromCenterX;
            if (inDirection)
                distance = rect.x - (fromRect.x + fromRect.width);
            break;
        case Direction.UP:
            inDirection = candCenterY < fromCenterY;
            if (inDirection)
                distance = fromRect.y - (rect.y + rect.height);
            break;
        case Direction.DOWN:
            inDirection = candCenterY > fromCenterY;
            if (inDirection)
                distance = rect.y - (fromRect.y + fromRect.height);
            break;
        }

        if (!inDirection)
            continue;

        // Prefer windows with perpendicular overlap (directly adjacent)
        let hasOverlap = false;
        if (direction === Direction.LEFT || direction === Direction.RIGHT) {
            hasOverlap = rect.y < fromRect.y + fromRect.height &&
                         rect.y + rect.height > fromRect.y;
        } else {
            hasOverlap = rect.x < fromRect.x + fromRect.width &&
                         rect.x + rect.width > fromRect.x;
        }

        // Overlapping windows get priority (lower effective distance)
        const effectiveDistance = hasOverlap ? Math.abs(distance) : Math.abs(distance) + 10000;

        if (effectiveDistance < bestDistance) {
            bestDistance = effectiveDistance;
            bestWindow = win;
        }
    }

    return bestWindow;
}
