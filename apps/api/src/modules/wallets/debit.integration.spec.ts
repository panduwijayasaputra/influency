import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '../../../test/prisma.js';
import type { PrismaService } from '../../common/prisma.service.js';
import { WalletsService } from './wallets.service.js';

// The ledger is append-only, so users and wallets are never deleted: each test makes a fresh user.
describe('WalletsService.debitInTx', () => {
  const prisma = createTestPrisma();
  const wallets = new WalletsService(prisma as unknown as PrismaService);
  afterAll(() => prisma.$disconnect());

  async function newUser() {
    return (await prisma.user.create({ data: { displayName: 'Debit spec' } })).id;
  }
  /** One top-up credit = one lot; credits made in order are consumed in order. */
  const credit = (userId: string, coins: bigint) =>
    prisma.$transaction((tx) =>
      wallets.creditInTx(tx, {
        userId,
        coins,
        entryType: 'TOPUP_CREDIT',
        sourceType: 'TOPUP_ORDER',
        sourceId: randomUUID(),
        basisIdr: coins * 1000n,
      }),
    );
  const debit = (userId: string, coins: bigint, sourceId = randomUUID()) =>
    prisma.$transaction((tx) =>
      wallets.debitInTx(tx, {
        userId,
        coins,
        entryType: 'POST_PURCHASE_DEBIT',
        sourceType: 'POST_PURCHASE',
        sourceId,
      }),
    );
  const snapshot = async (userId: string) => {
    const wallet = await prisma.coinWallet.findUniqueOrThrow({ where: { userId } });
    const lots = await prisma.coinLot.findMany({
      where: { walletId: wallet.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const entries = await prisma.coinLedgerEntry.count({ where: { walletId: wallet.id } });
    return { wallet, lots, entries };
  };

  it('debits across two lots, oldest first, and records the allocations', async () => {
    const userId = await newUser();
    await credit(userId, 10n);
    await credit(userId, 25n);
    const out = await debit(userId, 15n);
    expect(out.balanceCoins).toBe(20n);
    expect(out.allocations.map((a) => a.coins)).toEqual([10n, 5n]);

    const { wallet, lots } = await snapshot(userId);
    expect(wallet.balanceCoins).toBe(20n);
    expect(lots.map((l) => l.unspentCoins)).toEqual([0n, 20n]);
    const entry = await prisma.coinLedgerEntry.findUniqueOrThrow({ where: { id: out.entryId } });
    expect(entry).toMatchObject({
      entryType: 'POST_PURCHASE_DEBIT',
      sourceType: 'POST_PURCHASE',
      amountCoins: -15n,
      balanceAfterCoins: 20n,
    });
    const allocations = await prisma.coinSpendAllocation.findMany({
      where: { ledgerEntryId: out.entryId },
    });
    expect(allocations.reduce((n, a) => n + a.coins, 0n)).toBe(15n);
    expect(new Set(allocations.map((a) => a.lotId))).toEqual(new Set(lots.map((l) => l.id)));
  });

  it('rejects an insufficient balance with the required and available Koin, writing nothing', async () => {
    const userId = await newUser();
    await credit(userId, 10n);
    const before = await snapshot(userId);
    await expect(debit(userId, 11n)).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
      details: { required: 11, available: 10 },
    });
    expect(await snapshot(userId)).toEqual(before);
  });

  it('treats a user without a wallet as having 0 Koin', async () => {
    const userId = await newUser();
    await expect(debit(userId, 5n)).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
      details: { required: 5, available: 0 },
    });
    expect(await prisma.coinWallet.count({ where: { userId } })).toBe(0); // the failed attempt rolled back
  });

  it('lets one source debit only once and rolls the second attempt back', async () => {
    const userId = await newUser();
    await credit(userId, 50n);
    const sourceId = randomUUID();
    await debit(userId, 10n, sourceId);
    await expect(debit(userId, 10n, sourceId)).rejects.toThrow();
    const { wallet, lots } = await snapshot(userId);
    expect(wallet.balanceCoins).toBe(40n);
    expect(lots[0]!.unspentCoins).toBe(40n);
  });

  it('cannot overspend: 10 simultaneous debits of 10 against 50 Koin → exactly 5 succeed', async () => {
    const userId = await newUser();
    await credit(userId, 20n);
    await credit(userId, 30n);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => debit(userId, 10n)));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(5);
    expect(failed.map((r) => (r.reason as { code: string }).code)).toEqual(
      Array(5).fill('INSUFFICIENT_COINS'),
    );

    const { wallet, lots } = await snapshot(userId);
    expect(wallet.balanceCoins).toBe(0n);
    expect(lots.every((l) => l.unspentCoins === 0n)).toBe(true);
    const sum = await prisma.coinLedgerEntry.aggregate({
      where: { walletId: wallet.id },
      _sum: { amountCoins: true },
    });
    expect(sum._sum.amountCoins).toBe(0n); // ledger == balance
  });

  it('keeps the lots equal to the balance after mixed credits and debits', async () => {
    const userId = await newUser();
    await credit(userId, 10n);
    await debit(userId, 4n);
    await credit(userId, 25n);
    await debit(userId, 20n);
    const { wallet, lots } = await snapshot(userId);
    expect(lots.reduce((n, l) => n + l.unspentCoins, 0n)).toBe(wallet.balanceCoins);
    expect(wallet.balanceCoins).toBe(11n);
  });

  it('makes allocations append-only', async () => {
    const userId = await newUser();
    await credit(userId, 10n);
    const out = await debit(userId, 5n);
    const alloc = await prisma.coinSpendAllocation.findFirstOrThrow({
      where: { ledgerEntryId: out.entryId },
    });
    await expect(
      prisma.coinSpendAllocation.update({ where: { id: alloc.id }, data: { coins: 1n } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.coinSpendAllocation.delete({ where: { id: alloc.id } })).rejects.toThrow(
      /append-only/,
    );
    await expect(
      prisma.coinSpendAllocation.create({
        data: { ledgerEntryId: out.entryId, lotId: alloc.lotId, coins: 0n },
      }),
    ).rejects.toThrow();
  });
});
