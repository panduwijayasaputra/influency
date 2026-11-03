import { Inject, Injectable } from '@nestjs/common';
import {
  API_PREFIX,
  type CreatePostInput,
  isPostEditable,
  POST_EDITABLE_STATUSES,
  type PostStatus,
  type PostVisibility,
  type SetPostOfferInput,
  type StudioPost,
  type UpdatePostInput,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Post, PostOffer, Prisma } from '../../generated/prisma/client.js';

/** Generated cover previews (US-048): `post-previews/<uuid>`; the uuid is the only part ever put in a URL. */
export const PREVIEW_KEY_PREFIX = 'post-previews/';
export const previewId = (key: string): string => key.slice(PREVIEW_KEY_PREFIX.length);

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
          // Number() is exact: a DB CHECK caps prices at 1,000 Koin, far below 2^53.
          priceCoins: Number(offer.priceCoins),
          createdAt: offer.createdAt.toISOString(),
        }
      : null,
    cover: row.previewKey
      ? {
          mediaId: row.coverMediaId,
          // ?v= only busts the browser cache when the cover changes.
          previewUrl: `/${API_PREFIX}/creators/me/posts/${row.id}/cover/preview?v=${previewId(row.previewKey)}`,
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
   * DRAFT → PUBLISHED (or PENDING_REVIEW when moderation is on), under the post-row lock so media deletes and
   * visibility changes can't slip past the checks.
   */
  async publish(creatorProfileId: string, id: string): Promise<StudioPost> {
    await this.prisma.$transaction(async (tx) => {
      const post = await lockPost(tx, creatorProfileId, id);
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
          publishedAt: post.publishedAt ?? new Date(),
        },
      });
    });
    return this.get(creatorProfileId, id);
  }

  /** PUBLISHED → ARCHIVED and opens an archive episode, under the post-row lock. Never touches media. */
  async archive(creatorProfileId: string, id: string): Promise<StudioPost> {
    await this.prisma.$transaction(async (tx) => {
      const post = await lockPost(tx, creatorProfileId, id);
      if (post.status !== 'PUBLISHED') throw new DomainError('POST_STATUS_CONFLICT');
      await tx.post.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await tx.postArchiveEpisode.create({ data: { postId: id } });
    });
    return this.get(creatorProfileId, id);
  }

  /** ARCHIVED → PUBLISHED and closes the open episode. No publish re-checks: the post was published and stayed locked. */
  async restore(creatorProfileId: string, id: string): Promise<StudioPost> {
    await this.prisma.$transaction(async (tx) => {
      const post = await lockPost(tx, creatorProfileId, id);
      if (post.status !== 'ARCHIVED') throw new DomainError('POST_STATUS_CONFLICT');
      await tx.post.update({ where: { id }, data: { status: 'PUBLISHED' } });
      // DB clock, like archived_at's default, so the restored_at >= archived_at CHECK can't trip on app clock skew.
      await tx.$executeRaw`
        UPDATE post_archive_episodes SET restored_at = now()
        WHERE post_id = ${id}::uuid AND restored_at IS NULL`;
    });
    return this.get(creatorProfileId, id);
  }

  /** Appends a new offer version under the post-row lock; the same price keeps the current version. */
  async setOffer(
    creatorProfileId: string,
    id: string,
    input: SetPostOfferInput,
  ): Promise<StudioPost> {
    const priceCoins = BigInt(input.priceCoins);
    await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent edits so each one reads the latest committed version.
      const post = await lockPost(tx, creatorProfileId, id);
      if (post.visibility !== 'PREMIUM') throw new DomainError('OFFER_REQUIRES_PREMIUM');
      const latest = await tx.postOffer.findFirst({
        where: { postId: id },
        orderBy: { version: 'desc' },
      });
      if (latest?.priceCoins === priceCoins) return;
      await tx.postOffer.create({
        data: { postId: id, version: (latest?.version ?? 0) + 1, priceCoins },
      });
    });
    return this.get(creatorProfileId, id);
  }
}

/** Locks the owned post row (SELECT … FOR UPDATE); NOT_FOUND when foreign or unknown. */
export async function lockPost(tx: Prisma.TransactionClient, creatorProfileId: string, id: string) {
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

/** Admin variant (US-042): locks any post row by id (SELECT … FOR UPDATE); NOT_FOUND when unknown. */
export async function lockAnyPost(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ status: PostStatus }[]>`
    SELECT status::text AS status FROM posts WHERE id = ${id}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new DomainError('NOT_FOUND');
  return rows[0]!;
}
