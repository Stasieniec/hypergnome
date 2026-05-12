# Master Layout — Design Spec

**Issue:** [#2 — Feature request: master layout](https://github.com/Stasieniec/hypergnome/issues/2)
**Date:** 2026-05-11
**Status:** Approved, ready for implementation plan

## Goal

Add Hyprland-style master layout as a second layout mode alongside the existing
dwindle BSP layout. One window is the "master" and takes a configurable fraction
of the work area; remaining windows stack in the opposite area. The layout is
selectable globally and changeable at runtime.

## Non-goals (first cut)

- Multiple masters (`nmaster`, `addmaster`/`removemaster`). Single master only.
- Center-master orientation with two flanking stacks.
- Per-workspace or per-monitor layout selection (global only).
- Persisting user-edited stack divider ratios across add/remove (auto-rebalanced).
- New-window-to-master placement (`new_status = master`). New windows always go
  to the stack.

These can be added in later phases. The architecture leaves room for them.

## Architecture

### Layout selection

A single GSettings key `layout-mode` (enum string: `'dwindle' | 'master'`,
default `'dwindle'`) controls the layout for all workspaces and monitors.
Changing it triggers a full re-tile of every live tree via the existing
`_tileExistingWindows` path.

### Tree shape (reuse, don't replace)

Master layout reuses the existing BSP `Tree` from `src/core/tree.js` with no
new node types. It enforces a canonical tree shape per workspace/monitor:

```
            root: H-FORK or V-FORK (splitRatio = mfact)
            /                                       \
       master_leaf                            stack_subtree
```

The orientation of the root fork and the position of `master_leaf` depend on
`master-orientation`:

| Orientation | Root direction | Master is | Stack subtree shape |
|---|---|---|---|
| `left`   | HORIZONTAL | childA | right-leaning V-fork chain |
| `right`  | HORIZONTAL | childB | right-leaning V-fork chain |
| `top`    | VERTICAL   | childA | right-leaning H-fork chain |
| `bottom` | VERTICAL   | childB | right-leaning H-fork chain |

The stack subtree is a right-leaning chain — each non-terminal stack fork has
one leaf as `childA` and another fork (or final leaf) as `childB`:

```
stack_subtree (N=4):
    fork( s0, fork( s1, fork( s2, s3 ) ) )
```

For N evenly-distributed slots, each fork at depth d (0-indexed from the top of
the stack) has `splitRatio = 1 / (N - d)`. So with N=4: ratios are
1/4, 1/3, 1/2 from top down. This gives geometrically uniform slot heights.

`mfact` is simply the root fork's `splitRatio` — no separate storage.

### Why this works without changing the Tree class

- `computeLayout` (in `src/core/layout.js`) is a pure recursive function over
  fork/leaf nodes. It doesn't care that the tree is "shaped" — it just walks
  splits and emits rects.
- `tree.swap(a, b)` works as-is for swap-with-master.
- `tree.findResizableFork(win, dir)` walks up to the nearest matching-direction
  fork. For LEFT/RIGHT orientation that resolves to the root for horizontal
  resizes (= mfact), or to a stack divider for vertical resizes. Inverted for
  TOP/BOTTOM. Behavior is exactly what the user expects: "grow right" grows the
  focused window rightward regardless of layout.
- `_applyLayout`'s animation, drift recovery, fullscreen handling, deferred
  layout, and constraint clearing are all layout-agnostic — they consume rects.
- Existing geometric `findNeighborInDirection` (for focus/move-direction)
  operates on pixel rects, so it works unchanged.

The Tree class and its methods are **not modified**. All master-specific logic
lives in a new module.

### New module: `src/core/masterLayout.js`

Pure functions over `Tree` (no GNOME imports):

```js
// Insert a window per master semantics.
// - Empty tree: window becomes root leaf (later promoted to master on 2nd insert).
// - Single-leaf tree: window joins to form root fork (master = existing, stack = new
//   — i.e., the existing single window stays as master).
// - Otherwise: append window as a new bottom slot in the stack chain and
//   rebalance the chain.
insertMaster(tree, metaWindow, orientation, mfact)

// Remove a window per master semantics.
// - If win is the master: promote stack[0] by reassigning windows
//   (leaf.window pointer swap), then remove the now-stack[0]-vacated leaf via
//   tree.remove(), which collapses the stack chain. Rebalance.
// - If win is in the stack: tree.remove() collapses the parent V-fork into
//   its sibling. Then walk the chain and rebalance.
// - If win is the only window: tree.remove() empties the tree.
removeMaster(tree, metaWindow, orientation)

// Swap focused window with the master (window-pointer swap; no tree mutation).
swapWithMaster(tree, focusedWindow)

// Return the current master window, or null if tree is empty.
getMaster(tree, orientation)

// Rebuild the tree from a flat ordered list of windows (used for mode switch
// and orientation switch). First window becomes master; rest become the stack
// in given order.
rebuildShape(tree, windows, orientation, mfact)

// After insert/remove in master mode, walk the stack chain and set each fork's
// splitRatio to 1/(N-d) where N = remaining stack size, d = depth from top.
rebalanceStack(tree, orientation)
```

These are pure data-structure operations — easy to unit-test without GNOME.

## TilingManager integration

All changes are in `src/core/tilingManager.js`. The dispatch happens at the
insert/remove boundary; everything else is layout-agnostic.

### Helper: layout-aware insert/remove

Introduce two thin internal helpers that dispatch on `layout-mode`:

```js
_treeInsert(tree, metaWindow, splitTarget, defaultRatio, nodeRect, workArea) {
    if (this._isMasterMode()) {
        MasterLayout.insertMaster(
            tree, metaWindow,
            this._settings.get_string('master-orientation'),
            this._settings.get_double('master-factor'));
    } else {
        tree.insert(metaWindow, splitTarget, defaultRatio, nodeRect);
    }
}

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

Every existing `tree.insert(...)` and `tree.remove(...)` call site in
TilingManager is replaced with the helper. There are ~6 call sites in total:

- `_insertWindow` (insert)
- `_onWindowEnteredMonitor` (remove from old, insert into new)
- `_onWindowWorkspaceChanged` (remove + insert)
- `_onWindowUnmanaging` (remove)
- `_onWindowMinimizedChanged` (remove)
- `toggleFloat` (remove + later insert)

### `_tileExistingWindows`

When `layout-mode == 'master'`, after collecting the sorted window list per
monitor, build the canonical shape via `MasterLayout.rebuildShape(tree,
windows, orientation, mfact)`. The first window in stacking order becomes
master.

When `layout-mode == 'dwindle'`, the existing per-window insert loop runs
unchanged.

### New public action methods

```js
swapWithMaster()      // Super+Return
focusMaster()         // Super+M
cycleOrientation(dir) // Cycles left → right → top → bottom → left
```

`swapWithMaster` calls `MasterLayout.swapWithMaster(tree, focused)`, then
`_applyLayout(wsIndex, monIndex)`. `focusMaster` resolves the master leaf and
calls `metaWindow.activate(global.get_current_time())`. `cycleOrientation`
updates the GSettings key — the change handler rebuilds trees.

### `toggleSplit` repurposing

In master mode, `toggleSplit` (Super+P) routes to `cycleOrientation('next')`
instead of flipping a fork's split direction. In dwindle mode it keeps its
existing behavior.

### Mode/orientation change signals

In `enable()`, add:

```js
this._signals.connect(this._settings, 'changed::layout-mode',
    () => this._onLayoutModeChanged());
this._signals.connect(this._settings, 'changed::master-orientation',
    () => this._onLayoutModeChanged());
this._signals.connect(this._settings, 'changed::master-factor',
    () => this._onMasterFactorChanged());
```

`_onLayoutModeChanged` destroys all trees and runs `_tileExistingWindows` on
the active workspace, matching the existing `_onMonitorsChanged` recipe.
Non-active workspaces re-tile lazily on next visit.

`_onMasterFactorChanged` walks all trees in master mode; for each non-empty
tree it sets `root.splitRatio = master-factor` and queues a relayout. This is
applied to *current* trees so live windows reflow; trees built later inherit
the new default.

### Resize semantics

The existing `resizeDirection(direction)` action calls
`tree.findResizableFork(focused, direction)` which walks up to the nearest
fork with matching split direction. This works correctly in master mode:

- LEFT/RIGHT orientation, horizontal resize → finds root fork → updates mfact
- LEFT/RIGHT orientation, vertical resize → finds a stack V-fork → resizes one slot
- TOP/BOTTOM orientation, vertical resize → finds root fork → updates mfact
- TOP/BOTTOM orientation, horizontal resize → finds a stack H-fork → resizes one slot

Mouse-drag resize via `_handleResizeGrab` walks the same way. No changes needed.

**Trade-off:** stack-slot ratios edited by the user (via keybind or drag)
persist until the next add/remove in master mode, at which point
`rebalanceStack` resets them. This matches dwm/awesome behavior and is
documented in the user-facing prefs description.

## GSettings schema additions

Add to `schemas/org.gnome.shell.extensions.hypergnome.gschema.xml`:

```xml
<key name="layout-mode" type="s">
  <choices>
    <choice value="dwindle"/>
    <choice value="master"/>
  </choices>
  <default>'dwindle'</default>
  <summary>Tiling layout</summary>
  <description>Active tiling algorithm: dwindle (BSP) or master/stack</description>
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
  <description>Which side of the screen the master window occupies</description>
</key>

<key name="master-factor" type="d">
  <default>0.55</default>
  <summary>Master area ratio</summary>
  <description>Fraction of the work area used by the master window (0.1 – 0.9)</description>
</key>

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
  <description>Cycle master orientation left → right → top → bottom</description>
</key>
```

## Keybindings

In `src/core/keybindings.js`, add to `enable()`:

```js
this._addBinding('tile-swap-master',
    () => this._tilingManager.swapWithMaster());
this._addBinding('tile-focus-master',
    () => this._tilingManager.focusMaster());
this._addBinding('tile-cycle-orientation',
    () => this._tilingManager.cycleOrientation('next'));
```

The existing `tile-toggle-split` binding stays as-is; the dispatch to
`cycleOrientation` happens inside `TilingManager.toggleSplit` when
`layout-mode == 'master'`.

## Prefs UI additions

In `prefs.js`, add a "Layout" group (or extend the existing layout group):

- Dropdown: **Layout mode** — Dwindle / Master
- Dropdown: **Master orientation** — Left / Right / Top / Bottom (sensitive only when mode = Master)
- Slider: **Master area ratio** — 10% – 90%, step 5% (sensitive only when mode = Master)
- Keybinding rows for `tile-swap-master`, `tile-focus-master`, `tile-cycle-orientation`

The orientation dropdown and ratio slider bind their sensitive property to the
layout-mode dropdown so they grey out in dwindle mode.

## Documentation updates

- `docs/00-project-decisions.md`: update the "Tiling layout" row to note
  master is now an option, and add a row for `layout-mode`.
- `docs/09-hyprland-features-reference.md`: expand the master section with
  what we've implemented vs. what's deferred.
- `CLAUDE.md`: add `master` and `layout` to the scope list for conventional
  commits.

## Edge cases

| Case | Behavior |
|---|---|
| Single window in master mode | Tree is one leaf; `computeLayout` gives it the full padded area. No special-case needed. |
| Removing the master with N≥1 stack | Promote `stack[0]` via window-pointer swap, then `tree.remove` the old stack[0] leaf; rebalance chain. |
| Removing mid-stack window | Standard `tree.remove` collapses parent fork; walk chain and rebalance ratios. |
| Removing the last window | `tree.remove` empties tree. Same as dwindle. |
| `toggleFloat` on master | Routes through `_treeRemove` so promotion runs. |
| Cross-monitor move | `_onWindowEnteredMonitor` uses `_treeRemove` + `_treeInsert`; master semantics hold on both sides. |
| Mode switch with windows present | Destroy trees, `_tileExistingWindows` rebuilds with the new layout. |
| Orientation switch with windows present | Same as mode switch — destroy + rebuild. Window order preserved from stacking. |
| `master-factor` slider change | Walk live trees, set `root.splitRatio = master-factor`, queue relayout. |
| Fullscreen / minimize / drift | Handled by existing `_applyLayout` and deferred layout pass. No changes. |
| Mouse-drag master/stack boundary | Existing `_handleResizeGrab` walks to root fork, updates mfact. |
| Mouse-drag stack divider | Updates one V-fork's ratio; next add/remove rebalances. Documented. |
| User stack-slot keyboard resize | Same as mouse-drag — works, gets rebalanced on next add/remove. |
| Swap with self (focused = master) | No-op early-return. |
| Focus-master with empty tree | No-op early-return. |
| Failed master promotion (rare race) | Wrap in try/catch; on failure, `logError` and `_queueRelayout`. |

## Testing

### Unit tests (new file `tests/masterLayout.test.js` or similar)

Pure functions, no GNOME runtime. Cover:

1. `insertMaster` into empty tree → root is leaf
2. `insertMaster` second window, each orientation → root is the correct fork direction, master is at the right side
3. `insertMaster` 3rd–5th windows → stack chain is right-leaning, ratios are 1/N, 1/(N-1), ..., 1/2
4. `removeMaster` removes master with N=2 → stack[0] becomes new root leaf
5. `removeMaster` removes master with N=4 → stack[0] promoted, chain rebalanced
6. `removeMaster` removes mid-stack → chain collapses correctly, ratios rebalanced
7. `removeMaster` removes only window → tree empty
8. `swapWithMaster` → master and focused window pointers swap, no shape change
9. `rebuildShape` from flat list of N windows → produces canonical shape
10. `rebuildShape` with empty list → empty tree
11. Orientation round-trip: rebuild left, then rebuild right → master moves to opposite side

### Manual test plan

For each orientation in {left, right, top, bottom}:

- Open 1, 2, 3, 5 windows on one monitor → visual shape matches expectations
- Close master with 3+ windows → stack[0] becomes master, rest shift up
- Close mid-stack window → remaining redistribute evenly
- Swap-with-master via keybind → master and focused swap visually
- Focus-master via keybind → focus moves to master window
- mfact resize via Super+Ctrl+Right (LEFT orientation) → master grows
- mfact resize via mouse drag of master/stack boundary → master grows
- Stack-slot resize via Super+Ctrl+Down (LEFT orientation) → one stack slot grows
- Stack-slot drag → one stack slot grows; next window add resets
- Mode switch with 4 windows present → re-tiles cleanly
- Orientation switch with 4 windows present → re-tiles cleanly
- Multi-monitor: each monitor has its own master/stack
- Floating toggle on master → floats correctly, stack[0] promotes
- Floating toggle on stack window → floats correctly, stack rebalances
- Fullscreen on master, exit → returns to master slot
- Workspace switch with master mode on both → both render correctly
- Cross-monitor drag → window moves trees, both rebalance

## Build sequence (rough; full plan comes from writing-plans)

1. `masterLayout.js` module with pure functions + unit tests
2. GSettings schema additions
3. TilingManager: `_treeInsert` / `_treeRemove` helpers, swap-in to all call sites
4. TilingManager: new action methods + signal handlers
5. Keybindings: register new actions
6. Prefs UI: layout group additions
7. `toggleSplit` master-mode repurpose
8. Doc updates
9. Manual test pass across orientations + edge cases

## Open questions

None — all design decisions resolved during brainstorm.
