/**
 * BSP tree data structure for dwindle tiling.
 *
 * The tree is a binary tree where:
 * - FORK nodes have two children and a split direction/ratio
 * - LEAF nodes hold a reference to a Meta.Window
 *
 * Sizing is percentage-based — pixel coordinates are computed at layout time.
 */

export const NodeType = {FORK: 'fork', LEAF: 'leaf'};
export const SplitDirection = {HORIZONTAL: 'horizontal', VERTICAL: 'vertical'};
export const Direction = {LEFT: 'left', RIGHT: 'right', UP: 'up', DOWN: 'down'};

export class Node {
    /**
     * @param {string} type - NodeType.FORK or NodeType.LEAF
     */
    constructor(type) {
        this.type = type;
        this.parent = null;

        // Fork properties
        this.splitDirection = null;
        this.splitRatio = 0.5;
        this.childA = null;
        this.childB = null;

        // Leaf properties
        this.window = null;
    }
}

/**
 * Create a leaf node holding a window.
 * @param {Meta.Window} metaWindow
 * @returns {Node}
 */
export function createLeaf(metaWindow) {
    const node = new Node(NodeType.LEAF);
    node.window = metaWindow;
    return node;
}

/**
 * Create a fork node with two children.
 * @param {string} direction - SplitDirection
 * @param {number} ratio - Split ratio (0.0-1.0)
 * @param {Node} childA - Left/top child
 * @param {Node} childB - Right/bottom child
 * @returns {Node}
 */
export function createFork(direction, ratio, childA, childB) {
    const node = new Node(NodeType.FORK);
    node.splitDirection = direction;
    node.splitRatio = ratio;
    node.childA = childA;
    node.childB = childB;
    childA.parent = node;
    childB.parent = node;
    return node;
}

export class Tree {
    constructor() {
        this.root = null;
        this._windowToLeaf = new Map();
    }

    /**
     * Insert a window into the tree next to the focused window.
     * If the tree is empty, the window becomes the root leaf.
     * Otherwise, the focused window's leaf is replaced with a fork
     * whose children are the original and new leaves.
     *
     * @param {Meta.Window} metaWindow - Window to insert
     * @param {Meta.Window|null} focusedWindow - Window to split next to
     * @param {number} ratio - Split ratio for the new fork
     * @param {{x, y, width, height}} nodeRect - Pixel rect of the target leaf (for aspect ratio)
     */
    insert(metaWindow, focusedWindow, ratio, nodeRect) {
        const newLeaf = createLeaf(metaWindow);
        this._windowToLeaf.set(metaWindow, newLeaf);

        // First window — becomes root
        if (this.root === null) {
            this.root = newLeaf;
            return;
        }

        // Find the leaf to split next to
        let targetLeaf = null;
        if (focusedWindow && this._windowToLeaf.has(focusedWindow))
            targetLeaf = this._windowToLeaf.get(focusedWindow);

        if (!targetLeaf)
            targetLeaf = this._findLastLeaf(this.root);

        if (!targetLeaf) {
            this.root = newLeaf;
            return;
        }

        // Determine split direction from aspect ratio
        const direction = nodeRect.width >= nodeRect.height
            ? SplitDirection.HORIZONTAL
            : SplitDirection.VERTICAL;

        const parentOfTarget = targetLeaf.parent;
        const newFork = createFork(direction, ratio, targetLeaf, newLeaf);

        if (parentOfTarget === null) {
            this.root = newFork;
        } else if (parentOfTarget.childA === targetLeaf) {
            parentOfTarget.childA = newFork;
            newFork.parent = parentOfTarget;
        } else {
            parentOfTarget.childB = newFork;
            newFork.parent = parentOfTarget;
        }
    }

    /**
     * Remove a window from the tree.
     * Compresses the tree by replacing the parent fork with the surviving sibling.
     * @param {Meta.Window} metaWindow
     */
    remove(metaWindow) {
        const leaf = this._windowToLeaf.get(metaWindow);
        if (!leaf)
            return;

        this._windowToLeaf.delete(metaWindow);
        leaf.window = null;

        // Only node in tree
        if (leaf === this.root) {
            this.root = null;
            return;
        }

        const parentFork = leaf.parent;
        const sibling = parentFork.childA === leaf
            ? parentFork.childB
            : parentFork.childA;
        const grandparent = parentFork.parent;

        if (grandparent === null) {
            this.root = sibling;
            sibling.parent = null;
        } else if (grandparent.childA === parentFork) {
            grandparent.childA = sibling;
            sibling.parent = grandparent;
        } else {
            grandparent.childB = sibling;
            sibling.parent = grandparent;
        }

        // Clean up the removed fork
        parentFork.childA = null;
        parentFork.childB = null;
        parentFork.parent = null;
    }

    /**
     * Swap two windows between their leaves.
     * @param {Meta.Window} windowA
     * @param {Meta.Window} windowB
     */
    swap(windowA, windowB) {
        const leafA = this._windowToLeaf.get(windowA);
        const leafB = this._windowToLeaf.get(windowB);
        if (!leafA || !leafB)
            return;

        leafA.window = windowB;
        leafB.window = windowA;
        this._windowToLeaf.set(windowA, leafB);
        this._windowToLeaf.set(windowB, leafA);
    }

    /**
     * @param {Meta.Window} metaWindow
     * @returns {Node|null}
     */
    findLeaf(metaWindow) {
        return this._windowToLeaf.get(metaWindow) ?? null;
    }

    /**
     * @param {Meta.Window} metaWindow
     * @returns {boolean}
     */
    contains(metaWindow) {
        return this._windowToLeaf.has(metaWindow);
    }

    /**
     * @returns {Meta.Window[]}
     */
    getWindows() {
        return Array.from(this._windowToLeaf.keys());
    }

    /**
     * @returns {boolean}
     */
    isEmpty() {
        return this.root === null;
    }

    /**
     * Destroy the tree and release all references.
     */
    destroy() {
        this.root = null;
        this._windowToLeaf.clear();
    }

    /**
     * Find the nearest ancestor fork whose split boundary can move in
     * the given direction.
     *
     * "resize-right" means "move the nearest horizontal boundary rightward."
     * If the window is in childA, increasing the ratio grows childA (window
     * grows). If in childB, increasing the ratio shrinks childB (window
     * shrinks). Either way, the boundary moves right.
     *
     * @param {Meta.Window} metaWindow
     * @param {string} direction - 'left'|'right'|'up'|'down'
     * @returns {{ fork: Node, delta: number } | null}
     *   fork: the fork whose splitRatio should be adjusted
     *   delta: +1 means increase splitRatio, -1 means decrease
     */
    findResizableFork(metaWindow, direction) {
        const leaf = this._windowToLeaf.get(metaWindow);
        if (!leaf)
            return null;

        const isHorizontal = direction === 'left' || direction === 'right';
        const wantDirection = isHorizontal
            ? SplitDirection.HORIZONTAL
            : SplitDirection.VERTICAL;

        let current = leaf;
        while (current.parent !== null) {
            const fork = current.parent;

            if (fork.splitDirection === wantDirection) {
                // "right"/"down" → increase ratio (boundary moves right/down)
                // "left"/"up"   → decrease ratio (boundary moves left/up)
                const delta = (direction === 'right' || direction === 'down')
                    ? +1 : -1;
                return {fork, delta};
            }

            current = fork;
        }

        return null;
    }

    /**
     * Find the rightmost/deepest leaf (for default insertion point).
     * @param {Node} node
     * @returns {Node|null}
     */
    _findLastLeaf(node) {
        if (!node)
            return null;
        if (node.type === NodeType.LEAF)
            return node;
        return this._findLastLeaf(node.childB) || this._findLastLeaf(node.childA);
    }
}
