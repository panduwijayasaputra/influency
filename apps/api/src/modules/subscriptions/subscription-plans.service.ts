import { Injectable } from '@nestjs/common';
import {
  type CreatorSubscriptionState,
  type OwnSubscriptionPlanResponse,
  type PutSubscriptionPlanRequest,
  SUBSCRIPTION_DAYS,
  type SubscriptionPeriod,
} from '@influency/shared';
import { toSafeInt } from '../../common/bigint.js';
import { dbNow } from '../../common/db-time.js';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { PaidAccessService } from '../entitlements/paid-access.service.js';
import { isTipEligible } from '../purchases/tip-eligibility.js';

/**
 * Creator subscription plans (purchases US-035). A plan is append-only: every change inserts version + 1 and the current
 * plan is the highest version, so periods bought earlier keep the price they paid (US-037 snapshots the version).
 */
@Injectable()
export class SubscriptionPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paidAccess: PaidAccessService,
  ) {}

  async getOwn(creatorProfileId: string): Promise<OwnSubscriptionPlanResponse> {
    const row = await this.prisma.creatorSubscriptionPlan.findFirst({
      where: { creatorProfileId },
      orderBy: { version: 'desc' },
    });
    return { plan: row && toOwn(row) };
  }

  /** Sets price and active flag. An unchanged request adds no version. creatorProfileId comes from the session only. */
  async putOwn(
    creatorProfileId: string,
    input: PutSubscriptionPlanRequest,
  ): Promise<OwnSubscriptionPlanResponse> {
    const row = await this.prisma.$transaction(async (tx) => {
      // Serialises concurrent edits of one creator, so versions are gap-free and the unique key never trips.
      await tx.$queryRaw`SELECT id FROM creator_profiles WHERE id = ${creatorProfileId}::uuid FOR UPDATE`;
      const latest = await tx.creatorSubscriptionPlan.findFirst({
        where: { creatorProfileId },
        orderBy: { version: 'desc' },
      });
      if (
        latest &&
        Number(latest.priceCoins) === input.priceCoins &&
        latest.active === input.active
      ) {
        return latest;
      }
      return tx.creatorSubscriptionPlan.create({
        data: {
          creatorProfileId,
          version: (latest?.version ?? 0) + 1,
          priceCoins: BigInt(input.priceCoins),
          active: input.active,
        },
      });
    });
    return { plan: toOwn(row) };
  }

  /** The plan buyers get now: the highest version, only if it is active. For callers inside a purchase transaction. */
  async currentActivePlanInTx(
    tx: Prisma.TransactionClient,
    creatorProfileId: string,
  ): Promise<{ id: string; version: number; priceCoins: bigint } | null> {
    const row = await tx.creatorSubscriptionPlan.findFirst({
      where: { creatorProfileId },
      orderBy: { version: 'desc' },
    });
    return row?.active ? { id: row.id, version: row.version, priceCoins: row.priceCoins } : null;
  }

  /** Public plan + the signed-in viewer's state. userId must be `req.authSession?.userId ?? null`. */
  async stateFor(slug: string, userId: string | null): Promise<CreatorSubscriptionState> {
    const creator = await this.prisma.creatorProfile.findFirst({
      where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR },
      select: { id: true, userId: true },
    });
    if (!creator) throw new DomainError('NOT_FOUND');
    const plan = await this.prisma.$transaction((tx) => this.currentActivePlanInTx(tx, creator.id));
    return {
      plan: plan && { priceCoins: toSafeInt(plan.priceCoins), durationDays: SUBSCRIPTION_DAYS },
      viewer: userId ? await this.viewerState(userId, creator.id, creator.userId) : null,
    };
  }

  /** The viewer's live periods for a creator, by server time: the one covering now, and a prepaid future one. */
  private async viewerState(
    userId: string,
    creatorProfileId: string,
    creatorUserId: string,
  ): Promise<NonNullable<CreatorSubscriptionState['viewer']>> {
    const now = await dbNow(this.prisma);
    const live = await this.prisma.subscriptionPeriod.findMany({
      where: { userId, creatorProfileId, canceledAt: null, endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
    });
    const current = live.find((p) => p.startsAt <= now);
    const scheduled = live.find((p) => p.startsAt > now);
    const supports = await this.paidAccess.supportsCreator(userId, creatorProfileId);
    return {
      current: current ? toPeriod(current) : null,
      scheduled: scheduled ? toPeriod(scheduled) : null,
      // Same rule as the tip endpoint (the API checks again on send).
      canTip: isTipEligible({
        isSelf: creatorUserId === userId,
        creatorPublic: true,
        hasActivePeriod: supports.activePeriod,
        hasPurchaseFromCreator: supports.purchase,
      }),
    };
  }
}

function toPeriod(p: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  priceCoins: bigint;
}): SubscriptionPeriod {
  return {
    periodId: p.id,
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt.toISOString(),
    priceCoins: toSafeInt(p.priceCoins),
  };
}

function toOwn(row: {
  version: number;
  priceCoins: bigint;
  active: boolean;
  createdAt: Date;
}): NonNullable<OwnSubscriptionPlanResponse['plan']> {
  return {
    version: row.version,
    priceCoins: toSafeInt(row.priceCoins),
    durationDays: SUBSCRIPTION_DAYS,
    active: row.active,
    updatedAt: row.createdAt.toISOString(),
  };
}
