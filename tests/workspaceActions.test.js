import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
    switchToWorkspace,
    moveActiveToWorkspace,
    cycleWorkspace,
    moveActiveAndCycle,
} from '../src/core/workspaceActions.js';

/**
 * Build a minimal mock workspace manager.
 * @param {object} opts
 * @param {number} opts.nWorkspaces - current workspace count
 * @param {number} opts.activeIndex - currently active workspace
 * @param {boolean} opts.dynamic - whether dynamic workspaces are enabled
 */
function mockWsManager({nWorkspaces, activeIndex, dynamic}) {
    const activated = [];
    const appended = [];
    const workspaces = Array.from({length: nWorkspaces}, (_, i) => ({
        index: i,
        activate: (_time) => activated.push(i),
    }));
    return {
        get_n_workspaces: () => workspaces.length,
        get_active_workspace_index: () => activeIndex,
        get_workspace_by_index: (i) =>
            (i >= 0 && i < workspaces.length) ? workspaces[i] : null,
        append_new_workspace: (activate, _time) => {
            const i = workspaces.length;
            const ws = {
                index: i,
                activate: (_t) => activated.push(i),
            };
            workspaces.push(ws);
            appended.push(i);
            if (activate) activated.push(i);
            return ws;
        },
        // Surface state for assertions
        _activated: activated,
        _appended: appended,
    };
}

describe('switchToWorkspace', () => {
    it('activates an existing workspace in range', () => {
        const wm = mockWsManager({nWorkspaces: 4, activeIndex: 0, dynamic: false});
        switchToWorkspace(wm, 2, /*dynamic=*/false);
        assert.deepEqual(wm._activated, [2]);
        assert.deepEqual(wm._appended, []);
    });

    it('clamps to no-op when target is out of range in fixed mode', () => {
        const wm = mockWsManager({nWorkspaces: 3, activeIndex: 0, dynamic: false});
        switchToWorkspace(wm, 7, /*dynamic=*/false);
        assert.deepEqual(wm._activated, []);
        assert.deepEqual(wm._appended, []);
    });

    it('appends new workspaces in dynamic mode until target exists', () => {
        const wm = mockWsManager({nWorkspaces: 2, activeIndex: 0, dynamic: true});
        switchToWorkspace(wm, 4, /*dynamic=*/true);
        // Should append workspaces 2, 3, 4 and activate 4
        assert.deepEqual(wm._appended, [2, 3, 4]);
        // append_new_workspace(true, ...) activates each as appended; final activation
        // is on workspace 4. Implementation guarantees exactly one activation of 4.
        assert.deepEqual(wm._activated, [4]);
    });

    it('activates existing workspace without appending when dynamic mode is on but target is in range', () => {
        const wm = mockWsManager({nWorkspaces: 5, activeIndex: 0, dynamic: true});
        switchToWorkspace(wm, 3, /*dynamic=*/true);
        assert.deepEqual(wm._activated, [3]);
        assert.deepEqual(wm._appended, []);
    });

    it('ignores negative index', () => {
        const wm = mockWsManager({nWorkspaces: 3, activeIndex: 1, dynamic: false});
        switchToWorkspace(wm, -1, /*dynamic=*/false);
        assert.deepEqual(wm._activated, []);
    });
});

function mockWindow() {
    const moves = [];
    return {
        _moves: moves,
        change_workspace_by_index: (index, append) => moves.push({index, append}),
    };
}

describe('moveActiveToWorkspace', () => {
    it('moves window to existing workspace and activates it', () => {
        const wm = mockWsManager({nWorkspaces: 4, activeIndex: 0, dynamic: false});
        const win = mockWindow();
        moveActiveToWorkspace(wm, win, 2, /*dynamic=*/false);
        assert.deepEqual(win._moves, [{index: 2, append: false}]);
        assert.deepEqual(wm._activated, [2]);
    });

    it('no-op when window is null', () => {
        const wm = mockWsManager({nWorkspaces: 4, activeIndex: 0, dynamic: false});
        moveActiveToWorkspace(wm, null, 2, /*dynamic=*/false);
        assert.deepEqual(wm._activated, []);
    });

    it('no-op when target out of range in fixed mode', () => {
        const wm = mockWsManager({nWorkspaces: 2, activeIndex: 0, dynamic: false});
        const win = mockWindow();
        moveActiveToWorkspace(wm, win, 7, /*dynamic=*/false);
        assert.deepEqual(win._moves, []);
        assert.deepEqual(wm._activated, []);
    });

    it('appends in dynamic mode then moves and activates', () => {
        const wm = mockWsManager({nWorkspaces: 2, activeIndex: 0, dynamic: true});
        const win = mockWindow();
        moveActiveToWorkspace(wm, win, 4, /*dynamic=*/true);
        assert.deepEqual(wm._appended, [2, 3, 4]);
        assert.deepEqual(win._moves, [{index: 4, append: false}]);
        assert.ok(wm._activated.includes(4));
    });

    it('ignores negative index', () => {
        const wm = mockWsManager({nWorkspaces: 3, activeIndex: 1, dynamic: false});
        const win = mockWindow();
        moveActiveToWorkspace(wm, win, -1, /*dynamic=*/false);
        assert.deepEqual(win._moves, []);
        assert.deepEqual(wm._activated, []);
    });
});

describe('cycleWorkspace', () => {
    it('moves forward when not at last workspace', () => {
        const wm = mockWsManager({nWorkspaces: 4, activeIndex: 1, dynamic: false});
        cycleWorkspace(wm, +1);
        assert.deepEqual(wm._activated, [2]);
    });

    it('moves backward when not at first workspace', () => {
        const wm = mockWsManager({nWorkspaces: 4, activeIndex: 2, dynamic: false});
        cycleWorkspace(wm, -1);
        assert.deepEqual(wm._activated, [1]);
    });

    it('clamps at last workspace (no wrap, no append)', () => {
        const wm = mockWsManager({nWorkspaces: 3, activeIndex: 2, dynamic: true});
        cycleWorkspace(wm, +1);
        assert.deepEqual(wm._activated, []);
        assert.deepEqual(wm._appended, []);
    });

    it('clamps at first workspace', () => {
        const wm = mockWsManager({nWorkspaces: 3, activeIndex: 0, dynamic: false});
        cycleWorkspace(wm, -1);
        assert.deepEqual(wm._activated, []);
    });
});

describe('moveActiveAndCycle', () => {
    it('moves window to neighbor and activates it', () => {
        const wm = mockWsManager({nWorkspaces: 4, activeIndex: 1, dynamic: false});
        const win = mockWindow();
        moveActiveAndCycle(wm, win, +1);
        assert.deepEqual(win._moves, [{index: 2, append: false}]);
        assert.deepEqual(wm._activated, [2]);
    });

    it('no-op at boundary', () => {
        const wm = mockWsManager({nWorkspaces: 3, activeIndex: 2, dynamic: false});
        const win = mockWindow();
        moveActiveAndCycle(wm, win, +1);
        assert.deepEqual(win._moves, []);
        assert.deepEqual(wm._activated, []);
    });

    it('no-op when no focused window', () => {
        const wm = mockWsManager({nWorkspaces: 3, activeIndex: 1, dynamic: false});
        moveActiveAndCycle(wm, null, +1);
        assert.deepEqual(wm._activated, []);
    });
});
