export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function formatMoney(amount: number): string {
  return `GBP ${amount.toFixed(2)}`;
}
