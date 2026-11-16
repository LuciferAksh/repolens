import test from 'node:test';
import assert from 'node:assert/strict';
import { orderWebhook } from '../src/services/webhooks.js';
test('webhook contains the expected amount', () => {
  assert.equal(JSON.parse(orderWebhook([{ price: 100, quantity: 1 }])).total, 118);
});
