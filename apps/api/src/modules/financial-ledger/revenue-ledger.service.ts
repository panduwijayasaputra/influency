import { Injectable } from '@nestjs/common';
import type { Prisma, RevenueAccount, RevenueSourceType } from '../../generated/prisma/client.js';
import { type RevenueSplit, splitRevenue } from './split-revenue.js';

export interface SaleInput {
  creatorProfileId: string;
  sourceType: RevenueSourceType;
  /** The spend's row id (purchase, period, tip). With the source type, account and kind it is unique: a source posts once. */
  sourceId: string;
  /** Whole Koin the user spent. */
  coins: bigint;
  /** Snapshot of the fee at spend time. */
  feeBps: number;
  /** When the earning starts to accrue (a scheduled period: its start). */
  accruesAt: Date;
}

/**
 * The creator/platform revenue ledger (purchases US-036). Append-only; rows are written only when Koin is spent, never on
 * a top-up. Call it inside the same transaction as the debit, so a failure leaves no half-posted sale.
 */
@Injectable()
export class RevenueLedgerService {
  /** Posts the CREATOR row and, when the fee is above 0, the PLATFORM row. creator + platform = gross. */
  async postSaleInTx(tx: Prisma.TransactionClient, input: SaleInput): Promise<RevenueSplit> {
    const split = splitRevenue(input.coins, input.feeBps);
    const rows: [RevenueAccount, bigint][] = [['CREATOR', split.creatorIdr]];
    if (split.platformIdr > 0n) rows.push(['PLATFORM', split.platformIdr]);
    for (const [account, amountIdr] of rows) {
      await tx.revenueLedgerEntry.create({
        data: {
          creatorProfileId: input.creatorProfileId,
          account,
          kind: 'SALE',
          amountIdr,
          grossIdr: split.grossIdr,
          feeBps: input.feeBps,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          accruesAt: input.accruesAt,
        },
      });
    }
    return split;
  }

  /** Mirrors every SALE row of a source with a negative REVERSAL row (cancelled renewal). A second reversal violates the unique key. */
  async reverseSaleInTx(
    tx: Prisma.TransactionClient,
    source: { sourceType: RevenueSourceType; sourceId: string },
  ): Promise<void> {
    const sales = await tx.revenueLedgerEntry.findMany({
      where: { ...source, kind: 'SALE' },
    });
    if (sales.length === 0) throw new Error('reverseSaleInTx: no sale to reverse');
    for (const sale of sales) {
      await tx.revenueLedgerEntry.create({
        data: {
          creatorProfileId: sale.creatorProfileId,
          account: sale.account,
          kind: 'REVERSAL',
          amountIdr: -sale.amountIdr,
          grossIdr: sale.grossIdr,
          feeBps: sale.feeBps,
          sourceType: sale.sourceType,
          sourceId: sale.sourceId,
          accruesAt: sale.accruesAt,
        },
      });
    }
  }
}
