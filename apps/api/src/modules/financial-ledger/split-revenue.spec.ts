import { KOIN_TO_IDR, subscriptionCreatorShareIdr } from '@influency/shared';
import { describe, expect, it } from 'vitest';
import { FEE_BPS, splitRevenue } from './split-revenue.js';

describe('splitRevenue', () => {
  it('matches the spec examples', () => {
    expect(splitRevenue(25n, FEE_BPS.POST_PURCHASE)).toEqual({
      grossIdr: 25_000n,
      platformIdr: 5_000n,
      creatorIdr: 20_000n,
    });
    expect(splitRevenue(75n, FEE_BPS.SUBSCRIPTION)).toEqual({
      grossIdr: 75_000n,
      platformIdr: 11_250n,
      creatorIdr: 63_750n,
    });
    expect(splitRevenue(20n, FEE_BPS.TIP)).toEqual({
      grossIdr: 20_000n,
      platformIdr: 0n,
      creatorIdr: 20_000n,
    });
  });

  it('always adds up to the gross, for every Koin amount and fee', () => {
    for (const bps of Object.values(FEE_BPS)) {
      for (let coins = 1n; coins <= 5000n; coins++) {
        const s = splitRevenue(coins, bps);
        expect(s.creatorIdr + s.platformIdr).toBe(s.grossIdr);
        expect(s.platformIdr).toBeGreaterThanOrEqual(0n);
      }
    }
  });

  it('rounds half up when the fee is not a whole rupiah', () => {
    // 1 Koin = Rp1.000 at 1 bps = Rp0,10 → 0; at 50 bps = Rp5; at 5 bps = Rp0,5 → 1 (half up).
    expect(splitRevenue(1n, 1).platformIdr).toBe(0n);
    expect(splitRevenue(1n, 5).platformIdr).toBe(1n);
    expect(splitRevenue(1n, 50).platformIdr).toBe(5n);
  });

  it('rejects a non-positive spend and a bad fee', () => {
    expect(() => splitRevenue(0n, 2000)).toThrow();
    expect(() => splitRevenue(5n, -1)).toThrow();
    expect(() => splitRevenue(5n, 10_001)).toThrow();
    expect(() => splitRevenue(5n, 1.5)).toThrow();
  });
});

describe('subscriptionCreatorShareIdr (web estimate)', () => {
  it.each([10, 25, 50, 75, 333, 4999, 5000])('matches splitRevenue for %i Koin', (coins) => {
    expect(BigInt(subscriptionCreatorShareIdr(coins, KOIN_TO_IDR))).toBe(
      splitRevenue(BigInt(coins), FEE_BPS.SUBSCRIPTION).creatorIdr,
    );
  });
});
