import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {Tree, Direction} from '../src/core/tree.js';
import {computeLayout, findNeighborInDirection} from '../src/core/layout.js';

const win = (id) => ({id, toString: () => `win-${id}`});

const WORK_AREA = {x: 0, y: 0, width: 1920, height: 1080};
const WIDE_RECT = {x: 0, y: 0, width: 1920, height: 1080};

// ==========================================================================
// toggle-float: tree removal and re-insertion preserves layout
// ==========================================================================

describe('toggle-float tree operations', () => {
    it('removing a window makes remaining window fill the work area', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.6, WIDE_RECT);
        tree.insert(w2, w1, 0.6, WIDE_RECT);

        // Before removal: 60/40 split
        const rectsBefore = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.equal(rectsBefore.size, 2);
        assert.ok(rectsBefore.get(w1).width > rectsBefore.get(w2).width);

        // Remove w2 (simulating toggleFloat)
        tree.remove(w2);

        // After removal: w1 fills entire area
        const rectsAfter = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.equal(rectsAfter.size, 1);
        const r1 = rectsAfter.get(w1);
        assert.equal(r1.x, 0);
        assert.equal(r1.y, 0);
        assert.equal(r1.width, 1920);
        assert.equal(r1.height, 1080);
    });

    it('re-inserting a previously removed window restores a two-window split', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        // Remove (float)
        tree.remove(w2);
        assert.equal(tree.getWindows().length, 1);

        // Re-insert (un-float) — inserts next to w1
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        assert.equal(tree.getWindows().length, 2);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.equal(rects.size, 2);
        assert.ok(rects.has(w1));
        assert.ok(rects.has(w2));

        // Both windows should have reasonable dimensions
        for (const [, r] of rects) {
            assert.ok(r.width > 0);
            assert.ok(r.height > 0);
        }
    });

    it('removing and re-inserting does not corrupt tree for three windows', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.insert(w3, w2, 0.5, {x: 0, y: 0, width: 500, height: 1080});

        // Float w2
        tree.remove(w2);
        assert.equal(tree.getWindows().length, 2);

        const rectsWithout = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.equal(rectsWithout.size, 2);
        assert.ok(rectsWithout.has(w1));
        assert.ok(rectsWithout.has(w3));

        // Un-float w2 — re-insert next to w1
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        assert.equal(tree.getWindows().length, 3);

        const rectsAll = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.equal(rectsAll.size, 3);
        for (const [, r] of rectsAll) {
            assert.ok(r.width > 0);
            assert.ok(r.height > 0);
        }
    });
});

// ==========================================================================
// move-direction: findNeighborInDirection on 60/40 and other splits
// ==========================================================================

describe('move-direction neighbor finding', () => {
    it('finds neighbor in 60/40 horizontal split', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.6, WIDE_RECT);
        tree.insert(w2, w1, 0.6, WIDE_RECT);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);

        // From w1, moving right should find w2
        assert.equal(findNeighborInDirection(rects, w1, Direction.RIGHT), w2);
        // From w2, moving left should find w1
        assert.equal(findNeighborInDirection(rects, w2, Direction.LEFT), w1);
    });

    it('does not find cross-axis neighbor in horizontal split', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.6, WIDE_RECT);
        tree.insert(w2, w1, 0.6, WIDE_RECT);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);

        // Up/Down should return null (windows are side by side)
        assert.equal(findNeighborInDirection(rects, w1, Direction.UP), null);
        assert.equal(findNeighborInDirection(rects, w1, Direction.DOWN), null);
    });

    it('finds neighbor in 60/40 split with gaps', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.6, WIDE_RECT);
        tree.insert(w2, w1, 0.6, WIDE_RECT);

        const rects = computeLayout(tree.root, WORK_AREA, 10, 20);

        assert.equal(findNeighborInDirection(rects, w1, Direction.RIGHT), w2);
        assert.equal(findNeighborInDirection(rects, w2, Direction.LEFT), w1);
    });

    it('swap preserves tree structure and layout correctness', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.6, WIDE_RECT);
        tree.insert(w2, w1, 0.6, WIDE_RECT);

        const rectsBefore = computeLayout(tree.root, WORK_AREA, 0, 0);
        const w1RectBefore = rectsBefore.get(w1);
        const w2RectBefore = rectsBefore.get(w2);

        // Swap (simulating moveDirection when neighbor found)
        tree.swap(w1, w2);

        const rectsAfter = computeLayout(tree.root, WORK_AREA, 0, 0);

        // After swap, w1 should be where w2 was and vice versa
        assert.deepEqual(rectsAfter.get(w1), w2RectBefore);
        assert.deepEqual(rectsAfter.get(w2), w1RectBefore);
    });

    it('finds correct neighbor in dwindle layout with three windows', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.insert(w3, w2, 0.5, {x: 960, y: 0, width: 960, height: 1080});

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);

        // w1 is left half, w2 is top-right, w3 is bottom-right
        // From w1 moving right: should find w2 or w3 (whichever overlaps vertically)
        const neighbor = findNeighborInDirection(rects, w1, Direction.RIGHT);
        assert.ok(neighbor === w2 || neighbor === w3,
            'should find a right neighbor');

        // From w2 moving down: should find w3
        assert.equal(findNeighborInDirection(rects, w2, Direction.DOWN), w3);
        // From w3 moving up: should find w2
        assert.equal(findNeighborInDirection(rects, w3, Direction.UP), w2);
    });

    it('returns null when only one window exists (triggers cross-monitor path)', () => {
        const tree = new Tree();
        const w1 = win(1);
        tree.insert(w1, null, 0.5, WIDE_RECT);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);

        assert.equal(findNeighborInDirection(rects, w1, Direction.LEFT), null);
        assert.equal(findNeighborInDirection(rects, w1, Direction.RIGHT), null);
        assert.equal(findNeighborInDirection(rects, w1, Direction.UP), null);
        assert.equal(findNeighborInDirection(rects, w1, Direction.DOWN), null);
    });
});

// ==========================================================================
// Edge cases for both fixes
// ==========================================================================

describe('edge cases', () => {
    it('rapid float/unfloat cycle preserves tree integrity', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        // Simulate rapid float/unfloat of w2
        for (let i = 0; i < 10; i++) {
            tree.remove(w2);
            assert.equal(tree.getWindows().length, 1);
            assert.equal(tree.contains(w2), false);

            tree.insert(w2, w1, 0.5, WIDE_RECT);
            assert.equal(tree.getWindows().length, 2);
            assert.equal(tree.contains(w2), true);
        }

        // Layout should still be valid
        const rects = computeLayout(tree.root, WORK_AREA, 5, 10);
        assert.equal(rects.size, 2);
        for (const [, r] of rects) {
            assert.ok(r.width > 0);
            assert.ok(r.height > 0);
        }
    });

    it('swap followed by remove does not corrupt tree', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        // Swap then remove (move to same position then float)
        tree.swap(w1, w2);
        tree.remove(w2);

        assert.equal(tree.getWindows().length, 1);
        assert.equal(tree.contains(w1), true);
        assert.equal(tree.contains(w2), false);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.deepEqual(rects.get(w1), WORK_AREA);
    });

    it('fullscreen-cycle preserves tree topology when window is kept in tree', () => {
        // Regression: #5 — fullscreening a YouTube video and exiting used to
        // remove + re-insert the window, which dropped it at the default
        // insertion point on exit and shuffled the layout.  The fix keeps
        // the window in the tree across fullscreen transitions; the layout
        // engine already skips fullscreen windows, so other tiles stay put.
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);  // simulates the YouTube/browser window
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.6, WIDE_RECT);
        tree.insert(w3, w2, 0.5, {x: 960, y: 0, width: 960, height: 1080});

        const rectsBefore = computeLayout(tree.root, WORK_AREA, 0, 0);
        const w1Before = rectsBefore.get(w1);
        const w2Before = rectsBefore.get(w2);
        const w3Before = rectsBefore.get(w3);

        // Simulate fullscreen-enter and fullscreen-exit: the new behavior
        // does NOT touch the tree, so the layout is byte-for-byte identical.
        const rectsAfter = computeLayout(tree.root, WORK_AREA, 0, 0);

        assert.deepEqual(rectsAfter.get(w1), w1Before);
        assert.deepEqual(rectsAfter.get(w2), w2Before);
        assert.deepEqual(rectsAfter.get(w3), w3Before);
    });

    it('old fullscreen path (remove + reinsert) shuffles tree position', () => {
        // Documents the original bug: re-inserting at the "default" point
        // (next to the last leaf) does NOT necessarily restore the window
        // to its original slot, hence the user-visible "tiling broken".
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.insert(w3, w2, 0.5, {x: 960, y: 0, width: 960, height: 1080});

        const rectsBefore = computeLayout(tree.root, WORK_AREA, 0, 0);
        const w2Before = rectsBefore.get(w2);

        // Old behavior: remove w2 (fullscreen-enter), then re-insert
        // without remembering its slot (fullscreen-exit).
        tree.remove(w2);
        // _insertWindow re-inserts next to the last leaf when the focused
        // window isn't already in the tree.  After removing w2, last leaf
        // is w3, so w2 ends up split next to w3 — not where it started.
        const lastLeaf = tree.findLastLeaf();
        const lastLeafWin = lastLeaf.window;
        tree.insert(w2, lastLeafWin, 0.5, WIDE_RECT);

        const rectsAfter = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.notDeepEqual(rectsAfter.get(w2), w2Before,
            'old behavior would put w2 at a different rect — this is the bug');
    });

    it('neighbor search works after swap', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.insert(w3, w2, 0.5, {x: 960, y: 0, width: 960, height: 1080});

        // Swap w2 and w3
        tree.swap(w2, w3);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);

        // Neighbor relationships should still be valid
        // w1 is left, w3 is now top-right, w2 is now bottom-right
        assert.equal(findNeighborInDirection(rects, w3, Direction.DOWN), w2);
        assert.equal(findNeighborInDirection(rects, w2, Direction.UP), w3);
    });
});
