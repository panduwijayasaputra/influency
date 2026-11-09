import { Inject, Injectable } from '@nestjs/common';
import {
  type CreatePayoutInput,
  PAYOUT_MIN_IDR,
  type Payout,
  type PayoutPage,
  type PayoutQuote,
  payoutBankName,
} from '@influency/shared';
import { toSafeInt } from '../../common/bigint.js';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { IdempotencyService, requestHash } from '../../common/idempotency.js';
import { PrismaService } from '../../common/prisma.service.js';
import {
  encodeLedgerCursor,
  ledgerCursorSchema,
  ledgerCursorWhere,
} from '../wallets/ledger-cursor.js';
import { WALLET_PAGE_SIZE } from '../wallets/wallets.service.js';
import { lockCreator } from './creator-lock.js';
import { EarningsService } from './earnings.service.js';
import { PayoutAccountsService } from './payout-accounts.service.js';
import { toPayout } from './payout-mapper.js';

/** Idempotency-Key scope of a payout request; keys are unique per (user, scope). */
export const PAYOUT_IDEMPOTENCY_SCOPE = 'payout';

/**
 * Payout requests (creator-studio US-063). Nothing here moves money: a request creates a REQUESTED payout, and that row
 * IS the reservation, because the earnings balance subtracts every REQUESTED payout. There is no separate balance to
 * keep in step. The transfer fee comes from server config, never from the client.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly earnings: EarningsService,
    private readonly accounts: PayoutAccountsService,
    private readonly idempotency: IdempotencyService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The configured transfer fee and whether it is still a labelled example ("Perlu konfirmasi"). */
  fee(): { feeIdr: bigint; feeIsPlaceholder: boolean } {
    return {
      feeIdr: BigInt(this.env.PAYOUT_TRANSFER_FEE_IDR),
      feeIsPlaceholder: !this.env.PAYOUT_TRANSFER_FEE_CONFIRMED,
    };
  }

  /**
   * What a payout of `amountIdr` would cost and pay, to the creator's active account. Read-only (no lock): the request
   * checks everything again under the lock, so a quote is a preview, never a promise.
   */
  async quote(creatorProfileId: string, amountIdr: number): Promise<PayoutQuote> {
    const account = await this.accounts.activeInTx(this.prisma, creatorProfileId);
    if (!account) throw new DomainError('PAYOUT_ACCOUNT_REQUIRED');
    const balance = await this.earnings.balanceInTx(this.prisma, creatorProfileId);
    if (BigInt(amountIdr) > balance.availableIdr) {
      throw new DomainError('PAYOUT_EXCEEDS_AVAILABLE', {
        availableIdr: toSafeInt(balance.availableIdr),
      });
    }
    const { feeIdr, feeIsPlaceholder } = this.fee();
    return {
      amountIdr,
      feeIdr: toSafeInt(feeIdr),
      netIdr: amountIdr - toSafeInt(feeIdr),
      feeIsPlaceholder,
      availableIdr: toSafeInt(balance.availableIdr),
      destination: {
        bankCode: account.bankCode,
        bankName: payoutBankName(account.bankCode),
        last4: account.last4,
        holderName: account.holderName,
      },
    };
  }

  /**
   * One transaction: lock the creator row → claim the Idempotency-Key → check → insert the payout and its first status
   * change → store the result. Locking first serializes this creator's requests, so a second request reads the balance
   * after the first one's reservation is committed; the same key sent twice at once also queues on the lock and then
   * replays. A failed check rolls everything back, key included, so the retry is not blocked by it.
   */
  async request(
    userId: string,
    creatorProfileId: string,
    key: string,
    input: CreatePayoutInput,
  ): Promise<{ payout: Payout; replay: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await lockCreator(tx, creatorProfileId);
      const claim = await this.idempotency.claim(tx, {
        userId,
        scope: PAYOUT_IDEMPOTENCY_SCOPE,
        key,
        requestHash: requestHash(input),
      });
      if (claim.status === 'replay') {
        if (!claim.resultId) throw new DomainError('REQUEST_IN_PROGRESS');
        const existing = await tx.creatorPayout.findFirst({
          where: { id: claim.resultId, creatorProfileId },
        });
        if (!existing) throw new DomainError('DUPLICATE_REQUEST');
        return { payout: toPayout(existing), replay: true };
      }

      const { feeIdr, feeIsPlaceholder } = this.fee();
      if (BigInt(input.expectedFeeIdr) !== feeIdr) {
        throw new DomainError('PAYOUT_FEE_CHANGED', { feeIdr: toSafeInt(feeIdr) });
      }
      const account = await this.accounts.activeInTx(tx, creatorProfileId);
      if (!account) throw new DomainError('PAYOUT_ACCOUNT_REQUIRED');
      const amount = BigInt(input.amountIdr);
      // The minimum is measured before the fee (LOCKED); the net is positive because the fee config is below it.
      if (amount < BigInt(PAYOUT_MIN_IDR) || amount <= feeIdr) {
        throw new DomainError('VALIDATION_FAILED', {
          issues: [{ path: 'amountIdr', message: 'Jumlah pencairan terlalu kecil.' }],
        });
      }
      // After the lock, so every earlier request's reservation is already committed and counted.
      const balance = await this.earnings.balanceInTx(tx, creatorProfileId);
      if (amount > balance.availableIdr) {
        throw new DomainError('PAYOUT_EXCEEDS_AVAILABLE', {
          availableIdr: toSafeInt(balance.availableIdr),
        });
      }

      const row = await tx.creatorPayout.create({
        data: {
          creatorProfileId,
          payoutAccountId: account.id,
          bankCode: account.bankCode,
          accountLast4: account.last4,
          holderName: account.holderName,
          amountIdr: amount,
          feeIdr,
          netIdr: amount - feeIdr,
          feeIsPlaceholder,
          requestedByUserId: userId,
        },
      });
      await tx.creatorPayoutStatusChange.create({
        data: { payoutId: row.id, fromStatus: null, toStatus: 'REQUESTED', actorUserId: userId },
      });
      await this.idempotency.complete(tx, {
        userId,
        scope: PAYOUT_IDEMPOTENCY_SCOPE,
        key,
        resultId: row.id,
      });
      return { payout: toPayout(row), replay: false };
    });
  }

  /**
   * The caller's payouts, newest first, keyset-paged on (created_at, id) with the wallet cursor and page size. Read
   * through the Prisma model, so the timestamps round-trip exactly as they were written.
   */
  async list(creatorProfileId: string, cursor?: string): Promise<PayoutPage> {
    if (cursor !== undefined && !ledgerCursorSchema.safeParse(cursor).success) {
      throw new DomainError('VALIDATION_FAILED', {
        issues: [{ path: 'cursor', message: 'Cursor tidak valid.' }],
      });
    }
    const rows = await this.prisma.creatorPayout.findMany({
      where: { creatorProfileId, ...(cursor === undefined ? {} : ledgerCursorWhere(cursor)) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: WALLET_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, WALLET_PAGE_SIZE);
    return {
      items: page.map(toPayout),
      nextCursor: rows.length > WALLET_PAGE_SIZE ? encodeLedgerCursor(page.at(-1)!) : null,
    };
  }

  /**
   * Cancels a payout that is still REQUESTED, which releases its reservation (the balance no longer counts it).
   * Under the same creator lock as a request, so a cancel and a request of the same creator never interleave; the
   * conditional update (only from REQUESTED) means a second or concurrent cancel, or an admin decision in between,
   * can never release the reservation twice. Another creator's payout is the same NOT_FOUND as a missing one.
   */
  async cancel(userId: string, creatorProfileId: string, payoutId: string): Promise<Payout> {
    return this.prisma.$transaction(async (tx) => {
      await lockCreator(tx, creatorProfileId);
      const payout = await tx.creatorPayout.findFirst({
        where: { id: payoutId, creatorProfileId },
      });
      if (!payout) throw new DomainError('NOT_FOUND');
      if (payout.status !== 'REQUESTED') throw new DomainError('PAYOUT_NOT_CANCELABLE');
      const { count } = await tx.creatorPayout.updateMany({
        where: { id: payoutId, status: 'REQUESTED' },
        data: { status: 'CANCELED' },
      });
      if (count !== 1) throw new DomainError('PAYOUT_NOT_CANCELABLE');
      await tx.creatorPayoutStatusChange.create({
        data: {
          payoutId,
          fromStatus: 'REQUESTED',
          toStatus: 'CANCELED',
          actorUserId: userId,
        },
      });
      return toPayout(await tx.creatorPayout.findUniqueOrThrow({ where: { id: payoutId } }));
    });
  }
}
