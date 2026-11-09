import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { DEMO_COIN_PACKAGE_IDS } from '../../src/common/demo-ids.js';

/** LOCKED (Monetization Spec v1 §2): 1 Koin = Rp1.000. */
const IDR_PER_KOIN = 1000n;

/**
 * Gives a user Koin the way a real top-up does: a CREDITED order, a FIFO lot and an append-only ledger entry,
 * in one transaction with the wallet row locked. Dev/test only: it skips Midtrans, so never run it against production.
 */
export async function grantKoin(
  prisma: PrismaClient,
  userId: string,
  coins: bigint,
): Promise<void> {
  if (coins <= 0n) throw new Error('coins must be positive');
  await prisma.$transaction(async (tx) => {
    await tx.coinWallet.upsert({ where: { userId }, create: { userId }, update: {} });
    const [wallet] = await tx.$queryRaw<{ id: string; balance_coins: bigint }[]>`
      SELECT id, balance_coins FROM coin_wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;
    const topupId = randomUUID();
    const idr = coins * IDR_PER_KOIN;
    await tx.topupOrder.create({
      data: {
        id: topupId,
        userId,
        packageId: DEMO_COIN_PACKAGE_IDS[250],
        orderNumber: `SEED-GRANT-${topupId}`,
        coins,
        priceIdr: idr,
        totalIdr: idr,
        status: 'CREDITED',
        paidAt: new Date(),
        creditedAt: new Date(),
      },
    });
    await tx.coinLot.create({
      data: {
        walletId: wallet!.id,
        sourceType: 'TOPUP_ORDER',
        sourceId: topupId,
        issuedCoins: coins,
        unspentCoins: coins,
        basisIdr: idr,
      },
    });
    const balanceAfter = wallet!.balance_coins + coins;
    await tx.coinLedgerEntry.create({
      data: {
        walletId: wallet!.id,
        entryType: 'TOPUP_CREDIT',
        amountCoins: coins,
        balanceAfterCoins: balanceAfter,
        sourceType: 'TOPUP_ORDER',
        sourceId: topupId,
      },
    });
    await tx.coinWallet.update({ where: { id: wallet!.id }, data: { balanceCoins: balanceAfter } });
  });
}
