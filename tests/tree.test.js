import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
    Node, NodeType, SplitDirection, Direction,
    createLeaf, createFork, Tree,
} from '../src/core/tree.js';

// Use plain objects as mock windows — tree.js only stores references
const win = (id) => ({id, toString: () => `win-${id}`});

const WIDE_RECT = {x: 0, y: 0, width: 1920, height: 1080};
const TALL_RECT = {x: 0, y: 0, width: 500, height: 1080};
const SQUARE_RECT = {x: 0, y: 0, width: 1000, height: 1000};

// ==========================================================================
// Node / createLeaf / createFork
// ==========================================================================

describe('Node', () => {
    it('creates a node with correct type', () => {
        const leaf = new Node(NodeType.LEAF);
        assert.equal(leaf.type, NodeType.LEAF);
        assert.equal(leaf.parent, null);
        assert.equal(leaf.window, null);

        const fork = new Node(NodeType.FORK);
        assert.equal(fork.type, NodeType.FORK);
        assert.equal(fork.childA, null);
        assert.equal(fork.childB, null);
    });
});

describe('createLeaf', () => {
    it('creates a leaf holding a window', () => {
        const w = win(1);
        const leaf = createLeaf(w);
        assert.equal(leaf.type, NodeType.LEAF);
        assert.equal(leaf.window, w);
        assert.equal(leaf.parent, null);
    });
});

describe('createFork', () => {
    it('creates a fork with children and sets parent refs', () => {
        const a = createLeaf(win(1));
        const b = createLeaf(win(2));
        const fork = createFork(SplitDirection.HORIZONTAL, 0.5, a, b);

        assert.equal(fork.type, NodeType.FORK);
        assert.equal(fork.splitDirection, SplitDirection.HORIZONTAL);
        assert.equal(fork.splitRatio, 0.5);
        assert.equal(fork.childA, a);
        assert.equal(fork.childB, b);
        assert.equal(a.parent, fork);
        assert.equal(b.parent, fork);
    });
});

// ==========================================================================
// Tree — insertion
// ==========================================================================

describe('Tree.insert', () => {
    it('first window becomes root leaf', () => {
        const tree = new Tree();
        const w = win(1);
        tree.insert(w, null, 0.5, WIDE_RECT);

        assert.equal(tree.root.type, NodeType.LEAF);
        assert.equal(tree.root.window, w);
        assert.equal(tree.isEmpty(), false);
        assert.deepEqual(tree.getWindows(), [w]);
    });

    it('second window creates a fork at root', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        assert.equal(tree.root.type, NodeType.FORK);
        assert.equal(tree.root.childA.window, w1);
        assert.equal(tree.root.childB.window, w2);
        assert.equal(tree.getWindows().length, 2);
    });

    it('uses horizontal split for wide rects', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        assert.equal(tree.root.splitDirection, SplitDirection.HORIZONTAL);
    });

    it('uses vertical split for tall rects', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, TALL_RECT);
        tree.insert(w2, w1, 0.5, TALL_RECT);

        assert.equal(tree.root.splitDirection, SplitDirection.VERTICAL);
    });

    it('third window creates nested fork (dwindle pattern)', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.insert(w3, w2, 0.5, WIDE_RECT);

        // Root is a fork, w1 is left child
        assert.equal(tree.root.type, NodeType.FORK);
        assert.equal(tree.root.childA.window, w1);
        // Right child is another fork containing w2 and w3
        const innerFork = tree.root.childB;
        assert.equal(innerFork.type, NodeType.FORK);
        assert.equal(innerFork.childA.window, w2);
        assert.equal(innerFork.childB.window, w3);
        assert.equal(tree.getWindows().length, 3);
    });

    it('inserts next to last leaf when focused window is null', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, null, 0.5, WIDE_RECT);

        assert.equal(tree.root.type, NodeType.FORK);
        assert.equal(tree.getWindows().length, 2);
    });

    it('respects custom split ratio', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.7, WIDE_RECT);
        tree.insert(w2, w1, 0.7, WIDE_RECT);

        assert.equal(tree.root.splitRatio, 0.7);
    });
});

// ==========================================================================
// Tree — removal
// ==========================================================================

describe('Tree.remove', () => {
    it('removes the only window, leaving empty tree', () => {
        const tree = new Tree();
        const w = win(1);
        tree.insert(w, null, 0.5, WIDE_RECT);
        tree.remove(w);

        assert.equal(tree.root, null);
        assert.equal(tree.isEmpty(), true);
        assert.equal(tree.contains(w), false);
    });

    it('removes one of two windows, promotes sibling to root', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.remove(w1);

        assert.equal(tree.root.type, NodeType.LEAF);
        assert.equal(tree.root.window, w2);
        assert.equal(tree.root.parent, null);
        assert.equal(tree.contains(w1), false);
    });

    it('removes from three windows, compresses tree correctly', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.insert(w3, w2, 0.5, WIDE_RECT);

        // Remove w3 — inner fork collapses, w2 promoted
        tree.remove(w3);
        assert.equal(tree.root.type, NodeType.FORK);
        assert.equal(tree.root.childA.window, w1);
        assert.equal(tree.root.childB.window, w2);
        assert.equal(tree.getWindows().length, 2);
    });

    it('removing w1 from three windows compresses correctly', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.insert(w3, w2, 0.5, WIDE_RECT);

        // Remove w1 — root fork collapses, inner fork becomes root
        tree.remove(w1);
        assert.equal(tree.root.type, NodeType.FORK);
        assert.equal(tree.root.childA.window, w2);
        assert.equal(tree.root.childB.window, w3);
        assert.equal(tree.root.parent, null);
    });

    it('ignores removing a window not in the tree', () => {
        const tree = new Tree();
        const w1 = win(1);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.remove(win(99)); // should not throw
        assert.equal(tree.root.window, w1);
    });
});

// ==========================================================================
// Tree — swap
// ==========================================================================

describe('Tree.swap', () => {
    it('swaps two windows between their leaves', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        tree.swap(w1, w2);

        assert.equal(tree.root.childA.window, w2);
        assert.equal(tree.root.childB.window, w1);
        // findLeaf should reflect the swap
        assert.equal(tree.findLeaf(w1), tree.root.childB);
        assert.equal(tree.findLeaf(w2), tree.root.childA);
    });

    it('ignores swap if either window is not in tree', () => {
        const tree = new Tree();
        const w1 = win(1);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.swap(w1, win(99)); // should not throw
        assert.equal(tree.root.window, w1);
    });
});

// ==========================================================================
// Tree — findLeaf / contains / getWindows / isEmpty
// ==========================================================================

describe('Tree queries', () => {
    it('findLeaf returns the leaf for a window', () => {
        const tree = new Tree();
        const w = win(1);
        tree.insert(w, null, 0.5, WIDE_RECT);
        const leaf = tree.findLeaf(w);
        assert.equal(leaf.window, w);
    });

    it('findLeaf returns null for unknown window', () => {
        const tree = new Tree();
        assert.equal(tree.findLeaf(win(1)), null);
    });

    it('contains returns correct values', () => {
        const tree = new Tree();
        const w = win(1);
        assert.equal(tree.contains(w), false);
        tree.insert(w, null, 0.5, WIDE_RECT);
        assert.equal(tree.contains(w), true);
    });

    it('getWindows returns all windows', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.insert(w3, w2, 0.5, WIDE_RECT);

        const windows = tree.getWindows();
        assert.equal(windows.length, 3);
        assert.ok(windows.includes(w1));
        assert.ok(windows.includes(w2));
        assert.ok(windows.includes(w3));
    });

    it('isEmpty reflects tree state', () => {
        const tree = new Tree();
        assert.equal(tree.isEmpty(), true);
        const w = win(1);
        tree.insert(w, null, 0.5, WIDE_RECT);
        assert.equal(tree.isEmpty(), false);
        tree.remove(w);
        assert.equal(tree.isEmpty(), true);
    });
});

// ==========================================================================
// Tree — destroy
// ==========================================================================

describe('Tree.destroy', () => {
    it('clears all state', () => {
        const tree = new Tree();
        tree.insert(win(1), null, 0.5, WIDE_RECT);
        tree.insert(win(2), null, 0.5, WIDE_RECT);
        tree.destroy();

        assert.equal(tree.root, null);
        assert.equal(tree.isEmpty(), true);
        assert.equal(tree.getWindows().length, 0);
    });
});

// ==========================================================================
// Tree — findResizableFork
// ==========================================================================

describe('Tree.findResizableFork', () => {
    it('returns null for single window', () => {
        const tree = new Tree();
        const w = win(1);
        tree.insert(w, null, 0.5, WIDE_RECT);

        assert.equal(tree.findResizableFork(w, 'left'), null);
        assert.equal(tree.findResizableFork(w, 'right'), null);
    });

    it('finds horizontal fork for left/right resize', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT); // horizontal split
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        const result = tree.findResizableFork(w1, 'right');
        assert.notEqual(result, null);
        assert.equal(result.fork, tree.root);
        assert.equal(result.delta, +1);

        const resultLeft = tree.findResizableFork(w1, 'left');
        assert.notEqual(resultLeft, null);
        assert.equal(resultLeft.delta, -1);
    });

    it('finds vertical fork for up/down resize', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, TALL_RECT); // vertical split
        tree.insert(w2, w1, 0.5, TALL_RECT);

        const result = tree.findResizableFork(w1, 'down');
        assert.notEqual(result, null);
        assert.equal(result.fork.splitDirection, SplitDirection.VERTICAL);
        assert.equal(result.delta, +1);

        const resultUp = tree.findResizableFork(w1, 'up');
        assert.equal(resultUp.delta, -1);
    });

    it('returns null when no matching axis fork exists', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT); // horizontal only
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        // No vertical fork exists, so up/down should return null
        assert.equal(tree.findResizableFork(w1, 'up'), null);
        assert.equal(tree.findResizableFork(w1, 'down'), null);
    });

    it('walks up past wrong-axis forks to find the right one', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        // First split: horizontal (wide rect)
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        // Second split: vertical (the right half is now tall)
        tree.insert(w3, w2, 0.5, TALL_RECT);

        // w3 is inside a vertical fork under a horizontal fork
        // Asking for left/right should skip the vertical fork and find the root horizontal fork
        const result = tree.findResizableFork(w3, 'right');
        assert.notEqual(result, null);
        assert.equal(result.fork.splitDirection, SplitDirection.HORIZONTAL);
    });

    it('returns null for unknown window', () => {
        const tree = new Tree();
        assert.equal(tree.findResizableFork(win(99), 'left'), null);
    });
});

// ==========================================================================
// Tree — many windows stress test
// ==========================================================================

describe('Tree stress', () => {
    it('handles inserting and removing 20 windows', () => {
        const tree = new Tree();
        const windows = [];
        for (let i = 0; i < 20; i++) {
            const w = win(i);
            windows.push(w);
            const focusWin = i > 0 ? windows[i - 1] : null;
            const rect = i % 2 === 0 ? WIDE_RECT : TALL_RECT;
            tree.insert(w, focusWin, 0.5, rect);
        }

        assert.equal(tree.getWindows().length, 20);

        // Remove every other window
        for (let i = 0; i < 20; i += 2)
            tree.remove(windows[i]);

        assert.equal(tree.getWindows().length, 10);

        // Remove remaining
        for (let i = 1; i < 20; i += 2)
            tree.remove(windows[i]);

        assert.equal(tree.isEmpty(), true);
    });
});
