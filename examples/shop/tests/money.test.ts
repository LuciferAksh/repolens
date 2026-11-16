import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney } from '../src/domain/money.js';
test('money formatting is stable', () => { assert.equal(formatMoney(100), 'GBP 100.00'); });
