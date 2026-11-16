import { checkout } from './checkout.js';
import { formatMoney } from '../domain/money.js';
import type { LineItem } from '../domain/pricing.js';

export function createInvoice(items: LineItem[]): string {
  return `Invoice total: ${formatMoney(checkout(items).total)}`;
}
