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
