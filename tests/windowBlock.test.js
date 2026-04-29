import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';

import {
    blockWindowSignals,
    isWindowBlocked,
    clearWindowBlock,
} from '../src/util/windowBlock.js';

// Stub Date.now so we can advance time deterministically.  Avoids relying on
// Node's MockTimers API which isn't stable in the 18.x line.
let fakeNow = 0;
const realDateNow = Date.now;

beforeEach(() => {
    fakeNow = 1_000_000;
    Date.now = () => fakeNow;
});

afterEach(() => {
    Date.now = realDateNow;
});

const advance = (ms) => { fakeNow += ms; };

// =============================================================================
// blockWindowSignals / isWindowBlocked
// =============================================================================

describe('windowBlock — blockWindowSignals + isWindowBlocked', () => {
    it('isWindowBlocked is false on a fresh window', () => {
        const win = {};
        assert.equal(isWindowBlocked(win), false);
    });

    it('block then immediate check is true', () => {
        const win = {};
        blockWindowSignals(win);
        assert.equal(isWindowBlocked(win), true);
    });

    it('block expires after the default window', () => {
        // Default window is wide enough to cover Wayland configure round-trips
        // and the multi-window iteration in _applyLayout — 1 ms before is still
        // blocked, exactly at the deadline is unblocked.
        const win = {};
        blockWindowSignals(win);
        const deadline = win._hypergnomeBlockedUntil;
        const ttl = deadline - Date.now();
        assert.ok(ttl >= 200,
            `default block window is at least 200 ms (got ${ttl})`);
        advance(ttl - 1);
        assert.equal(isWindowBlocked(win), true, 'blocked just before deadline');
        advance(1);
        assert.equal(isWindowBlocked(win), false, 'unblocked at deadline');
    });

    it('honours an explicit duration override', () => {
        const win = {};
        blockWindowSignals(win, 50);
        advance(49);
        assert.equal(isWindowBlocked(win), true);
        advance(1);
        assert.equal(isWindowBlocked(win), false);
    });

    it('a later block extends the deadline (latest writer wins)', () => {
        const win = {};
        blockWindowSignals(win, 50);
        advance(40);                     // 10 ms left on the original block
        blockWindowSignals(win, 100);    // refreshes to 100 ms from now
        advance(60);                     // 100 ms after the *first* block — still inside the new one
        assert.equal(isWindowBlocked(win), true);
        advance(40);                     // 100 ms after the second block
        assert.equal(isWindowBlocked(win), false);
    });

    it('a shorter follow-up call shortens the window — latest writer always wins', () => {
        // Documents the timestamp semantics: the most recent blockWindowSignals
        // call defines the deadline, period.  If a caller wants "longest of any
        // pending block", they need to compare-and-set themselves.
        const win = {};
        blockWindowSignals(win, 200);
        advance(10);
        blockWindowSignals(win, 50);     // shorter — wins anyway
        advance(49);
        assert.equal(isWindowBlocked(win), true);
        advance(1);
        assert.equal(isWindowBlocked(win), false);
    });

    it('two windows are blocked independently', () => {
        const a = {};
        const b = {};
        blockWindowSignals(a);
        assert.equal(isWindowBlocked(a), true);
        assert.equal(isWindowBlocked(b), false);
    });

    it('clearWindowBlock immediately unblocks the window', () => {
        const win = {};
        blockWindowSignals(win, 10_000);
        assert.equal(isWindowBlocked(win), true);
        clearWindowBlock(win);
        assert.equal(isWindowBlocked(win), false);
    });

    it('clearWindowBlock on an unblocked window is a no-op', () => {
        const win = {};
        clearWindowBlock(win);
        assert.equal(isWindowBlocked(win), false);
        assert.equal('_hypergnomeBlockedUntil' in win, false);
    });

    it('block flag stamps the documented private property', () => {
        // The property name is part of the contract — animator.js, the tiling
        // manager, and the disable()/unmanage cleanup paths all poke it
        // directly via the windowBlock helpers.  If this name changes, every
        // callsite has to change too.
        const win = {};
        blockWindowSignals(win);
        assert.equal(typeof win._hypergnomeBlockedUntil, 'number');
    });
});
