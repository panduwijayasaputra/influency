import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  type CancelScheduledResponse,
  type SubscribeResponse,
  SUBSCRIPTION_DAYS,
} from '@influency/shared';
import { toSafeInt } from '../../common/bigint.js';
import { dbNow } from '../../common/db-time.js';
import { DomainError } from '../../common/domain-error.js';
import { IdempotencyService, requestHash } from '../../common/idempotency.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { RevenueLedgerService } from '../financial-ledger/revenue-ledger.service.js';
import { FEE_BPS } from '../financial-ledger/split-revenue.js';
import { NotificationProducer } from '../notifications/notification-producer.service.js';
import { WalletsService } from '../wallets/wallets.service.js';
import { SubscriptionPlansService } from './subscription-plans.service.js';

export const SUBSCRIBE_IDEMPOTENCY_SCOPE = 'subscribe';
const PERIOD_MS = SUBSCRIPTION_DAYS * 86_400_000;

/**
 * Subscribe to a creator for 30 days, or prepay the next period early (purchases US-037). Manual only: nothing here ever
 * renews or debits by itself. One transaction does the debit with its lot allocations, the period and the revenue rows.
 *
 * Lock order: idempotency key → creator row (shared; a plan edit waits) → wallet → lots. The wallet lock serialises all
 * spends of this user, so reading their periods afterwards is race-free; the partial unique index is the backstop.
 * shortcut: no outbox event until notifications (feature #10) adds the outbox table.
 */
@Injectable()
export class SubscriptionPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly revenue: RevenueLedgerService,
    private readonly plans: SubscriptionPlansService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationProducer,
  ) {}

  /** userId must be `req.authSession.userId`. The price comes from the DB plan; the client only confirms what it saw. */
  async subscribe(
    userId: string,
    slug: string,
    expectedPriceCoins: number,
    key: string,
  ): Promise<SubscribeResponse> {
    try {
      return await this.prisma.$transaction((tx) =>
        this.subscribeInTx(tx, userId, slug, expectedPriceCoins, key),
      );
    } catch (e) {
      // Only the one-live-period-per-start index can collide here.
      if ((e as { code?: string }).code === 'P2002') {
        throw new DomainError('RENEWAL_ALREADY_SCHEDULED');
      }
      throw e;
    }
  }

  private async subscribeInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    slug: string,
    expectedPriceCoins: number,
    key: string,
  ): Promise<SubscribeResponse> {
    const claim = await this.idempotency.claim(tx, {
      userId,
      scope: SUBSCRIBE_IDEMPOTENCY_SCOPE,
      key,
      requestHash: requestHash({ slug: slug.toLowerCase(), expectedPriceCoins }),
    });
    if (claim.status === 'replay') {
      if (!claim.resultId) throw new DomainError('REQUEST_IN_PROGRESS');
      return this.responseFor(tx, userId, claim.resultId);
    }

    const creator = await tx.creatorProfile.findFirst({
      where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR },
      select: { id: true, userId: true },
    });
    if (!creator) throw new DomainError('NOT_FOUND');
    if (creator.userId === userId) throw new DomainError('CANNOT_PURCHASE_OWN');
    // Shared: subscribers don't wait for each other, but the creator cannot change the plan mid-purchase.
    await tx.$queryRaw`SELECT id FROM creator_profiles WHERE id = ${creator.id}::uuid FOR SHARE`;
    const plan = await this.plans.currentActivePlanInTx(tx, creator.id);
    if (!plan) throw new DomainError('PLAN_NOT_AVAILABLE');
    if (Number(plan.priceCoins) !== expectedPriceCoins) {
      throw new DomainError('OFFER_CHANGED', { priceCoins: toSafeInt(plan.priceCoins) });
    }

    await this.wallets.lockWalletInTx(tx, userId);
    const now = await dbNow(tx);
    const live = await tx.subscriptionPeriod.findMany({
      where: { userId, creatorProfileId: creator.id, canceledAt: null, endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
    });
    if (live.some((p) => p.startsAt > now)) throw new DomainError('RENEWAL_ALREADY_SCHEDULED');
    // An active period: the next one starts exactly when it ends (no overlap, no gap). Otherwise it starts now.
    const active = live.at(-1);
    const startsAt = active ? active.endsAt : now;
    const endsAt = new Date(startsAt.getTime() + PERIOD_MS);

    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
    const periodId = row!.id;
    const debit = await this.wallets.debitInTx(tx, {
      userId,
      coins: plan.priceCoins,
      entryType: 'SUBSCRIPTION_DEBIT',
      sourceType: 'SUBSCRIPTION_PERIOD',
      sourceId: periodId,
    });
    await tx.subscriptionPeriod.create({
      data: {
        id: periodId,
        userId,
        creatorProfileId: creator.id,
        planId: plan.id,
        priceCoins: plan.priceCoins,
        feeBps: FEE_BPS.SUBSCRIPTION,
        durationDays: SUBSCRIPTION_DAYS,
        startsAt,
        endsAt,
      },
    });
    // A prepaid future period earns from its own start, not from the purchase (spec §5).
    await this.revenue.postSaleInTx(tx, {
      creatorProfileId: creator.id,
      sourceType: 'SUBSCRIPTION_PERIOD',
      sourceId: periodId,
      coins: plan.priceCoins,
      feeBps: FEE_BPS.SUBSCRIPTION,
      accruesAt: startsAt,
    });
    await this.idempotency.complete(tx, {
      userId,
      scope: SUBSCRIBE_IDEMPOTENCY_SCOPE,
      key,
      resultId: periodId,
    });
    // Outbox row in the same transaction; it can never undo the subscription (savepoint).
    await this.notifications.notifyInTx(tx, {
      userId: creator.userId,
      type: 'NEW_SUBSCRIBER',
      dedupeKey: `subscription:${periodId}`,
      actorUserId: userId,
      creatorProfileId: creator.id,
      sourceId: periodId,
      coins: plan.priceCoins,
    });
    return {
      periodId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      priceCoins: toSafeInt(plan.priceCoins),
      scheduled: startsAt > now,
      balanceCoins: toSafeInt(debit.balanceCoins),
    };
  }

  /**
   * Cancels a prepaid renewal before it starts and returns all of its Koin, once (spec §5). Lock order: wallet (the same
   * first lock as subscribe, so the two serialise) → the period row. "Started" is decided only by the clock, so the
   * boundary has a single answer: before `starts_at` the period is cancelled and refunded, from then on it is rejected.
   * A repeat on a cancelled period answers the same result without a second credit. userId is the session's.
   */
  async cancelScheduled(userId: string, periodId: string): Promise<CancelScheduledResponse> {
    if (!z.uuid().safeParse(periodId).success) throw new DomainError('NOT_FOUND');
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallets.lockWalletInTx(tx, userId);
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM subscription_periods
        WHERE id = ${periodId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
      if (!locked) throw new DomainError('NOT_FOUND'); // unknown, or someone else's
      const period = await tx.subscriptionPeriod.findUniqueOrThrow({ where: { id: periodId } });
      if (period.canceledAt) {
        return {
          periodId,
          refundedCoins: toSafeInt(period.priceCoins),
          balanceCoins: toSafeInt(wallet.balanceCoins),
        };
      }
      const now = await dbNow(tx);
      if (now >= period.startsAt) throw new DomainError('RENEWAL_ALREADY_STARTED');

      await tx.subscriptionPeriod.update({ where: { id: periodId }, data: { canceledAt: now } });
      const refund = await this.wallets.refundSpendInTx(tx, {
        userId,
        debit: {
          sourceType: 'SUBSCRIPTION_PERIOD',
          sourceId: periodId,
          entryType: 'SUBSCRIPTION_DEBIT',
        },
        creditEntryType: 'SUBSCRIPTION_REFUND_CREDIT',
      });
      await this.revenue.reverseSaleInTx(tx, {
        sourceType: 'SUBSCRIPTION_PERIOD',
        sourceId: periodId,
      });
      return {
        periodId,
        refundedCoins: toSafeInt(refund.refundedCoins),
        balanceCoins: toSafeInt(refund.balanceCoins),
      };
    });
  }

  /** The response for a replay: the stored period, and the balance as it is now. */
  private async responseFor(
    tx: Prisma.TransactionClient,
    userId: string,
    periodId: string,
  ): Promise<SubscribeResponse> {
    const [period, wallet, now] = await Promise.all([
      tx.subscriptionPeriod.findUniqueOrThrow({ where: { id: periodId } }),
      tx.coinWallet.findUnique({ where: { userId }, select: { balanceCoins: true } }),
      dbNow(tx),
    ]);
    return {
      periodId,
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
      priceCoins: toSafeInt(period.priceCoins),
      scheduled: period.startsAt > now,
      balanceCoins: toSafeInt(wallet?.balanceCoins ?? 0n),
    };
  }
}
