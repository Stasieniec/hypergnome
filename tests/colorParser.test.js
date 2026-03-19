import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {parseColor} from '../src/util/colorParser.js';

const approxEqual = (a, b, msg) => {
    assert.ok(Math.abs(a - b) < 0.005, `${msg}: expected ~${b}, got ${a}`);
};

// ==========================================================================
// rgb() / rgba()
// ==========================================================================

describe('parseColor — rgb/rgba', () => {
    it('parses rgb(r,g,b)', () => {
        const c = parseColor('rgb(255,0,0)');
        approxEqual(c.r, 1.0, 'r');
        approxEqual(c.g, 0.0, 'g');
        approxEqual(c.b, 0.0, 'b');
        approxEqual(c.a, 1.0, 'a');
    });

    it('parses rgba(r,g,b,a)', () => {
        const c = parseColor('rgba(0,128,255,0.5)');
        approxEqual(c.r, 0.0, 'r');
        approxEqual(c.g, 128 / 255, 'g');
        approxEqual(c.b, 1.0, 'b');
        approxEqual(c.a, 0.5, 'a');
    });

    it('handles spaces in rgb()', () => {
        const c = parseColor('rgb( 100 , 200 , 50 )');
        approxEqual(c.r, 100 / 255, 'r');
        approxEqual(c.g, 200 / 255, 'g');
        approxEqual(c.b, 50 / 255, 'b');
    });

    it('parses low-range rgb values', () => {
        const c = parseColor('rgb(38,162,105)');
        approxEqual(c.r, 38 / 255, 'r');
        approxEqual(c.g, 162 / 255, 'g');
        approxEqual(c.b, 105 / 255, 'b');
        approxEqual(c.a, 1.0, 'a');
    });
});

// ==========================================================================
// Hex colors
// ==========================================================================

describe('parseColor — hex', () => {
    it('parses #RRGGBB', () => {
        const c = parseColor('#ff0000');
        approxEqual(c.r, 1.0, 'r');
        approxEqual(c.g, 0.0, 'g');
        approxEqual(c.b, 0.0, 'b');
        approxEqual(c.a, 1.0, 'a');
    });

    it('parses #RGB shorthand', () => {
        const c = parseColor('#f00');
        approxEqual(c.r, 1.0, 'r');
        approxEqual(c.g, 0.0, 'g');
        approxEqual(c.b, 0.0, 'b');
    });

    it('parses #RRGGBBAA', () => {
        const c = parseColor('#ff000080');
        approxEqual(c.r, 1.0, 'r');
        approxEqual(c.g, 0.0, 'g');
        approxEqual(c.b, 0.0, 'b');
        approxEqual(c.a, 128 / 255, 'a');
    });

    it('parses uppercase hex', () => {
        const c = parseColor('#00FF00');
        approxEqual(c.r, 0.0, 'r');
        approxEqual(c.g, 1.0, 'g');
        approxEqual(c.b, 0.0, 'b');
    });

    it('parses mixed case hex', () => {
        const c = parseColor('#aAbBcC');
        approxEqual(c.r, 0xaa / 255, 'r');
        approxEqual(c.g, 0xbb / 255, 'g');
        approxEqual(c.b, 0xcc / 255, 'b');
    });
});

// ==========================================================================
// Fallback
// ==========================================================================

describe('parseColor — fallback', () => {
    it('returns fallback for null', () => {
        const c = parseColor(null);
        approxEqual(c.r, 0.15, 'r');
        approxEqual(c.g, 0.39, 'g');
        approxEqual(c.b, 0.82, 'b');
        approxEqual(c.a, 1.0, 'a');
    });

    it('returns fallback for empty string', () => {
        const c = parseColor('');
        approxEqual(c.r, 0.15, 'r');
    });

    it('returns fallback for undefined', () => {
        const c = parseColor(undefined);
        approxEqual(c.r, 0.15, 'r');
    });

    it('returns fallback for garbage string', () => {
        const c = parseColor('not-a-color');
        approxEqual(c.r, 0.15, 'r');
    });

    it('returns independent fallback objects (no shared reference)', () => {
        const a = parseColor(null);
        const b = parseColor(null);
        a.r = 999;
        assert.notEqual(b.r, 999);
    });
});
