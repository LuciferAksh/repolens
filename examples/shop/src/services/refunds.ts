import { roundMoney } from '../domain/money.js';

export const refundAmount = (paid: number, fee: number): number => roundMoney(paid - fee);
