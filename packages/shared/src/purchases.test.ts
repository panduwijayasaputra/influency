import { describe, expect, it } from 'vitest';
import {
  purchasePostRequestSchema,
  SUBSCRIPTION_FEE_BPS,
  subscriptionCreatorShareIdr,
  putSubscriptionPlanRequestSchema,
  subscribeRequestSchema,
  tipRequestSchema,
} from './index.js';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;

describe('purchases contract bounds (LOCKED)', () => {
  it('unlock price 5..1000 whole Koin', () => {
    const p = (n: unknown) => ok(purchasePostRequestSchema, { expectedPriceCoins: n });
    expect([p(4), p(5), p(1000), p(1001), p(5.5)]).toEqual([false, true, true, false, false]);
  });
  it('plan price 10..5000 whole Koin', () => {
    const p = (n: unknown) => ok(subscribeRequestSchema, { expectedPriceCoins: n });
    expect([p(9), p(10), p(5000), p(5001), p(10.5)]).toEqual([false, true, true, false, false]);
  });
  it('tip 1..1000 whole Koin', () => {
    const p = (n: unknown) => ok(tipRequestSchema, { amountCoins: n });
    expect([p(0), p(1), p(1000), p(1001), p(2.5)]).toEqual([false, true, true, false, false]);
  });
  it('rejects unknown keys', () => {
    expect(ok(tipRequestSchema, { amountCoins: 5, creatorId: 'x' })).toBe(false);
  });
});

describe('plan request', () => {
  it('has the plan price bounds and rejects a client-sent duration', () => {
    const p = (b: unknown) => ok(putSubscriptionPlanRequestSchema, b);
    expect([
      p({ priceCoins: 9, active: true }),
      p({ priceCoins: 10, active: true }),
      p({ priceCoins: 5000, active: false }),
      p({ priceCoins: 5001, active: true }),
      p({ priceCoins: 12.5, active: true }),
      p({ priceCoins: 50, active: true, durationDays: 7 }),
      p({ priceCoins: 50 }),
    ]).toEqual([false, true, true, false, false, false, false]);
  });
});

describe('subscriptionCreatorShareIdr', () => {
  it('gives the creator 85% in integer Rupiah', () => {
    expect(SUBSCRIPTION_FEE_BPS).toBe(1500);
    expect(subscriptionCreatorShareIdr(75, 1000)).toBe(63_750);
    expect(subscriptionCreatorShareIdr(50, 1000)).toBe(42_500);
  });
});
