import { checkout } from './checkout.js';
import type { LineItem } from '../public.js';

export function orderWebhook(items: LineItem[]) {
  return JSON.stringify({ event: 'order.accepted', total: checkout(items).total });
}
