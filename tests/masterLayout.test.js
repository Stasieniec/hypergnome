import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {Tree} from '../src/core/tree.js';
import {
    Orientation, nextOrientation, getMaster, getMasterLeaf,
    insertMaster, rebalanceStack, removeMaster,
    swapWithMaster, rebuildShape,
} from '../src/core/masterLayout.js';

const win = (id) => ({id, toString: () => `win-${id}`});

describe('nextOrientation', () => {
    it('cycles left → right → top → bottom → left', () => {
        assert.equal(nextOrientation(Orientation.LEFT), Orientation.RIGHT);
        assert.equal(nextOrientation(Orientation.RIGHT), Orientation.TOP);
        assert.equal(nextOrientation(Orientation.TOP), Orientation.BOTTOM);
        assert.equal(nextOrientation(Orientation.BOTTOM), Orientation.LEFT);
    });

    it('returns LEFT for unknown input', () => {
        assert.equal(nextOrientation('garbage'), Orientation.LEFT);
    });
});

describe('getMaster', () => {
    it('returns null for empty tree', () => {
        const tree = new Tree();
        assert.equal(getMaster(tree, Orientation.LEFT), null);
        assert.equal(getMasterLeaf(tree, Orientation.LEFT), null);
    });
});

describe('insertMaster — first window', () => {
    it('first window becomes a root leaf', () => {
        const tree = new Tree();
        const w = win(1);
        insertMaster(tree, w, Orientation.LEFT, 0.55);

        assert.equal(tree.root.type, 'leaf');
        assert.equal(tree.root.window, w);
        assert.equal(getMaster(tree, Orientation.LEFT), w);
    });
});

describe('insertMaster — idempotency', () => {
    it('inserting the same window twice is a no-op on the second call', () => {
        const tree = new Tree();
        const w = win('dup');
        insertMaster(tree, w, Orientation.LEFT, 0.55);
        const rootBefore = tree.root;
        insertMaster(tree, w, Orientation.LEFT, 0.55);

        assert.equal(tree.root, rootBefore);
        assert.equal(tree.getWindows().length, 1);
    });
});

describe('insertMaster — second window (each orientation)', () => {
    for (const [orient, splitDir, expectChildA, expectRatio] of [
        [Orientation.LEFT,   'horizontal', true,  0.55],
        [Orientation.RIGHT,  'horizontal', false, 0.45],
        [Orientation.TOP,    'vertical',   true,  0.55],
        [Orientation.BOTTOM, 'vertical',   false, 0.45],
    ]) {
        it(`orientation=${orient}: master stays put, new window becomes stack[0]`, () => {
            const tree = new Tree();
            const wm = win('master');
            const ws = win('stack0');
            insertMaster(tree, wm, orient, 0.55);
            insertMaster(tree, ws, orient, 0.55);

            assert.equal(tree.root.type, 'fork');
            assert.equal(tree.root.splitDirection, splitDir);
            assert.ok(Math.abs(tree.root.splitRatio - expectRatio) < 1e-9);

            const masterChild = expectChildA ? tree.root.childA : tree.root.childB;
            const stackChild  = expectChildA ? tree.root.childB : tree.root.childA;
            assert.equal(masterChild.type, 'leaf');
            assert.equal(masterChild.window, wm);
            assert.equal(stackChild.type, 'leaf');
            assert.equal(stackChild.window, ws);

            assert.equal(getMaster(tree, orient), wm);
        });
    }
});

describe('insertMaster — third+ windows (stack chain)', () => {
    it('orientation=left: builds right-leaning V-fork chain with even ratios', () => {
        const tree = new Tree();
        const [wm, s0, s1, s2] = [win('m'), win('s0'), win('s1'), win('s2')];
        for (const w of [wm, s0, s1, s2])
            insertMaster(tree, w, Orientation.LEFT, 0.55);

        // root: H-FORK(master, stack_subtree)
        assert.equal(tree.root.type, 'fork');
        assert.equal(tree.root.splitDirection, 'horizontal');
        assert.equal(tree.root.childA.window, wm);

        // stack_subtree = V-FORK(1/3, s0_leaf, V-FORK(1/2, s1_leaf, s2_leaf))
        const stack = tree.root.childB;
        assert.equal(stack.type, 'fork');
        assert.equal(stack.splitDirection, 'vertical');
        assert.ok(Math.abs(stack.splitRatio - 1 / 3) < 1e-9);
        assert.equal(stack.childA.window, s0);

        const inner = stack.childB;
        assert.equal(inner.type, 'fork');
        assert.equal(inner.splitDirection, 'vertical');
        assert.ok(Math.abs(inner.splitRatio - 1 / 2) < 1e-9);
        assert.equal(inner.childA.window, s1);
        assert.equal(inner.childB.window, s2);
    });

    it('orientation=right: master in childB, stack chain still right-leaning', () => {
        const tree = new Tree();
        const [wm, s0, s1] = [win('m'), win('s0'), win('s1')];
        for (const w of [wm, s0, s1])
            insertMaster(tree, w, Orientation.RIGHT, 0.55);

        assert.equal(tree.root.childB.window, wm);
        const stack = tree.root.childA;
        assert.equal(stack.type, 'fork');
        assert.ok(Math.abs(stack.splitRatio - 1 / 2) < 1e-9);
        assert.equal(stack.childA.window, s0);
        assert.equal(stack.childB.window, s1);
    });

    it('orientation=top: stack forks are HORIZONTAL', () => {
        const tree = new Tree();
        const [wm, s0, s1] = [win('m'), win('s0'), win('s1')];
        for (const w of [wm, s0, s1])
            insertMaster(tree, w, Orientation.TOP, 0.55);

        assert.equal(tree.root.splitDirection, 'vertical');
        assert.equal(tree.root.childA.window, wm);
        const stack = tree.root.childB;
        assert.equal(stack.splitDirection, 'horizontal');
    });

    it('5 windows: stack ratios are 1/4, 1/3, 1/2', () => {
        const tree = new Tree();
        const wins = [win('m'), win(0), win(1), win(2), win(3)];
        for (const w of wins)
            insertMaster(tree, w, Orientation.LEFT, 0.55);

        const stack = tree.root.childB;
        assert.ok(Math.abs(stack.splitRatio - 1 / 4) < 1e-9);
        assert.ok(Math.abs(stack.childB.splitRatio - 1 / 3) < 1e-9);
        assert.ok(Math.abs(stack.childB.childB.splitRatio - 1 / 2) < 1e-9);
    });

    it('orientation=bottom: master in childB, stack chain HORIZONTAL', () => {
        const tree = new Tree();
        const [wm, s0, s1] = [win('m'), win('s0'), win('s1')];
        for (const w of [wm, s0, s1])
            insertMaster(tree, w, Orientation.BOTTOM, 0.55);

        assert.equal(tree.root.splitDirection, 'vertical');
        assert.equal(tree.root.childB.window, wm);
        const stack = tree.root.childA;
        assert.equal(stack.splitDirection, 'horizontal');
        assert.ok(Math.abs(stack.splitRatio - 1 / 2) < 1e-9);
        assert.equal(stack.childA.window, s0);
        assert.equal(stack.childB.window, s1);
    });
});

describe('rebalanceStack', () => {
    it('resets stack fork ratios to 1/(K-d)', () => {
        const tree = new Tree();
        const wins = [win('m'), win('s0'), win('s1'), win('s2')];
        for (const w of wins)
            insertMaster(tree, w, Orientation.LEFT, 0.55);

        // Corrupt the ratios deliberately
        tree.root.childB.splitRatio = 0.9;
        tree.root.childB.childB.splitRatio = 0.9;

        rebalanceStack(tree, Orientation.LEFT);

        assert.ok(Math.abs(tree.root.childB.splitRatio - 1 / 3) < 1e-9);
        assert.ok(Math.abs(tree.root.childB.childB.splitRatio - 1 / 2) < 1e-9);
    });
});

describe('removeMaster', () => {
    it('removing the only window empties the tree', () => {
        const tree = new Tree();
        const w = win(1);
        insertMaster(tree, w, Orientation.LEFT, 0.55);
        removeMaster(tree, w, Orientation.LEFT);

        assert.equal(tree.root, null);
        assert.equal(tree.getWindows().length, 0);
    });

    it('removing master when stack has 1 promotes stack[0] to root leaf', () => {
        const tree = new Tree();
        const [wm, s0] = [win('m'), win('s0')];
        insertMaster(tree, wm, Orientation.LEFT, 0.55);
        insertMaster(tree, s0, Orientation.LEFT, 0.55);

        removeMaster(tree, wm, Orientation.LEFT);

        assert.equal(tree.root.type, 'leaf');
        assert.equal(tree.root.window, s0);
        assert.equal(tree.getWindows().length, 1);
    });

    it('removing master with stack of 3 promotes stack[0] to master', () => {
        const tree = new Tree();
        const [wm, s0, s1, s2] = [win('m'), win('s0'), win('s1'), win('s2')];
        for (const w of [wm, s0, s1, s2])
            insertMaster(tree, w, Orientation.LEFT, 0.55);

        removeMaster(tree, wm, Orientation.LEFT);

        // Master slot now holds s0
        assert.equal(tree.root.childA.window, s0);
        // Stack now contains s1 and s2 with rebalanced ratios
        const stack = tree.root.childB;
        assert.equal(stack.type, 'fork');
        assert.ok(Math.abs(stack.splitRatio - 1 / 2) < 1e-9);
        assert.equal(stack.childA.window, s1);
        assert.equal(stack.childB.window, s2);
    });

    it('removing mid-stack window collapses chain and rebalances', () => {
        const tree = new Tree();
        const [wm, s0, s1, s2] = [win('m'), win('s0'), win('s1'), win('s2')];
        for (const w of [wm, s0, s1, s2])
            insertMaster(tree, w, Orientation.LEFT, 0.55);

        removeMaster(tree, s1, Orientation.LEFT);

        // Stack now has s0 and s2 with ratio 1/2
        const stack = tree.root.childB;
        assert.equal(stack.type, 'fork');
        assert.ok(Math.abs(stack.splitRatio - 1 / 2) < 1e-9);
        assert.equal(stack.childA.window, s0);
        assert.equal(stack.childB.window, s2);
    });

    it('removing the only stack window collapses stack subtree to master alone', () => {
        const tree = new Tree();
        const [wm, s0] = [win('m'), win('s0')];
        insertMaster(tree, wm, Orientation.LEFT, 0.55);
        insertMaster(tree, s0, Orientation.LEFT, 0.55);

        removeMaster(tree, s0, Orientation.LEFT);

        assert.equal(tree.root.type, 'leaf');
        assert.equal(tree.root.window, wm);
    });

    it('removing master with stack of 1 in orientation=right promotes stack[0]', () => {
        const tree = new Tree();
        const [wm, s0] = [win('m'), win('s0')];
        insertMaster(tree, wm, Orientation.RIGHT, 0.55);
        insertMaster(tree, s0, Orientation.RIGHT, 0.55);

        removeMaster(tree, wm, Orientation.RIGHT);

        assert.equal(tree.root.type, 'leaf');
        assert.equal(tree.root.window, s0);
    });
});

describe('swapWithMaster', () => {
    it('swaps master and focused stack window in-place', () => {
        const tree = new Tree();
        const [wm, s0, s1] = [win('m'), win('s0'), win('s1')];
        for (const w of [wm, s0, s1])
            insertMaster(tree, w, Orientation.LEFT, 0.55);

        swapWithMaster(tree, s1, Orientation.LEFT);

        // s1 is now master, wm has taken s1's stack slot
        assert.equal(getMaster(tree, Orientation.LEFT), s1);
        assert.equal(tree.findLeaf(wm).window, wm);

        // Stack now has s0, wm (in that order)
        const stack = tree.root.childB;
        assert.equal(stack.childA.window, s0);
        assert.equal(stack.childB.window, wm);
    });

    it('no-op when focused window is already master', () => {
        const tree = new Tree();
        const [wm, s0] = [win('m'), win('s0')];
        insertMaster(tree, wm, Orientation.LEFT, 0.55);
        insertMaster(tree, s0, Orientation.LEFT, 0.55);

        swapWithMaster(tree, wm, Orientation.LEFT);

        assert.equal(getMaster(tree, Orientation.LEFT), wm);
    });

    it('no-op when focused window not in tree', () => {
        const tree = new Tree();
        insertMaster(tree, win('m'), Orientation.LEFT, 0.55);

        swapWithMaster(tree, win('outside'), Orientation.LEFT);
        // Doesn't throw, state unchanged
    });
});

describe('rebuildShape', () => {
    it('empty window list empties tree', () => {
        const tree = new Tree();
        insertMaster(tree, win(1), Orientation.LEFT, 0.55);
        rebuildShape(tree, [], Orientation.LEFT, 0.55);
        assert.equal(tree.root, null);
    });

    it('produces canonical shape from a flat list', () => {
        const tree = new Tree();
        const wins = [win('m'), win('s0'), win('s1'), win('s2')];
        rebuildShape(tree, wins, Orientation.LEFT, 0.6);

        assert.equal(tree.root.type, 'fork');
        assert.ok(Math.abs(tree.root.splitRatio - 0.6) < 1e-9);
        assert.equal(tree.root.childA.window, wins[0]);

        const stack = tree.root.childB;
        assert.equal(stack.childA.window, wins[1]);
        assert.equal(stack.childB.childA.window, wins[2]);
        assert.equal(stack.childB.childB.window, wins[3]);
    });

    it('orientation switch preserves master via fresh rebuild', () => {
        const tree = new Tree();
        const wins = [win('m'), win('s0'), win('s1')];
        rebuildShape(tree, wins, Orientation.LEFT, 0.55);
        rebuildShape(tree, wins, Orientation.RIGHT, 0.55);

        // Master is now in childB; stack chain in childA
        assert.equal(tree.root.childB.window, wins[0]);
        assert.equal(tree.root.childA.childA.window, wins[1]);
    });
});
