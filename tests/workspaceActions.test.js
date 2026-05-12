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
        _dynamic: dynamic,
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
        // is on workspace 4. So 4 should appear in activated.
        assert.ok(wm._activated.includes(4));
    });

    it('ignores negative index', () => {
        const wm = mockWsManager({nWorkspaces: 3, activeIndex: 1, dynamic: false});
        switchToWorkspace(wm, -1, /*dynamic=*/false);
        assert.deepEqual(wm._activated, []);
    });
});
