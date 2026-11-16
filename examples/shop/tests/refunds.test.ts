import test from 'node:test';
import assert from 'node:assert/strict';
import { refundAmount } from '../src/services/refunds.js';
test('refunds subtract only the fee', () => { assert.equal(refundAmount(100, 5), 95); });
