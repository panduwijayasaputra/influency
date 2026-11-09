import { type Payout, payoutBankName } from '@influency/shared';
import { toSafeInt } from '../../common/bigint.js';
import type { CreatorPayout } from '../../generated/prisma/client.js';

/**
 * A payout row as the API shows it. The destination is the snapshot taken at request time (bank, last 4 digits, holder),
 * never the current account. The timestamps are read through a Prisma model, which round-trips JS dates correctly.
 */
export function toPayout(row: CreatorPayout): Payout {
  return {
    id: row.id,
    amountIdr: toSafeInt(row.amountIdr),
    feeIdr: toSafeInt(row.feeIdr),
    netIdr: toSafeInt(row.netIdr),
    feeIsPlaceholder: row.feeIsPlaceholder,
    status: row.status,
    destination: {
      bankCode: row.bankCode,
      bankName: payoutBankName(row.bankCode),
      last4: row.accountLast4,
      holderName: row.holderName,
    },
    requestedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
