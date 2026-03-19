import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {Tree, SplitDirection, Direction} from '../src/core/tree.js';
import {computeLayout, computeNodeRect, findNeighborInDirection} from '../src/core/layout.js';

const win = (id) => ({id, toString: () => `win-${id}`});

const WORK_AREA = {x: 0, y: 0, width: 1920, height: 1080};
const WIDE_RECT = {x: 0, y: 0, width: 1920, height: 1080};
const TALL_RECT = {x: 0, y: 0, width: 500, height: 1080};

// ==========================================================================
// computeLayout
// ==========================================================================

describe('computeLayout', () => {
    it('returns empty map for null root', () => {
        const result = computeLayout(null, WORK_AREA, 0, 0);
        assert.equal(result.size, 0);
    });

    it('single window fills entire work area (no gaps)', () => {
        const tree = new Tree();
        const w = win(1);
        tree.insert(w, null, 0.5, WIDE_RECT);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.equal(rects.size, 1);
        const r = rects.get(w);
        assert.deepEqual(r, {x: 0, y: 0, width: 1920, height: 1080});
    });

    it('single window respects outer gap', () => {
        const tree = new Tree();
        const w = win(1);
        tree.insert(w, null, 0.5, WIDE_RECT);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 10);
        const r = rects.get(w);
        assert.equal(r.x, 10);
        assert.equal(r.y, 10);
        assert.equal(r.width, 1900);
        assert.equal(r.height, 1060);
    });

    it('two windows split horizontally with 50/50 ratio, no gaps', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.equal(rects.size, 2);

        const r1 = rects.get(w1);
        const r2 = rects.get(w2);

        // Left half
        assert.equal(r1.x, 0);
        assert.equal(r1.width, 960);
        assert.equal(r1.height, 1080);

        // Right half
        assert.equal(r2.x, 960);
        assert.equal(r2.width, 960);
        assert.equal(r2.height, 1080);
    });

    it('two windows with inner gap', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        const GAP = 10;
        const rects = computeLayout(tree.root, WORK_AREA, GAP, 0);
        const r1 = rects.get(w1);
        const r2 = rects.get(w2);

        // There should be a gap between the two windows
        const gapBetween = r2.x - (r1.x + r1.width);
        assert.equal(gapBetween, GAP);
    });

    it('two windows with both inner and outer gaps', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        const rects = computeLayout(tree.root, WORK_AREA, 10, 20);
        const r1 = rects.get(w1);
        const r2 = rects.get(w2);

        // Left window starts at outer gap
        assert.equal(r1.x, 20);
        assert.equal(r1.y, 20);

        // Right window ends at work area minus outer gap
        assert.equal(r2.x + r2.width, WORK_AREA.width - 20);

        // Gap between windows
        const gapBetween = r2.x - (r1.x + r1.width);
        assert.equal(gapBetween, 10);
    });

    it('70/30 split ratio allocates more space to first child', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.7, WIDE_RECT);
        tree.insert(w2, w1, 0.7, WIDE_RECT);

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);
        const r1 = rects.get(w1);
        const r2 = rects.get(w2);

        assert.ok(r1.width > r2.width, 'First child should be wider with 0.7 ratio');
        // Approximate check: 70% of 1920 = 1344
        assert.ok(r1.width > 1300 && r1.width < 1400);
    });

    it('three windows create dwindle pattern', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);
        tree.insert(w3, w2, 0.5, TALL_RECT); // vertical split in right half

        const rects = computeLayout(tree.root, WORK_AREA, 0, 0);
        assert.equal(rects.size, 3);

        const r1 = rects.get(w1);
        const r2 = rects.get(w2);
        const r3 = rects.get(w3);

        // w1 takes left half
        assert.equal(r1.x, 0);
        assert.equal(r1.width, 960);
        assert.equal(r1.height, 1080);

        // w2 and w3 share the right half vertically
        assert.equal(r2.x, 960);
        assert.equal(r3.x, 960);
        assert.ok(r2.height < 1080);
        assert.ok(r3.height < 1080);
        assert.equal(r2.height + r3.height, 1080);
    });

    it('all rects have positive width and height', () => {
        const tree = new Tree();
        const windows = [];
        for (let i = 0; i < 8; i++) {
            const w = win(i);
            windows.push(w);
            const focus = i > 0 ? windows[i - 1] : null;
            const rect = i % 2 === 0 ? WIDE_RECT : TALL_RECT;
            tree.insert(w, focus, 0.5, rect);
        }

        const rects = computeLayout(tree.root, WORK_AREA, 5, 10);
        assert.equal(rects.size, 8);
        for (const [, r] of rects) {
            assert.ok(r.width > 0, `width should be positive: ${r.width}`);
            assert.ok(r.height > 0, `height should be positive: ${r.height}`);
        }
    });
});

// ==========================================================================
// computeNodeRect
// ==========================================================================

describe('computeNodeRect', () => {
    it('root leaf gets the full work area', () => {
        const tree = new Tree();
        const w = win(1);
        tree.insert(w, null, 0.5, WIDE_RECT);

        const rect = computeNodeRect(tree.root, WORK_AREA);
        assert.deepEqual(rect, WORK_AREA);
    });

    it('childA of horizontal split gets left half', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        const leaf1 = tree.findLeaf(w1);
        const rect = computeNodeRect(leaf1, WORK_AREA);
        assert.equal(rect.x, 0);
        assert.equal(rect.width, 960);
    });

    it('childB of horizontal split gets right half', () => {
        const tree = new Tree();
        const w1 = win(1);
        const w2 = win(2);
        tree.insert(w1, null, 0.5, WIDE_RECT);
        tree.insert(w2, w1, 0.5, WIDE_RECT);

        const leaf2 = tree.findLeaf(w2);
        const rect = computeNodeRect(leaf2, WORK_AREA);
        assert.equal(rect.x, 960);
        assert.equal(rect.width, 960);
    });
});

// ==========================================================================
// findNeighborInDirection
// ==========================================================================

describe('findNeighborInDirection', () => {
    it('returns null when no neighbor exists', () => {
        const w = win(1);
        const rects = new Map([[w, {x: 0, y: 0, width: 1920, height: 1080}]]);
        assert.equal(findNeighborInDirection(rects, w, Direction.LEFT), null);
        assert.equal(findNeighborInDirection(rects, w, Direction.RIGHT), null);
    });

    it('finds right neighbor in horizontal split', () => {
        const w1 = win(1);
        const w2 = win(2);
        const rects = new Map([
            [w1, {x: 0, y: 0, width: 960, height: 1080}],
            [w2, {x: 960, y: 0, width: 960, height: 1080}],
        ]);

        assert.equal(findNeighborInDirection(rects, w1, Direction.RIGHT), w2);
        assert.equal(findNeighborInDirection(rects, w2, Direction.LEFT), w1);
    });

    it('finds down neighbor in vertical split', () => {
        const w1 = win(1);
        const w2 = win(2);
        const rects = new Map([
            [w1, {x: 0, y: 0, width: 1920, height: 540}],
            [w2, {x: 0, y: 540, width: 1920, height: 540}],
        ]);

        assert.equal(findNeighborInDirection(rects, w1, Direction.DOWN), w2);
        assert.equal(findNeighborInDirection(rects, w2, Direction.UP), w1);
    });

    it('does not find neighbor in wrong direction', () => {
        const w1 = win(1);
        const w2 = win(2);
        const rects = new Map([
            [w1, {x: 0, y: 0, width: 960, height: 1080}],
            [w2, {x: 960, y: 0, width: 960, height: 1080}],
        ]);

        // w2 is to the right of w1, so looking left from w1 should find nothing
        assert.equal(findNeighborInDirection(rects, w1, Direction.LEFT), null);
        // Looking up/down should also find nothing (same y range)
        assert.equal(findNeighborInDirection(rects, w1, Direction.UP), null);
        assert.equal(findNeighborInDirection(rects, w1, Direction.DOWN), null);
    });

    it('prefers overlapping neighbor over distant one', () => {
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        const rects = new Map([
            [w1, {x: 0, y: 0, width: 960, height: 540}],
            [w2, {x: 960, y: 0, width: 960, height: 540}],   // right, overlapping vertically
            [w3, {x: 960, y: 800, width: 960, height: 280}],  // right, but below — no overlap
        ]);

        // w2 overlaps vertically with w1, w3 does not
        assert.equal(findNeighborInDirection(rects, w1, Direction.RIGHT), w2);
    });

    it('finds nearest among multiple candidates', () => {
        const w1 = win(1);
        const w2 = win(2);
        const w3 = win(3);
        const rects = new Map([
            [w1, {x: 0, y: 0, width: 400, height: 1080}],
            [w2, {x: 400, y: 0, width: 400, height: 1080}],
            [w3, {x: 800, y: 0, width: 400, height: 1080}],
        ]);

        // From w1, nearest right neighbor is w2 (not w3)
        assert.equal(findNeighborInDirection(rects, w1, Direction.RIGHT), w2);
        // From w3, nearest left neighbor is w2
        assert.equal(findNeighborInDirection(rects, w3, Direction.LEFT), w2);
    });

    it('returns null for unknown window', () => {
        const w1 = win(1);
        const rects = new Map([[w1, {x: 0, y: 0, width: 960, height: 1080}]]);
        assert.equal(findNeighborInDirection(rects, win(99), Direction.RIGHT), null);
    });
});
