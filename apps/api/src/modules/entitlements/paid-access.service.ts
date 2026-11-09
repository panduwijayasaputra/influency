import { Injectable } from '@nestjs/common';
import type { PostStatus, PostVisibility } from '@influency/shared';
import { dbNow } from '../../common/db-time.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface PaidAccessPost {
  id: string;
  creatorProfileId: string;
  status: PostStatus;
  visibility: PostVisibility;
}

export interface PaidFacts {
  /** Premium posts of the page the viewer has paid access to (see the sources below). */
  paidPostIds: Set<string>;
  /** Creators the viewer has an active subscription period with right now. */
  subscribedCreatorIds: Set<string>;
}

/**
 * Which premium posts a viewer has paid for. The answer is a fact for `decidePostAccess`, which still decides everything
 * else (status, owner, admin, creator visibility). userId must be `req.authSession?.userId ?? null`. Server time only.
 *
 * Sources, one query each for a whole page of posts:
 * 1. a purchase: permanent, survives an archive;
 * 2. an active subscription period of the creator: every published premium post, including ones published later;
 * 3. the archive grant (spec §4.1): a premium post that is archived now stays open until the end of a period that was
 *    active at the instant of archival. A scheduled or later period never qualifies (it starts after `archivedAt`), and a
 *    new subscriber after the archive has no such period. Republishing closes the episode and normal access resumes.
 */
@Injectable()
export class PaidAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async facts(userId: string | null, posts: readonly PaidAccessPost[]): Promise<PaidFacts> {
    const none: PaidFacts = { paidPostIds: new Set(), subscribedCreatorIds: new Set() };
    const premium = posts.filter(
      (p) => p.visibility === 'PREMIUM' && (p.status === 'PUBLISHED' || p.status === 'ARCHIVED'),
    );
    if (!userId || premium.length === 0) return none;
    const now = await dbNow(this.prisma);
    const creatorIds = [...new Set(premium.map((p) => p.creatorProfileId))];

    const [purchases, periods, episodes] = await Promise.all([
      this.prisma.postPurchase.findMany({
        where: { userId, postId: { in: premium.map((p) => p.id) } },
        select: { postId: true },
      }),
      // Live periods (not cancelled, not ended): enough for both the active check and the archive grant.
      this.prisma.subscriptionPeriod.findMany({
        where: {
          userId,
          creatorProfileId: { in: creatorIds },
          canceledAt: null,
          endsAt: { gt: now },
        },
        select: { creatorProfileId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.postArchiveEpisode.findMany({
        where: {
          postId: { in: premium.filter((p) => p.status === 'ARCHIVED').map((p) => p.id) },
          restoredAt: null,
        },
        select: { postId: true, archivedAt: true },
      }),
    ]);

    const paid = new Set(purchases.map((p) => p.postId));
    const subscribed = new Set(
      periods.filter((p) => p.startsAt <= now).map((p) => p.creatorProfileId),
    );
    const archivedAt = new Map(episodes.map((e) => [e.postId, e.archivedAt]));
    for (const post of premium) {
      if (post.status === 'PUBLISHED' && subscribed.has(post.creatorProfileId)) paid.add(post.id);
      const at = archivedAt.get(post.id);
      if (
        post.status === 'ARCHIVED' &&
        at &&
        periods.some(
          (p) => p.creatorProfileId === post.creatorProfileId && p.startsAt <= at && at < p.endsAt,
        )
      ) {
        paid.add(post.id);
      }
    }
    return { paidPostIds: paid, subscribedCreatorIds: subscribed };
  }

  /**
   * Whether the viewer supports a creator right now: an active subscription period, and/or at least one purchase of one of
   * their posts (spec §6). Server time. This is a fact for the tip rule; it grants no access by itself.
   */
  async supportsCreator(
    userId: string,
    creatorProfileId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<{ activePeriod: boolean; purchase: boolean }> {
    const now = await dbNow(client);
    const [period, purchase] = await Promise.all([
      client.subscriptionPeriod.findFirst({
        where: {
          userId,
          creatorProfileId,
          canceledAt: null,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { id: true },
      }),
      client.postPurchase.findFirst({
        where: { userId, post: { creatorProfileId } },
        select: { id: true },
      }),
    ]);
    return { activePeriod: period !== null, purchase: purchase !== null };
  }

  async paidPostIds(userId: string | null, posts: readonly PaidAccessPost[]): Promise<Set<string>> {
    return (await this.facts(userId, posts)).paidPostIds;
  }
}
