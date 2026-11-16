import { roundMoney } from './money.js';

export interface LineItem { price: number; quantity: number; }

/** The public pricing boundary shared by checkout, invoices, and webhooks. */
export function calculateTotal(items: LineItem[], taxRate = 0.18): number {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return roundMoney(subtotal * (1 + taxRate));
}

export function countItems(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
