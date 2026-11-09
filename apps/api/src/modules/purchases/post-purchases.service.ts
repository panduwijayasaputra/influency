import { Injectable } from '@nestjs/common';
import type { PurchasePostResponse } from '@influency/shared';
import { z } from 'zod';
import { toSafeInt } from '../../common/bigint.js';
import { DomainError } from '../../common/domain-error.js';
import { IdempotencyService, requestHash } from '../../common/idempotency.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { FEE_BPS } from '../financial-ledger/split-revenue.js';
import { RevenueLedgerService } from '../financial-ledger/revenue-ledger.service.js';
import { NotificationProducer } from '../notifications/notification-producer.service.js';
import { WalletsService } from '../wallets/wallets.service.js';

export const POST_PURCHASE_IDEMPOTENCY_SCOPE = 'post_purchase';

/**
 * Unlock a premium post with Koin (purchases US-036). One transaction does everything or nothing: the debit with its
 * lot allocations, the permanent purchase row (the entitlement), and the creator/platform revenue rows.
 *
 * Lock order: idempotency key → (user, post) advisory lock + the post row (shared) → wallet → lots.
 * shortcut: no outbox event until notifications (feature #10) adds the outbox table.
 */
@Injectable()
export class PostPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly revenue: RevenueLedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationProducer,
  ) {}

  /** userId must be `req.authSession.userId`. The price comes from the DB offer; the client only confirms what it saw. */
  async purchase(
    userId: string,
    postId: string,
    expectedPriceCoins: number,
    key: string,
  ): Promise<PurchasePostResponse> {
    if (!z.uuid().safeParse(postId).success) throw new DomainError('NOT_FOUND');
    return this.prisma.$transaction(async (tx) => {
      const claim = await this.idempotency.claim(tx, {
        userId,
        scope: POST_PURCHASE_IDEMPOTENCY_SCOPE,
        key,
        requestHash: requestHash({ postId, expectedPriceCoins }),
      });
      if (claim.status === 'replay') {
        if (!claim.resultId) throw new DomainError('REQUEST_IN_PROGRESS');
        return this.owned(tx, userId, claim.resultId);
      }

      // Two requests for one (user, post) run one after the other, whatever their keys.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${postId}`}, 0))`;
      // Shared: concurrent buyers don't wait for each other, but the creator cannot archive or remove it mid-purchase.
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${postId}::uuid FOR SHARE`;
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          status: true,
          visibility: true,
          creatorProfileId: true,
          creatorProfile: {
            select: { userId: true, status: true, user: { select: { status: true } } },
          },
          offers: { orderBy: { version: 'desc' }, take: 1 },
        },
      });
      if (!post || post.status === 'REMOVED') throw new DomainError('NOT_FOUND');

      // Already bought (even if the post is archived since): no second charge, same entitlement.
      const existing = await tx.postPurchase.findUnique({
        where: { userId_postId: { userId, postId } },
        select: { id: true },
      });
      if (existing) {
        await this.idempotency.complete(tx, {
          userId,
          scope: POST_PURCHASE_IDEMPOTENCY_SCOPE,
          key,
          resultId: existing.id,
        });
        return this.owned(tx, userId, existing.id);
      }

      const creator = post.creatorProfile;
      if (creator.userId === userId) throw new DomainError('CANNOT_PURCHASE_OWN');
      const creatorPublic =
        creator.status === PUBLIC_CREATOR.status &&
        creator.user.status === PUBLIC_CREATOR.user.status;
      if (!creatorPublic || !['PUBLISHED', 'ARCHIVED'].includes(post.status)) {
        throw new DomainError('NOT_FOUND');
      }
      const offer = post.offers[0];
      if (post.visibility !== 'PREMIUM' || post.status !== 'PUBLISHED' || !offer) {
        throw new DomainError('POST_NOT_AVAILABLE');
      }
      if (Number(offer.priceCoins) !== expectedPriceCoins) {
        throw new DomainError('OFFER_CHANGED', { priceCoins: toSafeInt(offer.priceCoins) });
      }

      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
      const purchaseId = row!.id;
      const debit = await this.wallets.debitInTx(tx, {
        userId,
        coins: offer.priceCoins,
        entryType: 'POST_PURCHASE_DEBIT',
        sourceType: 'POST_PURCHASE',
        sourceId: purchaseId,
      });
      await tx.postPurchase.create({
        data: {
          id: purchaseId,
          userId,
          postId,
          postOfferId: offer.id,
          priceCoins: offer.priceCoins,
          feeBps: FEE_BPS.POST_PURCHASE,
        },
      });
      await this.revenue.postSaleInTx(tx, {
        creatorProfileId: post.creatorProfileId,
        sourceType: 'POST_PURCHASE',
        sourceId: purchaseId,
        coins: offer.priceCoins,
        feeBps: FEE_BPS.POST_PURCHASE,
        accruesAt: new Date(),
      });
      await this.idempotency.complete(tx, {
        userId,
        scope: POST_PURCHASE_IDEMPOTENCY_SCOPE,
        key,
        resultId: purchaseId,
      });
      // New purchases only (replays returned above). Outbox row; it can never undo the purchase (savepoint).
      await this.notifications.notifyInTx(tx, {
        userId: creator.userId,
        type: 'POST_UNLOCKED',
        dedupeKey: `unlock:${purchaseId}`,
        actorUserId: userId,
        creatorProfileId: post.creatorProfileId,
        postId,
        sourceId: purchaseId,
        coins: offer.priceCoins,
      });
      return {
        purchaseId,
        postId,
        priceCoins: toSafeInt(offer.priceCoins),
        balanceCoins: toSafeInt(debit.balanceCoins),
        alreadyOwned: false,
      };
    });
  }

  /** The response for a purchase this request did not charge (replay, or the user already owned the post). */
  private async owned(
    tx: Prisma.TransactionClient,
    userId: string,
    purchaseId: string,
  ): Promise<PurchasePostResponse> {
    const [purchase, wallet] = await Promise.all([
      tx.postPurchase.findUniqueOrThrow({ where: { id: purchaseId } }),
      tx.coinWallet.findUnique({ where: { userId }, select: { balanceCoins: true } }),
    ]);
    return {
      purchaseId,
      postId: purchase.postId,
      priceCoins: toSafeInt(purchase.priceCoins),
      balanceCoins: toSafeInt(wallet?.balanceCoins ?? 0n),
      alreadyOwned: true,
    };
  }
}
