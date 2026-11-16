import { priceOrder, countItems, type LineItem } from '../public.js';

export function checkout(items: LineItem[]) {
  return { status: 'accepted', total: priceOrder(items), items: countItems(items) };
}
