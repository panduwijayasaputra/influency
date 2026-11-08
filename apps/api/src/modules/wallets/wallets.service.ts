import { Injectable } from '@nestjs/common';
import type {
  CoinPackage,
  Wallet,
  WalletTransaction,
  WalletTransactionsPage,
} from '@influency/shared';
import { toSafeInt } from '../../common/bigint.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { CoinEntryType, CoinSourceType, Prisma } from '../../generated/prisma/client.js';
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

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

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
    await tx.$executeRaw`INSERT INTO coin_wallets (user_id) VALUES (${input.userId}::uuid) ON CONFLICT (user_id) DO NOTHING`;
    const [wallet] = await tx.$queryRaw<{ id: string; balance_coins: bigint }[]>`
      SELECT id, balance_coins FROM coin_wallets WHERE user_id = ${input.userId}::uuid FOR UPDATE`;
    if (!wallet) throw new Error('creditInTx: wallet row missing after insert');
    const balanceCoins = wallet.balance_coins + input.coins;
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
    const items: WalletTransaction[] = page.map((r) => ({
      id: r.id,
      type: r.entryType,
      amountCoins: toSafeInt(r.amountCoins),
      createdAt: r.createdAt.toISOString(),
      topupOrderId: r.sourceType === 'TOPUP_ORDER' ? r.sourceId : null,
      detail: null,
    }));
    return {
      items,
      nextCursor: rows.length > WALLET_PAGE_SIZE ? encodeLedgerCursor(page.at(-1)!) : null,
    };
  }

  async listPackages(): Promise<CoinPackage[]> {
    const rows = await this.prisma.coinPackage.findMany({
      where: { active: true },
      orderBy: { coins: 'asc' },
    });
    return rows.map((p) => ({ id: p.id, coins: p.coins, priceIdr: p.priceIdr }));
  }
}
