import { KOIN_TO_IDR, SUBSCRIPTION_FEE_BPS } from '@influency/shared';

/** LOCKED (Monetization Spec v1 §2): platform fee in basis points per kind of spend. */
export const FEE_BPS = { POST_PURCHASE: 2000, SUBSCRIPTION: SUBSCRIPTION_FEE_BPS, TIP: 0 } as const;

export interface RevenueSplit {
  grossIdr: bigint;
  platformIdr: bigint;
  creatorIdr: bigint;
}

/**
 * Integer split of a Koin spend (spec §7): gross = Koin × Rp1.000, platform = half-up(gross × bps / 10.000),
 * creator = gross − platform, so creator + platform always equals gross.
 */
export function splitRevenue(coins: bigint, feeBps: number): RevenueSplit {
  if (coins <= 0n) throw new Error('splitRevenue: coins must be greater than 0');
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error('splitRevenue: feeBps must be an integer from 0 to 10000');
  }
  const grossIdr = coins * BigInt(KOIN_TO_IDR);
  const platformIdr = (grossIdr * BigInt(feeBps) + 5_000n) / 10_000n;
  return { grossIdr, platformIdr, creatorIdr: grossIdr - platformIdr };
}
