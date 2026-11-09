export interface LotBalance {
  id: string;
  unspentCoins: bigint;
}

export interface LotAllocation {
  lotId: string;
  coins: bigint;
}

/**
 * Splits a spend over lots, oldest first. `lots` must already be in FIFO order (created_at, id) with their unspent
 * Koin. Throws when the lots cannot cover the spend: the wallet balance and its lots must never disagree.
 */
export function allocateFifo(lots: readonly LotBalance[], coins: bigint): LotAllocation[] {
  if (coins <= 0n) throw new Error('allocateFifo: coins must be greater than 0');
  const out: LotAllocation[] = [];
  let left = coins;
  for (const lot of lots) {
    if (left === 0n) break;
    if (lot.unspentCoins <= 0n) continue;
    const take = lot.unspentCoins < left ? lot.unspentCoins : left;
    out.push({ lotId: lot.id, coins: take });
    left -= take;
  }
  if (left > 0n) throw new Error(`allocateFifo: lots are short by ${left} Koin`);
  return out;
}
