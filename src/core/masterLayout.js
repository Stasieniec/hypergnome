/**
 * Master layout — operations over the existing BSP Tree that maintain
 * a canonical "master + stack chain" shape.
 *
 * Tree shape for N windows in master mode:
 *
 *      root: H-FORK or V-FORK (splitRatio depends on orientation)
 *      /                                       \
 *   master_leaf                          stack_subtree
 *
 * Stack subtree is a right-leaning chain of forks; window order top-to-bottom
 * (or left-to-right for TOP/BOTTOM orientation) is the in-order traversal
 * starting from the stack side.
 *
 * All functions are pure operations on Tree — no GNOME imports.
 */

import {NodeType, SplitDirection, createLeaf, createFork} from './tree.js';

export const Orientation = {
    LEFT: 'left',
    RIGHT: 'right',
    TOP: 'top',
    BOTTOM: 'bottom',
};

const ORIENTATION_CYCLE = [
    Orientation.LEFT,
    Orientation.RIGHT,
    Orientation.TOP,
    Orientation.BOTTOM,
];

/**
 * Return the next orientation in the cycle.
 * @param {string} current
 * @returns {string}
 */
export function nextOrientation(current) {
    const idx = ORIENTATION_CYCLE.indexOf(current);
    if (idx === -1)
        return Orientation.LEFT;
    return ORIENTATION_CYCLE[(idx + 1) % ORIENTATION_CYCLE.length];
}

/**
 * Return whether the master is in childA (true) or childB (false)
 * for the given orientation.
 * @param {string} orientation
 * @returns {boolean}
 */
function _masterIsChildA(orientation) {
    return orientation === Orientation.LEFT || orientation === Orientation.TOP;
}

/**
 * Return the SplitDirection used by the root fork for the given orientation.
 * @param {string} orientation
 * @returns {string}
 */
function _rootSplitDirection(orientation) {
    return (orientation === Orientation.LEFT || orientation === Orientation.RIGHT)
        ? SplitDirection.HORIZONTAL
        : SplitDirection.VERTICAL;
}

/**
 * Return the SplitDirection used by stack chain forks for the given orientation.
 * @param {string} orientation
 * @returns {string}
 */
function _stackSplitDirection(orientation) {
    return (orientation === Orientation.LEFT || orientation === Orientation.RIGHT)
        ? SplitDirection.VERTICAL
        : SplitDirection.HORIZONTAL;
}

/**
 * Convert a user-facing master fraction (always "fraction of work area
 * occupied by master") into the underlying root fork splitRatio.
 * @param {number} mfact
 * @param {string} orientation
 * @returns {number}
 */
function _rootRatioFor(mfact, orientation) {
    return _masterIsChildA(orientation) ? mfact : 1 - mfact;
}

/**
 * Return the master leaf, or null if tree is empty.
 * For a single-leaf tree (one window total), the lone leaf IS the master.
 * @param {import('./tree.js').Tree} tree
 * @param {string} orientation
 * @returns {import('./tree.js').Node|null}
 */
export function getMasterLeaf(tree, orientation) {
    if (!tree.root)
        return null;
    if (tree.root.type === NodeType.LEAF)
        return tree.root;
    return _masterIsChildA(orientation) ? tree.root.childA : tree.root.childB;
}

/**
 * Return the master window, or null if tree is empty.
 * @param {import('./tree.js').Tree} tree
 * @param {string} orientation
 * @returns {object|null}
 */
export function getMaster(tree, orientation) {
    const leaf = getMasterLeaf(tree, orientation);
    return leaf ? leaf.window : null;
}

/**
 * Insert a window per master semantics.
 *   - Empty tree: becomes root leaf (the lone window IS the master).
 *   - Single-leaf tree: existing window stays as master, new window becomes
 *     stack[0]. Root becomes a fork.
 *   - Otherwise: append new window at the bottom of the stack chain and
 *     rebalance (handled in a later task).
 *
 * @param {import('./tree.js').Tree} tree
 * @param {object} metaWindow
 * @param {string} orientation
 * @param {number} mfact - master area fraction (0.1 – 0.9)
 */
export function insertMaster(tree, metaWindow, orientation, mfact) {
    if (tree.contains(metaWindow))
        return;
    const newLeaf = createLeaf(metaWindow);
    tree._windowToLeaf.set(metaWindow, newLeaf);

    // Empty tree → new leaf becomes root
    if (tree.root === null) {
        tree.root = newLeaf;
        return;
    }

    // Single-leaf tree → existing window keeps master role, new window is stack
    if (tree.root.type === NodeType.LEAF) {
        const masterLeaf = tree.root;
        const splitDir = _rootSplitDirection(orientation);
        const ratio = _rootRatioFor(mfact, orientation);

        const [childA, childB] = _masterIsChildA(orientation)
            ? [masterLeaf, newLeaf]
            : [newLeaf, masterLeaf];

        tree.root = createFork(splitDir, ratio, childA, childB);
        return;
    }

    // N >= 2: append to bottom of stack chain (implemented in next task)
    _appendToStackBottom(tree, newLeaf, orientation);
    _rebalanceStackInTree(tree, orientation);
}

/**
 * Return the root child that holds the stack subtree (or single stack leaf).
 * Caller must check that tree.root is a fork.
 */
function _stackChildOfRoot(tree, orientation) {
    return _masterIsChildA(orientation) ? tree.root.childB : tree.root.childA;
}

/**
 * Walk a stack chain top-down, returning an array of every leaf in stack order.
 * The chain shape is right-leaning: each non-terminal fork has its top-of-stack
 * leaf as childA and the rest of the chain as childB.
 */
function _stackLeavesInOrder(stackRoot) {
    const leaves = [];
    let current = stackRoot;
    while (current && current.type === NodeType.FORK) {
        leaves.push(current.childA);
        current = current.childB;
    }
    if (current && current.type === NodeType.LEAF)
        leaves.push(current);
    return leaves;
}

/**
 * Append a new leaf at the bottom of the stack chain.
 *
 *   Before (stack has 2):       After append s2:
 *   FORK(0.5, s0, s1)           FORK(_, s0, FORK(0.5, s1, s2))
 *
 * Ratios are corrected by _rebalanceStackInTree afterwards.
 */
function _appendToStackBottom(tree, newLeaf, orientation) {
    const stackDir = _stackSplitDirection(orientation);
    const stackChild = _stackChildOfRoot(tree, orientation);

    if (stackChild.type === NodeType.LEAF) {
        // Stack had exactly one window — wrap into a fork
        const fork = createFork(stackDir, 0.5, stackChild, newLeaf);
        if (_masterIsChildA(orientation)) {
            tree.root.childB = fork;
        } else {
            tree.root.childA = fork;
        }
        fork.parent = tree.root;
        return;
    }

    // Walk to the deepest fork (the one whose childB is a leaf)
    let current = stackChild;
    while (current.childB.type === NodeType.FORK)
        current = current.childB;

    const lastLeaf = current.childB;
    const fork = createFork(stackDir, 0.5, lastLeaf, newLeaf);
    current.childB = fork;
    fork.parent = current;
}

/**
 * Walk the stack chain and set each fork's splitRatio to 1/(K-d),
 * where K is the total number of stack windows and d is the fork's
 * depth from the top of the stack (0-indexed).
 *
 * Examples:
 *   K=2 → ratios: 1/2
 *   K=3 → ratios: 1/3, 1/2
 *   K=4 → ratios: 1/4, 1/3, 1/2
 */
function _rebalanceStackInTree(tree, orientation) {
    if (!tree.root || tree.root.type === NodeType.LEAF)
        return;
    const stackChild = _stackChildOfRoot(tree, orientation);
    if (!stackChild || stackChild.type === NodeType.LEAF)
        return;

    const leaves = _stackLeavesInOrder(stackChild);
    const K = leaves.length;

    let current = stackChild;
    let d = 0;
    while (current && current.type === NodeType.FORK) {
        current.splitRatio = 1 / (K - d);
        d += 1;
        current = current.childB;
    }
}

/**
 * Public wrapper for _rebalanceStackInTree (exported for use after
 * removeMaster compresses the chain).
 */
export function rebalanceStack(tree, orientation) {
    _rebalanceStackInTree(tree, orientation);
}

/**
 * Swap the focused window with the master via window-pointer swap.
 * No-op if focused is already master, or not in the tree.
 * @param {import('./tree.js').Tree} tree
 * @param {object} focusedWindow
 * @param {string} orientation
 */
export function swapWithMaster(tree, focusedWindow, orientation) {
    if (!tree.contains(focusedWindow))
        return;
    const masterLeaf = getMasterLeaf(tree, orientation);
    if (!masterLeaf || masterLeaf.window === focusedWindow)
        return;
    tree.swap(masterLeaf.window, focusedWindow);
}

/**
 * Rebuild the tree from a flat ordered list of windows.
 * windows[0] becomes master; windows[1..] form the stack in order.
 * Used on layout mode / orientation change.
 *
 * @param {import('./tree.js').Tree} tree
 * @param {Array} windows
 * @param {string} orientation
 * @param {number} mfact
 */
export function rebuildShape(tree, windows, orientation, mfact) {
    tree.destroy();
    for (const w of windows)
        insertMaster(tree, w, orientation, mfact);
}

/**
 * Remove a window per master semantics.
 *
 * Cases:
 *   1. Window not in tree → no-op.
 *   2. Window is the lone leaf → tree.remove (empties tree).
 *   3. Window is the master and stack is non-empty → promote topmost stack
 *      window into the master leaf via window-pointer swap, then tree.remove
 *      the leaf that now holds the original master window. The remove will
 *      collapse the parent stack fork into its surviving sibling.
 *   4. Window is in the stack → tree.remove collapses the parent fork.
 *
 * After cases 3 and 4, rebalance the stack chain.
 *
 * @param {import('./tree.js').Tree} tree
 * @param {object} metaWindow
 * @param {string} orientation
 */
export function removeMaster(tree, metaWindow, orientation) {
    if (!tree.contains(metaWindow))
        return;

    // Case 2: lone leaf
    if (tree.root && tree.root.type === NodeType.LEAF) {
        tree.remove(metaWindow);
        return;
    }

    const masterLeaf = getMasterLeaf(tree, orientation);
    const isMaster = masterLeaf && masterLeaf.window === metaWindow;

    if (isMaster) {
        // Case 3: promote topmost stack window into master slot
        const stackChild = _stackChildOfRoot(tree, orientation);
        const topStackLeaf = stackChild.type === NodeType.LEAF
            ? stackChild
            : stackChild.childA;

        // Promote topmost stack window into the master slot
        tree.swap(metaWindow, topStackLeaf.window);

        // Now remove the leaf that holds the original master window
        tree.remove(metaWindow);
    } else {
        // Case 4: stack window
        tree.remove(metaWindow);
    }

    _rebalanceStackInTree(tree, orientation);
}
