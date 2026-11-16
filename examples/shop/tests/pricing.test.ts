import test from 'node:test';
import assert from 'node:assert/strict';
import { priceOrder } from '../src/public.js';
test('pricing includes tax without an extra surcharge', () => {
  assert.equal(priceOrder([{ price: 100, quantity: 1 }]), 118);
});
