import { Inject, Injectable } from '@nestjs/common';
import {
  type CreatePostInput,
  isPostEditable,
  POST_EDITABLE_STATUSES,
  type PostStatus,
  type PostVisibility,
  SECONDS_PER_DAY,
  type SetPostOfferInput,
  type StudioPost,
  type UpdatePostInput,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Post, PostOffer, Prisma } from '../../generated/prisma/client.js';

/** Joins only the current (highest) offer version. */
export const currentOffer = { offers: { orderBy: { version: 'desc' }, take: 1 } } as const;

function toStudioPost(row: Post & { offers: PostOffer[] }): StudioPost {
  const offer = row.offers[0];
  return {
    id: row.id,
    caption: row.caption,
    visibility: row.visibility,
    status: row.status,
    offer: offer
      ? {
          version: offer.version,
          // Number() is exact: the API caps prices at POST_OFFER_MAX_PRICE_COINS, far below 2^53.
          priceCoins: Number(offer.priceCoins),
          durationSeconds: offer.durationSeconds,
          createdAt: offer.createdAt.toISOString(),
        }
      : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Studio posts. Every query is scoped to the caller's creator profile: another creator's id is NOT_FOUND. */
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Status comes from the DB default (DRAFT). */
  async create(creatorProfileId: string, input: CreatePostInput): Promise<StudioPost> {
    const row = await this.prisma.post.create({
      data: { creatorProfileId, caption: input.caption, visibility: input.visibility },
      include: currentOffer,
    });
    return toStudioPost(row);
  }

  async list(creatorProfileId: string): Promise<StudioPost[]> {
    // shortcut: no pagination, add cursor pagination when creators exceed ~100 posts.
    const rows = await this.prisma.post.findMany({
      where: { creatorProfileId },
      include: currentOffer,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toStudioPost);
  }

  async get(creatorProfileId: string, id: string): Promise<StudioPost> {
    const row = await this.prisma.post.findFirst({
      where: { id, creatorProfileId },
      include: currentOffer,
    });
    if (!row) throw new DomainError('NOT_FOUND');
    return toStudioPost(row);
  }

  /** One owner-scoped conditional write, so there is no read-then-write window. */
  async update(creatorProfileId: string, id: string, input: UpdatePostInput): Promise<StudioPost> {
    const where: Prisma.PostWhereInput = { id, creatorProfileId };
    // Live posts only allow caption edits; resending the current visibility (the studio form always sends it) is fine.
    if (input.visibility !== undefined) {
      where.OR = [
        { status: { in: [...POST_EDITABLE_STATUSES] } },
        { visibility: input.visibility },
      ];
    }
    const { count } = await this.prisma.post.updateMany({ where, data: input });
    if (count === 0) {
      await this.get(creatorProfileId, id); // NOT_FOUND when foreign or unknown
      throw new DomainError('POST_LOCKED');
    }
    return this.get(creatorProfileId, id);
  }

  /**
   * DRAFT/HIDDEN → PUBLISHED (or PENDING_REVIEW when moderation is on), under the post-row lock so media deletes and
   * visibility changes can't slip past the checks.
   */
  async publish(creatorProfileId: string, id: string): Promise<StudioPost> {
    await this.prisma.$transaction(async (tx) => {
      const post = await this.lockPost(tx, creatorProfileId, id);
      if (!isPostEditable(post.status)) throw new DomainError('POST_STATUS_CONFLICT');
      const [ready, processing] = await Promise.all([
        tx.mediaAsset.count({ where: { postId: id, status: 'READY' } }),
        tx.mediaAsset.count({ where: { postId: id, status: 'PROCESSING' } }),
      ]);
      if (ready === 0) throw new DomainError('MEDIA_REQUIRED');
      if (processing > 0) throw new DomainError('MEDIA_PROCESSING');
      if (
        post.visibility === 'PREMIUM' &&
        !(await tx.postOffer.findFirst({ where: { postId: id }, select: { id: true } }))
      ) {
        throw new DomainError('OFFER_REQUIRED');
      }
      await tx.post.update({
        where: { id },
        data: {
          status: this.env.POST_MODERATION_REQUIRED ? 'PENDING_REVIEW' : 'PUBLISHED',
          // Keeps the first publish time, so a re-published hidden post keeps its feed position.
          publishedAt: post.publishedAt ?? new Date(),
        },
      });
    });
    return this.get(creatorProfileId, id);
  }

  /** PUBLISHED/PENDING_REVIEW → HIDDEN in one conditional write. */
  async hide(creatorProfileId: string, id: string): Promise<StudioPost> {
    const { count } = await this.prisma.post.updateMany({
      where: { id, creatorProfileId, status: { in: ['PUBLISHED', 'PENDING_REVIEW'] } },
      data: { status: 'HIDDEN' },
    });
    if (count === 0) {
      await this.get(creatorProfileId, id); // NOT_FOUND when foreign or unknown
      throw new DomainError('POST_STATUS_CONFLICT');
    }
    return this.get(creatorProfileId, id);
  }

  /** Appends a new offer version under the post-row lock; identical terms keep the current version. */
  async setOffer(
    creatorProfileId: string,
    id: string,
    input: SetPostOfferInput,
  ): Promise<StudioPost> {
    const priceCoins = BigInt(input.priceCoins);
    const durationSeconds = input.durationDays * SECONDS_PER_DAY;
    await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent edits so each one reads the latest committed version.
      const post = await this.lockPost(tx, creatorProfileId, id);
      if (post.visibility !== 'PREMIUM') throw new DomainError('OFFER_REQUIRES_PREMIUM');
      const latest = await tx.postOffer.findFirst({
        where: { postId: id },
        orderBy: { version: 'desc' },
      });
      if (latest?.priceCoins === priceCoins && latest.durationSeconds === durationSeconds) return;
      await tx.postOffer.create({
        data: { postId: id, version: (latest?.version ?? 0) + 1, priceCoins, durationSeconds },
      });
    });
    return this.get(creatorProfileId, id);
  }

  /** Locks the owned post row (SELECT … FOR UPDATE); NOT_FOUND when foreign or unknown. */
  private async lockPost(tx: Prisma.TransactionClient, creatorProfileId: string, id: string) {
    const rows = await tx.$queryRaw<
      { status: PostStatus; visibility: PostVisibility; publishedAt: Date | null }[]
    >`
      SELECT status::text AS status, visibility::text AS visibility, published_at AS "publishedAt"
      FROM posts
      WHERE id = ${id}::uuid AND creator_profile_id = ${creatorProfileId}::uuid
      FOR UPDATE`;
    if (rows.length === 0) throw new DomainError('NOT_FOUND');
    return rows[0]!;
  }
}
