import test from 'node:test';
import assert from 'node:assert/strict';
import { availableStock } from '../src/domain/inventory.js';
test('reservations reduce available stock', () => { assert.equal(availableStock(100, 5), 95); });
