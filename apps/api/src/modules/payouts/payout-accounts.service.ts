import { Inject, Injectable } from '@nestjs/common';
import {
  PAYOUT_ACCOUNT_MAX,
  type PayoutAccount,
  type PayoutAccountInput,
  payoutBankName,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { encryptField, loadFieldKey } from '../../common/field-encryption.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { lockCreator } from './creator-lock.js';

/** The columns that may leave this service. `accountNumberEnc` is never selected into a response object. */
const PUBLIC_COLUMNS = {
  id: true,
  bankCode: true,
  last4: true,
  holderName: true,
  active: true,
  createdAt: true,
} as const satisfies Prisma.CreatorPayoutAccountSelect;
type PublicRow = Prisma.CreatorPayoutAccountGetPayload<{ select: typeof PUBLIC_COLUMNS }>;

const toAccount = (row: PublicRow): PayoutAccount => ({
  id: row.id,
  bankCode: row.bankCode,
  bankName: payoutBankName(row.bankCode),
  last4: row.last4,
  holderName: row.holderName,
  active: row.active,
  createdAt: row.createdAt.toISOString(),
});

/** The active account as a payout request snapshots it (US-063). */
export interface ActiveAccount {
  id: string;
  bankCode: string;
  last4: string;
  holderName: string;
}

/**
 * A creator's payout accounts (creator-studio US-062): at most 3, exactly one active, soft delete only.
 * Every write locks the creator's profile row first, so the count limit and the active swap cannot race; the partial
 * UNIQUE index (one active account per creator) is the backstop. The full account number is encrypted (AES-256-GCM,
 * bound to the creator) before it reaches the database and is never read back by this service.
 */
@Injectable()
export class PayoutAccountsService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.key = loadFieldKey(env.PAYOUT_ACCOUNT_ENC_KEY);
  }

  /** Active first, then oldest first. */
  async list(creatorProfileId: string): Promise<PayoutAccount[]> {
    const rows = await this.prisma.creatorPayoutAccount.findMany({
      where: { creatorProfileId, deletedAt: null },
      select: PUBLIC_COLUMNS,
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAccount);
  }

  async create(creatorProfileId: string, input: PayoutAccountInput): Promise<PayoutAccount> {
    return this.prisma.$transaction(async (tx) => {
      await lockCreator(tx, creatorProfileId);
      const count = await tx.creatorPayoutAccount.count({
        where: { creatorProfileId, deletedAt: null },
      });
      if (count >= PAYOUT_ACCOUNT_MAX) throw new DomainError('PAYOUT_ACCOUNT_LIMIT');
      // The first account is always active.
      const active = count === 0 || input.makeActive;
      // Deactivate first: the partial unique index never sees two active rows.
      if (active) await deactivateAll(tx, creatorProfileId);
      const row = await tx.creatorPayoutAccount.create({
        data: {
          creatorProfileId,
          bankCode: input.bankCode,
          accountNumberEnc: encryptField(input.accountNumber, this.key, creatorProfileId),
          last4: input.accountNumber.slice(-4),
          holderName: input.holderName,
          active,
        },
        select: PUBLIC_COLUMNS,
      });
      return toAccount(row);
    });
  }

  /** Makes one account the only active one. Returns the whole list. */
  async activate(creatorProfileId: string, id: string): Promise<PayoutAccount[]> {
    await this.prisma.$transaction(async (tx) => {
      await lockCreator(tx, creatorProfileId);
      await findOwned(tx, creatorProfileId, id);
      await deactivateAll(tx, creatorProfileId);
      await tx.creatorPayoutAccount.update({ where: { id }, data: { active: true } });
    });
    return this.list(creatorProfileId);
  }

  /** Soft delete. The active account (which is always the only one when there is only one) cannot be deleted. */
  async remove(creatorProfileId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockCreator(tx, creatorProfileId);
      const account = await findOwned(tx, creatorProfileId, id);
      if (account.active) throw new DomainError('PAYOUT_ACCOUNT_ACTIVE');
      await tx.creatorPayoutAccount.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  /** For the payout request transaction (US-063), which has already locked the creator row. */
  async activeInTx(
    tx: Prisma.TransactionClient,
    creatorProfileId: string,
  ): Promise<ActiveAccount | null> {
    return tx.creatorPayoutAccount.findFirst({
      where: { creatorProfileId, active: true, deletedAt: null },
      select: { id: true, bankCode: true, last4: true, holderName: true },
    });
  }
}

const deactivateAll = (tx: Prisma.TransactionClient, creatorProfileId: string) =>
  tx.creatorPayoutAccount.updateMany({
    where: { creatorProfileId, active: true, deletedAt: null },
    data: { active: false },
  });

/** The caller's own, non-deleted account; another creator's or a missing one is the same NOT_FOUND. */
async function findOwned(tx: Prisma.TransactionClient, creatorProfileId: string, id: string) {
  const account = await tx.creatorPayoutAccount.findFirst({
    where: { id, creatorProfileId, deletedAt: null },
    select: { id: true, active: true },
  });
  if (!account) throw new DomainError('NOT_FOUND');
  return account;
}
