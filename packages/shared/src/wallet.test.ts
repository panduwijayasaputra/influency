import { describe, expect, it } from 'vitest';
import {
  coinPackageSchema,
  createTopupRequestSchema,
  topupOrderSchema,
  walletSchema,
  walletTransactionSchema,
} from './index.js';

const id = '0198a3c0-0000-7000-8000-000000000001';

describe('wallet contract', () => {
  it('accepts a package and rejects fractional Koin', () => {
    expect(coinPackageSchema.safeParse({ id, coins: 25, priceIdr: 25000 }).success).toBe(true);
    expect(coinPackageSchema.safeParse({ id, coins: 2.5, priceIdr: 25000 }).success).toBe(false);
  });

  it('rejects a negative balance', () => {
    expect(walletSchema.safeParse({ balanceCoins: 0 }).success).toBe(true);
    expect(walletSchema.safeParse({ balanceCoins: -1 }).success).toBe(false);
  });

  it('keeps the sign of a transaction amount', () => {
    const tx = {
      id,
      type: 'TOPUP_CREDIT',
      amountCoins: 50,
      createdAt: '2026-11-07T00:00:00.000Z',
      topupOrderId: id,
      detail: null,
      href: null,
    };
    expect(walletTransactionSchema.parse(tx).amountCoins).toBe(50);
    const debit = {
      ...tx,
      type: 'POST_PURCHASE_DEBIT',
      amountCoins: -25,
      topupOrderId: null,
      detail: 'Ana',
      href: '/ana/posts/p1',
    };
    expect(walletTransactionSchema.parse(debit).amountCoins).toBe(-25);
    expect(walletTransactionSchema.safeParse({ ...tx, type: 'NOPE' }).success).toBe(false);
  });

  it('rejects an unknown top-up status', () => {
    const order = {
      id,
      status: 'PENDING',
      coins: 10,
      priceIdr: 10000,
      feeIdr: 0,
      totalIdr: 10000,
      createdAt: '2026-11-07T00:00:00.000Z',
      creditedAt: null,
      balanceCoins: null,
      redirectUrl: null,
    };
    expect(topupOrderSchema.safeParse(order).success).toBe(true);
    expect(topupOrderSchema.safeParse({ ...order, status: 'PAID' }).success).toBe(false);
  });

  it('strips a client-sent price from a create request', () => {
    expect(createTopupRequestSchema.parse({ packageId: id, priceIdr: 1 })).toEqual({
      packageId: id,
    });
  });
});
