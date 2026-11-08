import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_COIN_PACKAGE_IDS } from '../../common/demo-ids.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { seedCoinPackages } from '../../../prisma/seed/coin-packages.js';

// The ledger is append-only, so rows (and the users they point at) are never deleted: each test makes a fresh user.
describe('koin wallet schema', () => {
  const prisma = createTestPrisma();
  beforeAll(() => seedCoinPackages(prisma));
  afterAll(() => prisma.$disconnect());

  async function newWallet(balance = 0n) {
    const user = await prisma.user.create({ data: { displayName: 'Wallet Spec' } });
    return prisma.coinWallet.create({ data: { userId: user.id, balanceCoins: balance } });
  }
  const entry = (walletId: string, sourceId = randomUUID()) => ({
    walletId,
    entryType: 'TOPUP_CREDIT' as const,
    amountCoins: 10n,
    balanceAfterCoins: 10n,
    sourceType: 'TOPUP_ORDER' as const,
    sourceId,
  });

  it('seeds the five LOCKED packages at Rp1.000 per Koin, idempotently', async () => {
    await seedCoinPackages(prisma);
    // Only the seeded ids: other specs add their own (inactive) packages to the shared test database.
    const packages = await prisma.coinPackage.findMany({
      where: { id: { in: Object.values(DEMO_COIN_PACKAGE_IDS) } },
      orderBy: { coins: 'asc' },
    });
    expect(packages.map((p) => [p.coins, p.priceIdr])).toEqual([
      [10, 10000],
      [25, 25000],
      [50, 50000],
      [100, 100000],
      [250, 250000],
    ]);
  });

  it('rejects a negative balance', async () => {
    const wallet = await newWallet();
    await expect(
      prisma.coinWallet.update({ where: { id: wallet.id }, data: { balanceCoins: -1n } }),
    ).rejects.toThrow(/coin_wallets_balance_nonnegative/);
  });

  it('rejects a zero-amount entry and a duplicate source', async () => {
    const wallet = await newWallet();
    await expect(
      prisma.coinLedgerEntry.create({ data: { ...entry(wallet.id), amountCoins: 0n } }),
    ).rejects.toThrow(/coin_ledger_entries_amount_nonzero/);
    const sourceId = randomUUID();
    await prisma.coinLedgerEntry.create({ data: entry(wallet.id, sourceId) });
    await expect(
      prisma.coinLedgerEntry.create({ data: entry(wallet.id, sourceId) }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it('keeps the ledger append-only', async () => {
    const wallet = await newWallet();
    const row = await prisma.coinLedgerEntry.create({ data: entry(wallet.id) });
    await expect(
      prisma.coinLedgerEntry.update({ where: { id: row.id }, data: { amountCoins: 99n } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.coinLedgerEntry.delete({ where: { id: row.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('rejects a lot whose unspent Koin exceed what was issued, and one source twice', async () => {
    const wallet = await newWallet();
    const lot = {
      walletId: wallet.id,
      sourceType: 'TOPUP_ORDER' as const,
      issuedCoins: 10n,
      basisIdr: 10000n,
    };
    const sourceId = randomUUID();
    await expect(
      prisma.coinLot.create({ data: { ...lot, sourceId, unspentCoins: 11n } }),
    ).rejects.toThrow(/coin_lots_unspent_range/);
    await prisma.coinLot.create({ data: { ...lot, sourceId, unspentCoins: 10n } });
    await expect(
      prisma.coinLot.create({ data: { ...lot, sourceId, unspentCoins: 10n } }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it('allows one wallet per user', async () => {
    const wallet = await newWallet();
    await expect(prisma.coinWallet.create({ data: { userId: wallet.userId } })).rejects.toThrow(
      /Unique constraint/,
    );
  });
});
