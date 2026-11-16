import test from 'node:test';
import assert from 'node:assert/strict';
import { checkout } from '../src/services/checkout.js';
test('checkout charges the expected total', () => {
  assert.equal(checkout([{ price: 100, quantity: 1 }]).total, 118);
});
