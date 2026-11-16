import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoice } from '../src/services/invoice.js';
test('invoice displays the expected total', () => {
  assert.equal(createInvoice([{ price: 100, quantity: 1 }]), 'Invoice total: GBP 118.00');
});
