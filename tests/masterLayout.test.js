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
