import { Injectable } from '@nestjs/common';
import type {
  CoinPackage,
  Wallet,
  WalletTransaction,
  WalletTransactionsPage,
} from '@influency/shared';
import { toSafeInt } from '../../common/bigint.js';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { CoinEntryType, CoinSourceType, Prisma } from '../../generated/prisma/client.js';
import { allocateFifo, type LotAllocation } from './allocate-fifo.js';
import { encodeLedgerCursor, ledgerCursorWhere } from './ledger-cursor.js';

export const WALLET_PAGE_SIZE = 20;

export interface CreditInput {
  userId: string;
  /** Whole Koin, > 0. */
  coins: bigint;
  entryType: CoinEntryType;
  sourceType: CoinSourceType;
  /** The source row's id; with the source type and entry type it is unique, so a source posts once. */
  sourceId: string;
  /** IDR the user paid for these Koin (the lot's basis). */
  basisIdr: bigint;
}

export interface DebitInput {
  userId: string;
  /** Whole Koin, > 0. */
  coins: bigint;
  entryType: CoinEntryType;
  sourceType: CoinSourceType;
  /** The spend's row id (purchase, period, tip); with the source type and entry type it is unique, so a source debits once. */
  sourceId: string;
}

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the wallet row if the user has none, then locks it (`FOR UPDATE`) until the caller's transaction ends.
   * Every spend takes this lock, so one user's spends and refunds run one after another.
   */
  async lockWalletInTx(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<{ id: string; balanceCoins: bigint }> {
    await tx.$executeRaw`INSERT INTO coin_wallets (user_id) VALUES (${userId}::uuid) ON CONFLICT (user_id) DO NOTHING`;
    const [wallet] = await tx.$queryRaw<{ id: string; balance_coins: bigint }[]>`
      SELECT id, balance_coins FROM coin_wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;
    if (!wallet) throw new Error('lockWalletInTx: wallet row missing after insert');
    return { id: wallet.id, balanceCoins: wallet.balance_coins };
  }

  /**
   * The only code path that removes Koin. Call it inside the caller's transaction, so the debit commits or rolls back
   * together with the purchase, entitlement and revenue rows. It locks the wallet, rejects a balance that is too low
   * (INSUFFICIENT_COINS, nothing written), appends the negative ledger entry, consumes lots oldest first, records
   * which lots it took from (so a refund can restore exactly those) and moves the cached balance.
   *
   * Lock order for every spend: idempotency key → the business row (post / creator / period) → wallet → lots.
   */
  async debitInTx(
    tx: Prisma.TransactionClient,
    input: DebitInput,
  ): Promise<{ balanceCoins: bigint; entryId: string; allocations: LotAllocation[] }> {
    if (input.coins <= 0n) throw new Error('debitInTx: coins must be greater than 0');
    const wallet = await this.lockWalletInTx(tx, input.userId);
    if (wallet.balanceCoins < input.coins) {
      throw new DomainError('INSUFFICIENT_COINS', {
        required: toSafeInt(input.coins),
        available: toSafeInt(wallet.balanceCoins),
      });
    }
    const lots = await tx.$queryRaw<{ id: string; unspent_coins: bigint }[]>`
      SELECT id, unspent_coins FROM coin_lots
      WHERE wallet_id = ${wallet.id}::uuid AND unspent_coins > 0
      ORDER BY created_at, id FOR UPDATE`;
    // A mismatch between balance and lots is a bug: it throws a plain Error (500), the transaction rolls back.
    const allocations = allocateFifo(
      lots.map((l) => ({ id: l.id, unspentCoins: l.unspent_coins })),
      input.coins,
    );
    const balanceCoins = wallet.balanceCoins - input.coins;
    const entry = await tx.coinLedgerEntry.create({
      data: {
        walletId: wallet.id,
        entryType: input.entryType,
        amountCoins: -input.coins,
        balanceAfterCoins: balanceCoins,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    });
    for (const a of allocations) {
      await tx.coinLot.update({
        where: { id: a.lotId },
        data: { unspentCoins: { decrement: a.coins } },
      });
      await tx.coinSpendAllocation.create({
        data: { ledgerEntryId: entry.id, lotId: a.lotId, coins: a.coins },
      });
    }
    await tx.coinWallet.update({ where: { id: wallet.id }, data: { balanceCoins } });
    return { balanceCoins, entryId: entry.id, allocations };
  }

  /**
   * The only code path that adds Koin. Call it inside the caller's transaction (`prisma.$transaction`), so the credit
   * commits or rolls back together with the business row (top-up order). It locks the user's wallet row, appends the
   * ledger entry, creates the Koin lot and moves the cached balance in that same transaction.
   *
   * Lock order: lock the caller's own row (the top-up order) first, then call this (it locks the wallet). A second
   * credit of the same source violates the unique source key and aborts the whole transaction.
   */
  async creditInTx(
    tx: Prisma.TransactionClient,
    input: CreditInput,
  ): Promise<{ balanceCoins: bigint; entryId: string }> {
    if (input.coins <= 0n) throw new Error('creditInTx: coins must be greater than 0');
    const wallet = await this.lockWalletInTx(tx, input.userId);
    const balanceCoins = wallet.balanceCoins + input.coins;
    const entry = await tx.coinLedgerEntry.create({
      data: {
        walletId: wallet.id,
        entryType: input.entryType,
        amountCoins: input.coins,
        balanceAfterCoins: balanceCoins,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    });
    await tx.coinLot.create({
      data: {
        walletId: wallet.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        issuedCoins: input.coins,
        unspentCoins: input.coins,
        basisIdr: input.basisIdr,
      },
    });
    await tx.coinWallet.update({
      where: { id: wallet.id },
      data: { balanceCoins },
    });
    return { balanceCoins, entryId: entry.id };
  }

  /**
   * The only code path that returns spent Koin (a cancelled prepaid renewal). Call it inside the caller's transaction.
   * It locks the wallet, appends a compensating credit for the full amount of the original debit (the debit itself is
   * never edited) and gives the Koin back to exactly the lots the debit took them from, so lot tracing stays exact and no
   * new lot appears. The credit shares the debit's source with another entry type, so a source refunds once: a second
   * refund violates the ledger's unique source key and rolls the whole transaction back.
   */
  async refundSpendInTx(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      debit: { sourceType: CoinSourceType; sourceId: string; entryType: CoinEntryType };
      creditEntryType: CoinEntryType;
    },
  ): Promise<{ balanceCoins: bigint; refundedCoins: bigint; entryId: string }> {
    const wallet = await this.lockWalletInTx(tx, input.userId);
    const debit = await tx.coinLedgerEntry.findUnique({
      where: {
        sourceType_sourceId_entryType: {
          sourceType: input.debit.sourceType,
          sourceId: input.debit.sourceId,
          entryType: input.debit.entryType,
        },
      },
      include: { allocations: true },
    });
    if (!debit || debit.walletId !== wallet.id || debit.amountCoins >= 0n) {
      throw new Error('refundSpendInTx: no debit of this user to refund');
    }
    const refundedCoins = -debit.amountCoins;
    const balanceCoins = wallet.balanceCoins + refundedCoins;
    const entry = await tx.coinLedgerEntry.create({
      data: {
        walletId: wallet.id,
        entryType: input.creditEntryType,
        amountCoins: refundedCoins,
        balanceAfterCoins: balanceCoins,
        sourceType: input.debit.sourceType,
        sourceId: input.debit.sourceId,
      },
    });
    for (const a of debit.allocations) {
      await tx.coinLot.update({
        where: { id: a.lotId },
        data: { unspentCoins: { increment: a.coins } },
      });
    }
    await tx.coinWallet.update({ where: { id: wallet.id }, data: { balanceCoins } });
    return { balanceCoins, refundedCoins, entryId: entry.id };
  }

  /** A user without any movement has no wallet row yet and reads as 0. */
  async getWallet(userId: string): Promise<Wallet> {
    const wallet = await this.prisma.coinWallet.findUnique({ where: { userId } });
    return { balanceCoins: wallet ? toSafeInt(wallet.balanceCoins) : 0 };
  }

  /** Newest first, keyset-paged. A malformed cursor is rejected by the controller's pipe. */
  async listTransactions(userId: string, cursor: string | null): Promise<WalletTransactionsPage> {
    const rows = await this.prisma.coinLedgerEntry.findMany({
      where: { wallet: { userId }, ...(cursor ? ledgerCursorWhere(cursor) : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: WALLET_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, WALLET_PAGE_SIZE);
    const posts = await this.spendLabels(page);
    const items: WalletTransaction[] = page.map((r) => ({
      id: r.id,
      type: r.entryType,
      amountCoins: toSafeInt(r.amountCoins),
      createdAt: r.createdAt.toISOString(),
      topupOrderId: r.sourceType === 'TOPUP_ORDER' ? r.sourceId : null,
      detail: posts.get(r.sourceId)?.detail ?? null,
      href: posts.get(r.sourceId)?.href ?? null,
    }));
    return {
      items,
      nextCursor: rows.length > WALLET_PAGE_SIZE ? encodeLedgerCursor(page.at(-1)!) : null,
    };
  }

  /**
   * The creator (and post) behind each spend entry, for the activity list: unlock debits link to the post,
   * subscription debits and tips to the creator's profile (a post tip to its post). Batched: one query per kind for the whole page.
   */
  private async spendLabels(
    page: { sourceType: CoinSourceType; sourceId: string }[],
  ): Promise<Map<string, { detail: string; href: string }>> {
    const idsOf = (type: CoinSourceType) =>
      page.filter((r) => r.sourceType === type).map((r) => r.sourceId);
    const [purchaseIds, periodIds, tipIds] = [
      idsOf('POST_PURCHASE'),
      idsOf('SUBSCRIPTION_PERIOD'),
      idsOf('TIP'),
    ];
    const creator = { select: { slug: true, displayName: true } };
    const [purchases, periods, tips] = await Promise.all([
      purchaseIds.length === 0
        ? []
        : this.prisma.postPurchase.findMany({
            where: { id: { in: purchaseIds } },
            select: { id: true, postId: true, post: { select: { creatorProfile: creator } } },
          }),
      periodIds.length === 0
        ? []
        : this.prisma.subscriptionPeriod.findMany({
            where: { id: { in: periodIds } },
            select: { id: true, creatorProfile: creator },
          }),
      tipIds.length === 0
        ? []
        : this.prisma.tip.findMany({
            where: { id: { in: tipIds } },
            select: { id: true, postId: true, creatorProfile: creator },
          }),
    ]);
    const labels = new Map<string, { detail: string; href: string }>();
    for (const r of purchases) {
      const c = r.post.creatorProfile;
      labels.set(r.id, { detail: c.displayName, href: `/${c.slug}/posts/${r.postId}` });
    }
    for (const r of periods) {
      labels.set(r.id, { detail: r.creatorProfile.displayName, href: `/${r.creatorProfile.slug}` });
    }
    for (const r of tips) {
      const c = r.creatorProfile;
      labels.set(r.id, {
        detail: c.displayName,
        href: r.postId ? `/${c.slug}/posts/${r.postId}` : `/${c.slug}`,
      });
    }
    return labels;
  }

  async listPackages(): Promise<CoinPackage[]> {
    const rows = await this.prisma.coinPackage.findMany({
      where: { active: true },
      orderBy: { coins: 'asc' },
    });
    return rows.map((p) => ({ id: p.id, coins: p.coins, priceIdr: p.priceIdr }));
  }
}
