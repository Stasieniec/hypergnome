# Master Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hyprland-style master/stack layout as a second layout mode alongside the existing dwindle BSP layout, switchable globally at runtime.

**Architecture:** Reuse the existing `Tree` BSP data structure by enforcing a canonical shape — root mfact fork plus right-leaning stack chain. A new pure module `src/core/masterLayout.js` provides master-aware insert/remove/swap/rebuild over the unchanged `Tree`. `TilingManager` dispatches at insert/remove boundaries based on a global `layout-mode` GSettings key; everything else (animations, drift handling, fullscreen, resize-grab, cross-monitor moves) stays layout-agnostic.

**Tech Stack:** GJS / GNOME Shell extensions API (ESM modules), GSettings (XML schema), Node test runner (`node --test`) for unit tests, libadwaita for prefs UI.

**Spec:** [docs/superpowers/specs/2026-05-11-master-layout-design.md](../specs/2026-05-11-master-layout-design.md)

**Branch:** `feat/master-layout` (already checked out)

---

## File Structure

**Create:**
- `src/core/masterLayout.js` — pure functions over `Tree` (insertMaster, removeMaster, swapWithMaster, getMaster, rebuildShape, rebalanceStack)
- `tests/masterLayout.test.js` — unit tests (Node test runner, mock windows like existing tests)

**Modify:**
- `schemas/org.gnome.shell.extensions.hypergnome.gschema.xml` — six new keys
- `src/core/tilingManager.js` — dispatch helpers, new actions, signal handlers, `toggleSplit` repurpose
- `src/core/keybindings.js` — register three new keybindings
- `prefs.js` — new Layout group (mode dropdown, orientation dropdown, mfact slider)
- `docs/00-project-decisions.md` — note master is now available
- `docs/09-hyprland-features-reference.md` — implemented vs. deferred

---

## Stack Ratio Math (Reference)

For a stack of K windows, the chain is `K-1` nested forks. At depth d (0-indexed from top of stack), the fork's `splitRatio = 1 / (K - d)`. So with K=4: ratios are 1/4, 1/3, 1/2. This yields geometrically uniform slot sizes regardless of K.

## Orientation Mapping (Reference)

| Orientation | Root fork | Master child | splitRatio | Stack fork direction |
|---|---|---|---|---|
| `left`   | HORIZONTAL | childA | `mfact`     | VERTICAL |
| `right`  | HORIZONTAL | childB | `1 - mfact` | VERTICAL |
| `top`    | VERTICAL   | childA | `mfact`     | HORIZONTAL |
| `bottom` | VERTICAL   | childB | `1 - mfact` | HORIZONTAL |

The orientation cycle (for `cycleOrientation('next')`) is: `left → right → top → bottom → left`.

---

## Task 1: masterLayout module skeleton + getMaster

**Files:**
- Create: `src/core/masterLayout.js`
- Create: `tests/masterLayout.test.js`

- [ ] **Step 1: Create the module skeleton**

`src/core/masterLayout.js`:

```js
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
```

- [ ] **Step 2: Write tests for getMaster and nextOrientation**

`tests/masterLayout.test.js`:

```js
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {Tree} from '../src/core/tree.js';
import {
    Orientation, nextOrientation, getMaster, getMasterLeaf,
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
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --test-name-pattern="nextOrientation|getMaster"`
Expected: 3 passing tests.

- [ ] **Step 4: Commit**

```bash
git add src/core/masterLayout.js tests/masterLayout.test.js
git commit -m "feat(layout): add masterLayout module skeleton with orientation helpers"
```

---

## Task 2: insertMaster — empty tree and second window

**Files:**
- Modify: `src/core/masterLayout.js`
- Modify: `tests/masterLayout.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/masterLayout.test.js`:

```js
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
```

Add to the imports at the top:

```js
import {Tree} from '../src/core/tree.js';
import {
    Orientation, nextOrientation, getMaster, getMasterLeaf,
    insertMaster,
} from '../src/core/masterLayout.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="insertMaster"`
Expected: FAIL — `insertMaster is not exported`.

- [ ] **Step 3: Implement insertMaster (empty + single-leaf cases)**

Append to `src/core/masterLayout.js`:

```js
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

// Placeholders — implemented in Task 3
function _appendToStackBottom(_tree, _leaf, _orientation) {
    throw new Error('not implemented');
}
function _rebalanceStackInTree(_tree, _orientation) {
    // no-op for now
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="insertMaster"`
Expected: 5 passing tests (1 empty + 4 orientations).

- [ ] **Step 5: Commit**

```bash
git add src/core/masterLayout.js tests/masterLayout.test.js
git commit -m "feat(layout): insertMaster handles empty and single-leaf trees"
```

---

## Task 3: Stack chain append + rebalance

**Files:**
- Modify: `src/core/masterLayout.js`
- Modify: `tests/masterLayout.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/masterLayout.test.js`:

```js
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="stack chain"`
Expected: FAIL — `_appendToStackBottom: not implemented`.

- [ ] **Step 3: Implement append and rebalance**

Replace the placeholder block in `src/core/masterLayout.js` with:

```js
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
 *   Before (stack has 2):       After append s3:
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
 * where K is the remaining stack size and d is the fork's depth from
 * the top of the stack (0-indexed).
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="stack chain"`
Expected: 4 passing tests.

- [ ] **Step 5: Run the full test file to make sure nothing else broke**

Run: `npm test tests/masterLayout.test.js`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/masterLayout.js tests/masterLayout.test.js
git commit -m "feat(layout): stack chain append and rebalance for master layout"
```

---

## Task 4: removeMaster — all cases

**Files:**
- Modify: `src/core/masterLayout.js`
- Modify: `tests/masterLayout.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/masterLayout.test.js`:

```js
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
```

Update imports at the top of the test file to include `removeMaster`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="removeMaster"`
Expected: FAIL — `removeMaster is not exported`.

- [ ] **Step 3: Implement removeMaster**

Append to `src/core/masterLayout.js`:

```js
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

        // Window-pointer swap (mirrors tree.swap but in-place on leaves)
        const promotedWindow = topStackLeaf.window;
        masterLeaf.window = promotedWindow;
        topStackLeaf.window = metaWindow;
        tree._windowToLeaf.set(promotedWindow, masterLeaf);
        tree._windowToLeaf.set(metaWindow, topStackLeaf);

        // Now remove the leaf that holds the original master window
        tree.remove(metaWindow);
    } else {
        // Case 4: stack window
        tree.remove(metaWindow);
    }

    _rebalanceStackInTree(tree, orientation);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="removeMaster"`
Expected: 6 passing tests.

- [ ] **Step 5: Run full test file**

Run: `npm test tests/masterLayout.test.js`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/core/masterLayout.js tests/masterLayout.test.js
git commit -m "feat(layout): removeMaster with master-promotion and rebalance"
```

---

## Task 5: swapWithMaster and rebuildShape

**Files:**
- Modify: `src/core/masterLayout.js`
- Modify: `tests/masterLayout.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/masterLayout.test.js`:

```js
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
```

Update imports to include `swapWithMaster, rebuildShape`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="swapWithMaster|rebuildShape"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement swapWithMaster and rebuildShape**

Append to `src/core/masterLayout.js`:

```js
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
    const focusedLeaf = tree.findLeaf(focusedWindow);
    if (!focusedLeaf)
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
```

Note: `tree.destroy()` only clears root and the windowToLeaf map (verify in `src/core/tree.js`). Since we re-insert via `insertMaster` which re-populates `_windowToLeaf`, this is sufficient.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="swapWithMaster|rebuildShape"`
Expected: 6 passing tests.

- [ ] **Step 5: Run full test file and full suite**

Run: `npm test`
Expected: all green (existing tests + new masterLayout tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/masterLayout.js tests/masterLayout.test.js
git commit -m "feat(layout): swapWithMaster and rebuildShape for master layout"
```

---

## Task 6: GSettings schema additions

**Files:**
- Modify: `schemas/org.gnome.shell.extensions.hypergnome.gschema.xml`

- [ ] **Step 1: Add six new keys to the schema**

Open `schemas/org.gnome.shell.extensions.hypergnome.gschema.xml`. Insert the following block after the existing `<!-- Layout -->` group (after `tile-resize-right` is fine too — placement is cosmetic):

```xml
    <!-- Layout mode -->
    <key name="layout-mode" type="s">
      <choices>
        <choice value="dwindle"/>
        <choice value="master"/>
      </choices>
      <default>'dwindle'</default>
      <summary>Tiling layout</summary>
      <description>Active tiling algorithm: 'dwindle' (BSP) or 'master' (master + stack)</description>
    </key>

    <key name="master-orientation" type="s">
      <choices>
        <choice value="left"/>
        <choice value="right"/>
        <choice value="top"/>
        <choice value="bottom"/>
      </choices>
      <default>'left'</default>
      <summary>Master area orientation</summary>
      <description>Which side of the screen the master window occupies (master layout only)</description>
    </key>

    <key name="master-factor" type="d">
      <default>0.55</default>
      <summary>Master area ratio</summary>
      <description>Fraction of the work area occupied by the master window (0.1 – 0.9)</description>
    </key>

    <!-- Keybindings: Master layout -->
    <key name="tile-swap-master" type="as">
      <default><![CDATA[['<Super>Return']]]></default>
      <summary>Swap with master</summary>
      <description>Swap the focused window with the master window</description>
    </key>

    <key name="tile-focus-master" type="as">
      <default><![CDATA[['<Super>m']]]></default>
      <summary>Focus master</summary>
      <description>Move keyboard focus to the master window</description>
    </key>

    <key name="tile-cycle-orientation" type="as">
      <default><![CDATA[[]]]></default>
      <summary>Cycle master orientation</summary>
      <description>Cycle master orientation: left → right → top → bottom</description>
    </key>
```

- [ ] **Step 2: Compile the schema**

Run: `glib-compile-schemas schemas/`
Expected: no output (success).

If the project uses a Makefile target for this, prefer that. Check:

```bash
grep -E 'schemas|compile' Makefile
```

If `make schemas` exists, run it.

- [ ] **Step 3: Verify the schema is valid by reading keys with gsettings (optional sanity check)**

```bash
GSETTINGS_SCHEMA_DIR=schemas gsettings get org.gnome.shell.extensions.hypergnome layout-mode
```
Expected: `'dwindle'`.

- [ ] **Step 4: Commit**

```bash
git add schemas/
git commit -m "feat(settings): add layout-mode, master-orientation, master-factor and master keybinding schema keys"
```

---

## Task 7: TilingManager — dispatch helpers and master-mode check

**Files:**
- Modify: `src/core/tilingManager.js`

- [ ] **Step 1: Add masterLayout import and helper methods**

In `src/core/tilingManager.js`, add to the imports block at the top:

```js
import * as MasterLayout from './masterLayout.js';
```

Then add these helper methods to the `TilingManager` class. Place them in the "Helpers" section (search for `// Helpers`):

```js
    /**
     * @returns {boolean} true if the active layout mode is master/stack
     */
    _isMasterMode() {
        return this._settings &&
               this._settings.get_string('layout-mode') === 'master';
    }

    /**
     * Layout-aware insert. Dispatches to master or dwindle.
     * @param {Tree} tree
     * @param {Meta.Window} metaWindow
     * @param {Meta.Window|null} splitTarget  (dwindle only)
     * @param {number} defaultRatio           (dwindle only)
     * @param {object} nodeRect               (dwindle only)
     */
    _treeInsert(tree, metaWindow, splitTarget, defaultRatio, nodeRect) {
        if (this._isMasterMode()) {
            MasterLayout.insertMaster(
                tree, metaWindow,
                this._settings.get_string('master-orientation'),
                this._settings.get_double('master-factor'));
        } else {
            tree.insert(metaWindow, splitTarget, defaultRatio, nodeRect);
        }
    }

    /**
     * Layout-aware remove.
     * @param {Tree} tree
     * @param {Meta.Window} metaWindow
     */
    _treeRemove(tree, metaWindow) {
        if (this._isMasterMode()) {
            MasterLayout.removeMaster(
                tree, metaWindow,
                this._settings.get_string('master-orientation'));
        } else {
            tree.remove(metaWindow);
        }
    }
```

- [ ] **Step 2: Replace `tree.insert(...)` call sites with `this._treeInsert(...)`**

Find every `tree.insert(` call in `src/core/tilingManager.js`. There are these:

1. `_onWindowEnteredMonitor` — `newTree.insert(metaWindow, null, defaultRatio, nodeRect);`
2. `_onWindowWorkspaceChanged` — `tree.insert(metaWindow, null, defaultRatio, nodeRect);`
3. `_insertWindow` — `tree.insert(metaWindow, splitTarget, defaultRatio, nodeRect);`
4. `_tileExistingWindows` — `tree.insert(metaWindow, lastInserted, defaultRatio, nodeRect);`

Replace each, keeping the same argument order — e.g. the third call:

```js
this._treeInsert(tree, metaWindow, splitTarget, defaultRatio, nodeRect);
```

For `_tileExistingWindows` — that loop is going to be replaced wholesale in a later task (Task 9). For now, replace this single call.

Quick verification:

```bash
grep -n "tree.insert\|newTree.insert" src/core/tilingManager.js
```
Expected: no matches (all replaced).

- [ ] **Step 3: Replace `tree.remove(...)` call sites with `this._treeRemove(...)`**

Find every `tree.remove(` and `oldTree.remove(` call. There are these:

1. `_onWindowEnteredMonitor` — `tree.remove(metaWindow);` (in the loop where window changed monitors)
2. `_onWindowWorkspaceChanged` — `oldTree.remove(metaWindow);`
3. `_onWindowUnmanaging` — `tree.remove(metaWindow);`
4. `_onWindowMinimizedChanged` — `tree.remove(metaWindow);`
5. `_onFloatListChanged` — `tree.remove(win);`
6. `toggleFloat` — `tree.remove(focused);`

Replace each with `this._treeRemove(<tree-var>, <window-var>);`. Example for #6:

```js
this._treeRemove(tree, focused);
```

Verify:

```bash
grep -n "tree.remove\|oldTree.remove" src/core/tilingManager.js
```
Expected: no matches.

- [ ] **Step 4: Verify the project still loads / nothing syntactically broke**

Run: `npm test`
Expected: all tests pass (existing tests don't exercise these paths).

Run a quick syntax check with Node:

```bash
node --check src/core/tilingManager.js && echo OK
```
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add src/core/tilingManager.js
git commit -m "refactor(tiling): route all tree insert/remove through layout-aware dispatch helpers"
```

---

## Task 8: TilingManager — new action methods

**Files:**
- Modify: `src/core/tilingManager.js`

- [ ] **Step 1: Add three new public action methods**

Add to the "Public action methods" section of `TilingManager` (near `equalize`):

```js
    /**
     * Swap the focused window with the master window (master mode only).
     */
    swapWithMaster() {
        if (!this._isTilingActive())
            return;
        if (!this._isMasterMode())
            return;
        const focused = global.display.get_focus_window();
        if (!focused)
            return;
        const tree = this._findTreeContaining(focused);
        if (!tree)
            return;
        try {
            MasterLayout.swapWithMaster(
                tree, focused,
                this._settings.get_string('master-orientation'));
        } catch (e) {
            logError(e, 'HyperGnome: swapWithMaster');
            this._queueRelayout();
            return;
        }
        const ws = focused.get_workspace();
        if (ws)
            this._applyLayout(ws.index(), focused.get_monitor());
    }

    /**
     * Focus the master window (master mode only).
     */
    focusMaster() {
        if (!this._isTilingActive())
            return;
        if (!this._isMasterMode())
            return;
        const focused = global.display.get_focus_window();
        const tree = focused
            ? this._findTreeContaining(focused)
            : this._activeMonitorTree();
        if (!tree)
            return;
        const master = MasterLayout.getMaster(
            tree, this._settings.get_string('master-orientation'));
        if (master)
            master.activate(global.get_current_time());
    }

    /**
     * Cycle the master orientation: left → right → top → bottom → left.
     * Updates the GSettings key, which fires the change handler that
     * rebuilds all trees.
     */
    cycleOrientation() {
        if (!this._isMasterMode())
            return;
        const current = this._settings.get_string('master-orientation');
        this._settings.set_string('master-orientation',
            MasterLayout.nextOrientation(current));
    }
```

- [ ] **Step 2: Add the small `_activeMonitorTree()` helper**

Add to the "Helpers" section:

```js
    /**
     * Return the tree for the focused monitor on the active workspace,
     * or null. Used by focusMaster when no window has focus.
     */
    _activeMonitorTree() {
        const wsIndex = global.workspace_manager.get_active_workspace_index();
        const monIndex = global.display.get_current_monitor();
        const key = `${wsIndex}:${monIndex}`;
        return this._trees.get(key) ?? null;
    }
```

- [ ] **Step 3: Repurpose toggleSplit in master mode**

Find the `toggleSplit()` method. Add a master-mode branch at the very top:

```js
    toggleSplit() {
        if (!this._isTilingActive())
            return;

        // In master mode, Super+P cycles orientation instead.
        if (this._isMasterMode()) {
            this.cycleOrientation();
            return;
        }

        // ... existing dwindle logic unchanged below ...
```

- [ ] **Step 4: Verify syntax**

Run: `node --check src/core/tilingManager.js && echo OK`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add src/core/tilingManager.js
git commit -m "feat(tiling): add swapWithMaster, focusMaster, cycleOrientation actions"
```

---

## Task 9: TilingManager — `_tileExistingWindows` master-mode branch

**Files:**
- Modify: `src/core/tilingManager.js`

- [ ] **Step 1: Branch the loop body on layout mode**

Find `_tileExistingWindows()`. Inside the `for (let monIndex = 0; ...)` loop, replace the inner per-window loop with a layout-aware branch.

The current shape:

```js
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
        // ... dwindle insertion ...
    }
    this._applyLayout(wsIndex, monIndex);
}
```

New shape:

```js
for (let monIndex = 0; monIndex < nMonitors; monIndex++) {
    const windows = ws.list_windows().filter(w =>
        w.get_monitor() === monIndex && shouldTile(w, floatList)
    );
    const sorted = global.display.sort_windows_by_stacking(windows);
    const workArea = ws.get_work_area_for_monitor(monIndex);
    const tree = this._getTree(wsIndex, monIndex);

    const tileable = sorted.filter(w => !this._floatingWindows.has(w) && !tree.contains(w));

    if (this._isMasterMode()) {
        // Master mode: unmaximize all, build canonical shape from stacking order
        for (const metaWindow of tileable) {
            if (isMaximized(metaWindow)) {
                blockWindowSignals(metaWindow);
                unmaximizeWindow(metaWindow);
            }
        }
        const existing = tree.getWindows();
        const allOrdered = [...existing, ...tileable];
        MasterLayout.rebuildShape(
            tree, allOrdered,
            this._settings.get_string('master-orientation'),
            this._settings.get_double('master-factor'));
        for (const metaWindow of tileable)
            this._connectWindowSignals(metaWindow);
    } else {
        // Dwindle mode: per-window insertion
        const defaultRatio = this._settings.get_double('split-ratio');
        let lastInserted = null;
        for (const metaWindow of tileable) {
            if (isMaximized(metaWindow)) {
                blockWindowSignals(metaWindow);
                unmaximizeWindow(metaWindow);
            }
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
    }

    this._applyLayout(wsIndex, monIndex);
}
```

Note: in the dwindle branch we keep direct `tree.insert(...)` (not `_treeInsert`) because we just confirmed we're in dwindle mode — the dispatch overhead would be wasted.

- [ ] **Step 2: Verify syntax**

Run: `node --check src/core/tilingManager.js && echo OK`
Expected: `OK`.

- [ ] **Step 3: Run unit tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/tilingManager.js
git commit -m "feat(tiling): branch _tileExistingWindows on layout mode"
```

---

## Task 10: TilingManager — layout-mode and orientation signal handlers

**Files:**
- Modify: `src/core/tilingManager.js`

- [ ] **Step 1: Connect new settings signals in `enable()`**

In `enable()`, in the block where other `changed::` signals are connected, add:

```js
        this._signals.connect(this._settings, 'changed::layout-mode',
            () => this._onLayoutModeChanged());
        this._signals.connect(this._settings, 'changed::master-orientation',
            () => this._onLayoutModeChanged());
        this._signals.connect(this._settings, 'changed::master-factor',
            () => this._onMasterFactorChanged());
```

- [ ] **Step 2: Implement `_onLayoutModeChanged` and `_onMasterFactorChanged`**

Add to the "Signal handlers" section:

```js
    /**
     * Layout mode or master orientation changed → destroy all trees and
     * re-tile the active workspace. Non-active workspaces re-tile lazily
     * on the next switch (matches the _onMonitorsChanged behavior).
     */
    _onLayoutModeChanged() {
        if (!this._enabled)
            return;

        // Clean up window markers and disconnect signals before destroying trees
        for (const [_key, tree] of this._trees) {
            for (const win of tree.getWindows()) {
                delete win._hypergnomeTiledRect;
                clearWindowBlock(win);
            }
        }
        for (const [win, _sigs] of this._windowSignals)
            this._disconnectWindowSignals(win);
        for (const [_key, tree] of this._trees)
            tree.destroy();
        this._trees.clear();

        if (this._isTilingActive())
            this._tileExistingWindows();
    }

    /**
     * Master area ratio slider changed → update the root fork ratio of
     * every live tree in master mode and queue a relayout.
     */
    _onMasterFactorChanged() {
        if (!this._isMasterMode())
            return;
        const mfact = this._settings.get_double('master-factor');
        const orientation = this._settings.get_string('master-orientation');
        const masterIsChildA = orientation === 'left' || orientation === 'top';
        const newRatio = masterIsChildA ? mfact : 1 - mfact;

        for (const [_key, tree] of this._trees) {
            if (tree.root && tree.root.type === 'fork')
                tree.root.splitRatio = newRatio;
        }
        this._queueRelayout();
    }
```

Note on `_onMasterFactorChanged`: we duplicate the orientation→childA-or-childB mapping rather than importing `_masterIsChildA` from masterLayout (it's not exported and shouldn't be). Two lines is fine.

- [ ] **Step 3: Verify syntax**

Run: `node --check src/core/tilingManager.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/tilingManager.js
git commit -m "feat(tiling): handle layout-mode, master-orientation, master-factor settings changes"
```

---

## Task 11: Keybindings registration

**Files:**
- Modify: `src/core/keybindings.js`

- [ ] **Step 1: Register the three new keybindings**

In `enable()` of `src/core/keybindings.js`, add to the actions section (after `tile-equalize`):

```js
        // -- Custom keybindings (master layout) --
        this._addBinding('tile-swap-master',
            () => this._tilingManager.swapWithMaster());
        this._addBinding('tile-focus-master',
            () => this._tilingManager.focusMaster());
        this._addBinding('tile-cycle-orientation',
            () => this._tilingManager.cycleOrientation());
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/core/keybindings.js && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add src/core/keybindings.js
git commit -m "feat(keybinds): register swap-with-master, focus-master, cycle-orientation"
```

---

## Task 12: Prefs UI — Layout group

**Files:**
- Modify: `prefs.js`

- [ ] **Step 1: Add a Layout group under the General page**

Read the existing `prefs.js` to find where the tiling group is added (look for `tilingGroup` in `_buildGeneralPage` or `fillPreferencesWindow`).

Add a new group right after the tiling group:

```js
        // Layout group
        const layoutGroup = new Adw.PreferencesGroup({
            title: _('Layout'),
            description: _('Choose between dwindle (BSP) and master/stack tiling'),
        });
        generalPage.add(layoutGroup);

        // Layout mode dropdown
        const layoutModel = new Gtk.StringList();
        layoutModel.append(_('Dwindle (BSP)'));
        layoutModel.append(_('Master / Stack'));
        const LAYOUT_VALUES = ['dwindle', 'master'];

        const layoutRow = new Adw.ComboRow({
            title: _('Layout Mode'),
            subtitle: _('Dwindle splits each new window in half; master gives one window a fixed share with the rest stacked'),
            model: layoutModel,
        });
        layoutRow.set_selected(
            LAYOUT_VALUES.indexOf(settings.get_string('layout-mode')));
        layoutRow.connect('notify::selected', () => {
            settings.set_string('layout-mode', LAYOUT_VALUES[layoutRow.get_selected()]);
        });
        settings.connect('changed::layout-mode', () => {
            const idx = LAYOUT_VALUES.indexOf(settings.get_string('layout-mode'));
            if (layoutRow.get_selected() !== idx)
                layoutRow.set_selected(idx);
        });
        layoutGroup.add(layoutRow);

        // Master orientation dropdown
        const orientationModel = new Gtk.StringList();
        for (const lbl of [_('Left'), _('Right'), _('Top'), _('Bottom')])
            orientationModel.append(lbl);
        const ORIENT_VALUES = ['left', 'right', 'top', 'bottom'];

        const orientationRow = new Adw.ComboRow({
            title: _('Master Orientation'),
            subtitle: _('Which side of the screen the master window occupies'),
            model: orientationModel,
        });
        orientationRow.set_selected(
            ORIENT_VALUES.indexOf(settings.get_string('master-orientation')));
        orientationRow.connect('notify::selected', () => {
            settings.set_string('master-orientation',
                ORIENT_VALUES[orientationRow.get_selected()]);
        });
        settings.connect('changed::master-orientation', () => {
            const idx = ORIENT_VALUES.indexOf(settings.get_string('master-orientation'));
            if (orientationRow.get_selected() !== idx)
                orientationRow.set_selected(idx);
        });
        layoutGroup.add(orientationRow);

        // Master area ratio slider
        const masterFactorRow = new Adw.SpinRow({
            title: _('Master Area Ratio'),
            subtitle: _('Fraction of the work area used by the master window'),
            adjustment: new Gtk.Adjustment({
                lower: 0.1,
                upper: 0.9,
                step_increment: 0.05,
                page_increment: 0.1,
            }),
            digits: 2,
        });
        layoutGroup.add(masterFactorRow);
        settings.bind('master-factor', masterFactorRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        // Disable orientation + ratio when not in master mode
        const updateSensitivity = () => {
            const isMaster = settings.get_string('layout-mode') === 'master';
            orientationRow.set_sensitive(isMaster);
            masterFactorRow.set_sensitive(isMaster);
        };
        updateSensitivity();
        settings.connect('changed::layout-mode', updateSensitivity);
```

If `Adw.ComboRow` and `Gtk.StringList` aren't already imported, add to the imports at the top:

```js
// Gtk and Adw are already imported at the top of prefs.js.
// No new imports needed.
```

- [ ] **Step 2: Verify syntax**

Run: `node --check prefs.js && echo OK`
Expected: `OK`.

- [ ] **Step 3: Manual sanity (skip if not on a GNOME session)**

Build/install the extension per the README and run `gnome-extensions prefs hypergnome@hypergnome.dev`. Verify:
- Layout Mode dropdown shows "Dwindle (BSP)" / "Master / Stack"
- Master Orientation dropdown shows Left/Right/Top/Bottom
- Master Area Ratio spin row works
- Orientation + ratio grey out when Layout Mode = Dwindle

- [ ] **Step 4: Commit**

```bash
git add prefs.js
git commit -m "feat(prefs): add Layout group with mode, orientation, and master ratio controls"
```

---

## Task 13: Documentation updates

**Files:**
- Modify: `docs/00-project-decisions.md`
- Modify: `docs/09-hyprland-features-reference.md`

- [ ] **Step 1: Update project decisions doc**

In `docs/00-project-decisions.md`, change the "Tiling layout" row of the locked-in decisions table from:

```
| Tiling layout | **Dwindle (BSP tree)** | Hyprland's default. Auto-tiles with no user thought. Pluggable architecture so master-stack can be added later. |
```

to:

```
| Tiling layout | **Dwindle (BSP) + Master/Stack** | Dwindle is the default. Master layout reuses the BSP tree by enforcing a canonical shape (root mfact fork + right-leaning stack chain). Switchable globally via `layout-mode`. |
```

- [ ] **Step 2: Update Hyprland features reference**

In `docs/09-hyprland-features-reference.md`, add this section after the "Dwindle Layout" section:

```markdown
## Master Layout

Single master window + stack of remaining windows. Orientation configurable
(master on left / right / top / bottom).

### Implemented
| Setting / action | HyperGnome | Notes |
|---|---|---|
| Master area ratio | `master-factor` (default 0.55) | Slider in prefs; per-tree splitRatio resizable via keybind / drag |
| Orientation | `master-orientation` (left / right / top / bottom) | Cycle keybind + dropdown |
| Swap with master | `tile-swap-master` (Super+Return) | |
| Focus master | `tile-focus-master` (Super+M) | |
| Cycle orientation | `tile-cycle-orientation` (unbound), also Super+P in master mode | Cycles left → right → top → bottom |
| mfact resize | Existing `tile-resize-*` keybinds and mouse drag | Hits root fork in master mode |
| New window placement | Always to stack | Hyprland's `new_status = slave` default |

### Deferred
- Multiple masters (`nmaster`, `addmaster`/`removemaster`)
- Center-master orientation with two stacks
- Per-workspace layout selection
- Persistent custom stack-slot ratios (auto-rebalanced on add/remove today)
- `new_on_top` (always append to bottom of stack today)
```

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs(layout): document master layout in project decisions and Hyprland reference"
```

---

## Task 14: Manual end-to-end verification

**Files:** none (manual testing pass)

- [ ] **Step 1: Install the extension and restart shell**

```bash
make install 2>/dev/null || ln -sf "$PWD" ~/.local/share/gnome-shell/extensions/hypergnome@hypergnome.dev
```

On Wayland, log out + back in. On X11, `Alt+F2 → r`.

```bash
gnome-extensions enable hypergnome@hypergnome.dev
journalctl -f -o cat /usr/bin/gnome-shell  # watch logs in another terminal
```

- [ ] **Step 2: Test matrix — dwindle mode regression**

With `layout-mode = dwindle`:
- Open 4 windows → tile as before
- Resize via keybind → works
- Toggle float → works
- Workspace switch → works
- Close one → tree compacts

Expected: no regressions from current behavior.

- [ ] **Step 3: Test matrix — master mode (left)**

Set `layout-mode = master`, `master-orientation = left`:
- Open 4 windows → master on left at ~55%, stack on right with 3 evenly-sized slots
- Super+Return on stack[1] → it swaps with master
- Super+M → focus jumps to master
- Super+Ctrl+Right (focus on master) → master grows
- Mouse drag master/stack boundary → mfact updates
- Mouse drag a stack divider → that slot resizes
- Add a 5th window → stack rebalances to 4 even slots; user-edited divider gets reset (documented)
- Close master → stack[0] becomes new master
- Close mid-stack → remaining redistribute
- Toggle float on master → floats, stack[0] promotes

- [ ] **Step 4: Test matrix — orientation switching**

With 4 windows on screen, set orientation to each of right / top / bottom via prefs dropdown. Verify:
- Tree rebuilds cleanly each time
- Master and stack window ordering preserved (stacking-order semantics)
- mfact still respected after each switch

Then bind Super+P to verify it cycles orientation in master mode.

- [ ] **Step 5: Test matrix — mode switching with windows present**

With 4 windows tiled in dwindle mode, switch `layout-mode = master` via prefs:
- All windows re-tile into master + 3-stack
- Then switch back to dwindle → re-tiles as dwindle

- [ ] **Step 6: Test matrix — multi-monitor**

If a second monitor is available:
- Open windows on both monitors → each monitor has its own master/stack
- Drag a window across monitors → master semantics hold on both sides
- Close a master on one monitor → stack[0] promotes on that monitor only

- [ ] **Step 7: Watch for journal errors**

In the `journalctl` tail, look for any `HyperGnome:` errors during the above steps. None should appear.

- [ ] **Step 8: Run unit tests once more**

```bash
npm test
```
Expected: all green.

- [ ] **Step 9: Final commit (only if any fix-ups were needed)**

If any bug fixes were needed during manual testing, commit them with appropriate `fix(layout): ...` messages. If everything worked cleanly, no commit needed.

---

## Done

After Task 14, the branch `feat/master-layout` is ready for review / PR. Open it against `main` with the PR template:

```
gh pr create --title "feat(layout): add Hyprland-style master/stack layout" --body "$(cat <<'EOF'
## Summary
- Add master/stack layout as a second layout mode (closes #2)
- Selectable globally via prefs (Layout group: dwindle / master)
- Orientation: left / right / top / bottom
- New keybindings: Super+Return (swap), Super+M (focus master), Super+P repurposed in master mode
- mfact configurable, resizable via existing resize keybinds and mouse drag
- Reuses the existing BSP Tree by enforcing a canonical master+stack shape

## Test plan
- [x] Unit tests for masterLayout module (insert / remove / swap / rebuild / rebalance)
- [x] Manual test: each orientation, mode switch with windows present, multi-monitor, master promotion on close
EOF
)"
```
