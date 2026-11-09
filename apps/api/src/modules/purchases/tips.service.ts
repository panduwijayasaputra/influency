import { Injectable } from '@nestjs/common';
import type { TipResponse } from '@influency/shared';
import { z } from 'zod';
import { toSafeInt } from '../../common/bigint.js';
import { DomainError } from '../../common/domain-error.js';
import { IdempotencyService, requestHash } from '../../common/idempotency.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { PaidAccessService } from '../entitlements/paid-access.service.js';
import { RevenueLedgerService } from '../financial-ledger/revenue-ledger.service.js';
import { FEE_BPS } from '../financial-ledger/split-revenue.js';
import { NotificationProducer } from '../notifications/notification-producer.service.js';
import { WalletsService } from '../wallets/wallets.service.js';
import { isTipEligible } from './tip-eligibility.js';

export const TIP_IDEMPOTENCY_SCOPE = 'tip';

type Target = { kind: 'creator'; slug: string } | { kind: 'post'; postId: string };

/**
 * Tip a creator (purchases US-039): from their profile, or from a premium post the tipper can open by paying. All of it
 * goes to the creator (fee 0%), and a tip never creates or extends an entitlement or a subscription period.
 *
 * One transaction. Lock order: idempotency key → creator row (shared) → wallet → lots. Eligibility is checked again here,
 * at commit time, whatever the UI showed. There is no natural unique key for a repeatable tip, so duplicates are stopped
 * by the required Idempotency-Key; the ledger's unique source key keeps each tip's debit single.
 * shortcut: only the rate limit guards against rapid micro-tips; structured-tipping review is an open item (spec §6).
 * shortcut: no outbox event until notifications (feature #10) adds the outbox table.
 */
@Injectable()
export class TipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly revenue: RevenueLedgerService,
    private readonly paidAccess: PaidAccessService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationProducer,
  ) {}

  tipCreator(userId: string, slug: string, amountCoins: number, key: string): Promise<TipResponse> {
    return this.tip(userId, { kind: 'creator', slug: slug.toLowerCase() }, amountCoins, key);
  }

  tipPost(userId: string, postId: string, amountCoins: number, key: string): Promise<TipResponse> {
    if (!z.uuid().safeParse(postId).success) throw new DomainError('NOT_FOUND');
    return this.tip(userId, { kind: 'post', postId }, amountCoins, key);
  }

  private tip(
    userId: string,
    target: Target,
    amountCoins: number,
    key: string,
  ): Promise<TipResponse> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await this.idempotency.claim(tx, {
        userId,
        scope: TIP_IDEMPOTENCY_SCOPE,
        key,
        requestHash: requestHash({ target, amountCoins }),
      });
      if (claim.status === 'replay') {
        if (!claim.resultId) throw new DomainError('REQUEST_IN_PROGRESS');
        return this.responseFor(tx, userId, claim.resultId);
      }

      const { creatorProfileId, creatorUserId, postId } = await this.resolve(tx, target);
      // Shared: tippers don't wait for each other, but the creator cannot be changed under the tip.
      await tx.$queryRaw`SELECT id FROM creator_profiles WHERE id = ${creatorProfileId}::uuid FOR SHARE`;
      await this.wallets.lockWalletInTx(tx, userId);

      const supports = await this.paidAccess.supportsCreator(userId, creatorProfileId, tx);
      const eligible = isTipEligible({
        isSelf: creatorUserId === userId,
        creatorPublic: true, // resolve() only returns public creators
        hasActivePeriod: supports.activePeriod,
        hasPurchaseFromCreator: supports.purchase,
      });
      if (!eligible) throw new DomainError('TIP_NOT_ALLOWED');
      if (postId) {
        // A post tip also needs paid access to that very post (a purchase or an active subscription).
        const facts = await this.paidAccess.facts(userId, [
          { id: postId, creatorProfileId, status: 'PUBLISHED', visibility: 'PREMIUM' },
        ]);
        if (!facts.paidPostIds.has(postId)) throw new DomainError('TIP_NOT_ALLOWED');
      }

      const coins = BigInt(amountCoins);
      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
      const tipId = row!.id;
      const debit = await this.wallets.debitInTx(tx, {
        userId,
        coins,
        entryType: 'TIP_DEBIT',
        sourceType: 'TIP',
        sourceId: tipId,
      });
      await tx.tip.create({
        data: { id: tipId, userId, creatorProfileId, postId: postId ?? null, amountCoins: coins },
      });
      // Fee 0%: one CREATOR row of amount × Rp1.000 and no PLATFORM row.
      await this.revenue.postSaleInTx(tx, {
        creatorProfileId,
        sourceType: 'TIP',
        sourceId: tipId,
        coins,
        feeBps: FEE_BPS.TIP,
        accruesAt: new Date(),
      });
      await this.idempotency.complete(tx, {
        userId,
        scope: TIP_IDEMPOTENCY_SCOPE,
        key,
        resultId: tipId,
      });
      // Outbox row in the same transaction; it can never undo the tip (savepoint).
      await this.notifications.notifyInTx(tx, {
        userId: creatorUserId,
        type: 'TIP_RECEIVED',
        dedupeKey: `tip:${tipId}`,
        actorUserId: userId,
        creatorProfileId,
        postId: postId ?? undefined,
        sourceId: tipId,
        coins,
      });
      return { tipId, amountCoins, balanceCoins: toSafeInt(debit.balanceCoins) };
    });
  }

  /** The tipped creator, and the post for a post tip (premium and published, of a public creator), or NOT_FOUND / TIP_NOT_ALLOWED. */
  private async resolve(
    tx: Prisma.TransactionClient,
    target: Target,
  ): Promise<{ creatorProfileId: string; creatorUserId: string; postId?: string }> {
    if (target.kind === 'creator') {
      const creator = await tx.creatorProfile.findFirst({
        where: { slug: target.slug, ...PUBLIC_CREATOR },
        select: { id: true, userId: true },
      });
      if (!creator) throw new DomainError('NOT_FOUND');
      return { creatorProfileId: creator.id, creatorUserId: creator.userId };
    }
    const post = await tx.post.findUnique({
      where: { id: target.postId },
      select: {
        id: true,
        status: true,
        visibility: true,
        creatorProfileId: true,
        creatorProfile: {
          select: { userId: true, status: true, user: { select: { status: true } } },
        },
      },
    });
    const c = post?.creatorProfile;
    const creatorPublic =
      c !== undefined &&
      c.status === PUBLIC_CREATOR.status &&
      c.user.status === PUBLIC_CREATOR.user.status;
    if (
      !post ||
      !c ||
      !creatorPublic ||
      ['REMOVED', 'DRAFT', 'PROCESSING', 'PENDING_REVIEW'].includes(post.status)
    ) {
      throw new DomainError('NOT_FOUND');
    }
    // Tips are only for premium posts the tipper paid for, not for free or archived ones.
    if (post.visibility !== 'PREMIUM' || post.status !== 'PUBLISHED') {
      throw new DomainError('TIP_NOT_ALLOWED');
    }
    return { creatorProfileId: post.creatorProfileId, creatorUserId: c.userId, postId: post.id };
  }

  /** The response for a replay: the stored tip, and the balance as it is now. */
  private async responseFor(
    tx: Prisma.TransactionClient,
    userId: string,
    tipId: string,
  ): Promise<TipResponse> {
    const [tip, wallet] = await Promise.all([
      tx.tip.findUniqueOrThrow({ where: { id: tipId } }),
      tx.coinWallet.findUnique({ where: { userId }, select: { balanceCoins: true } }),
    ]);
    return {
      tipId,
      amountCoins: toSafeInt(tip.amountCoins),
      balanceCoins: toSafeInt(wallet?.balanceCoins ?? 0n),
    };
  }
}
